import { generatePeaks } from "@/lib/audio/peaks";
import { probeAudio } from "@/lib/audio/probe";
import { getProvider } from "@/lib/providers";
import { buildTranscript } from "@/lib/transcript/build";
import { patchJob, readJob } from "@/lib/jobs/store";
import {
  atomicWriteJson,
  findAudioFile,
  listJobs,
  peaksPath,
  rawPath,
  writeTranscript,
} from "@/lib/storage";

type QueueState = {
  chain: Promise<void>;
  running: Set<string>;
  controllers: Map<string, AbortController>;
  reconciled: boolean;
};

const globalScope = globalThis as typeof globalThis & {
  __transcriberQueue?: QueueState;
};

const state: QueueState =
  globalScope.__transcriberQueue ??
  (globalScope.__transcriberQueue = {
    chain: Promise.resolve(),
    running: new Set(),
    controllers: new Map(),
    reconciled: false,
  });

/**
 * Called on the first queue access after a (re)start. Running jobs from a dead
 * process become `interrupted`; they are never resumed automatically because an
 * ambiguous network failure may already have been billed. Queued jobs are safe
 * to resume.
 */
async function reconcile(): Promise<void> {
  if (state.reconciled) return;
  state.reconciled = true;

  let jobs;
  try {
    jobs = await listJobs();
  } catch {
    return;
  }

  for (const job of jobs) {
    if (job.status === "processing" && !state.running.has(job.id)) {
      await patchJob(job.id, {
        status: "interrupted",
        error: "The server restarted while this transcription was running. Retry to start it again.",
        progress: undefined,
      });
    } else if (job.status === "queued" && !state.running.has(job.id)) {
      enqueue(job.id);
    }
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "AbortError") return "Transcription was cancelled.";
    return error.message;
  }
  return String(error);
}

async function runJob(id: string): Promise<void> {
  await reconcile();

  const job = await readJob(id);
  if (!job || job.status !== "queued") return;
  if (state.running.has(id)) return;

  state.running.add(id);
  const controller = new AbortController();
  state.controllers.set(id, controller);
  let heartbeat: NodeJS.Timeout | null = null;

  try {
    await patchJob(id, {
      status: "processing",
      error: undefined,
      progress: "Preparing audio",
      heartbeatAt: new Date().toISOString(),
    });

    heartbeat = setInterval(() => {
      void patchJob(id, { heartbeatAt: new Date().toISOString() }).catch(() => undefined);
    }, 10_000);

    const audioFile = await findAudioFile(job);
    if (!audioFile) {
      throw new Error("The audio file for this transcription is missing.");
    }

    let durationMs = job.durationMs;
    if (!durationMs) {
      const probe = await probeAudio(audioFile);
      durationMs = probe.durationMs;
      await patchJob(id, { durationMs });
    }

    const provider = getProvider(job.provider);
    const result = await provider.transcribe(
      {
        audioPath: audioFile,
        fileName: job.fileName,
        mimeType: job.mimeType,
        durationSec: durationMs / 1000,
        language: job.language,
        numSpeakers: job.numSpeakers,
      },
      {
        signal: controller.signal,
        onProgress: (phase) => {
          void patchJob(id, { progress: phase }).catch(() => undefined);
        },
      },
    );

    // The user may have deleted the transcription while the provider was working.
    if (!(await readJob(id))) return;

    await atomicWriteJson(rawPath(id), result.raw);

    const refreshed = (await readJob(id)) ?? { ...job, durationMs };
    const transcript = buildTranscript({ ...refreshed, durationMs }, result);
    await writeTranscript(transcript);

    // Best effort: the peaks route can regenerate this on demand if it fails.
    try {
      const peaks = await generatePeaks(audioFile, durationMs);
      await atomicWriteJson(peaksPath(id), peaks);
    } catch (error) {
      console.warn("Peak generation failed:", describeError(error));
    }

    await patchJob(id, {
      status: "completed",
      durationMs,
      model: result.model,
      progress: undefined,
      error: undefined,
      heartbeatAt: undefined,
    });
  } catch (error) {
    const aborted = controller.signal.aborted;
    const current = await readJob(id);
    const wasCancelled = current?.status === "cancelled";

    await patchJob(id, {
      status: aborted || wasCancelled ? "cancelled" : "failed",
      error: aborted || wasCancelled ? "Transcription was cancelled." : describeError(error),
      progress: undefined,
      heartbeatAt: undefined,
    });
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    state.controllers.delete(id);
    state.running.delete(id);
  }
}

export function enqueue(id: string): void {
  state.chain = state.chain
    .then(() => runJob(id))
    .catch((error) => {
      console.error("Transcription queue error:", error);
    });
}

export async function cancelJob(id: string): Promise<void> {
  const controller = state.controllers.get(id);
  if (controller) {
    controller.abort();
    return;
  }
  await patchJob(id, {
    status: "cancelled",
    error: "Transcription was cancelled.",
    progress: undefined,
  });
}

export async function retryJob(id: string): Promise<boolean> {
  const job = await readJob(id);
  if (!job) return false;
  if (job.status === "processing" || job.status === "queued") return false;

  await patchJob(id, {
    status: "queued",
    error: undefined,
    progress: "Queued",
    heartbeatAt: undefined,
  });
  enqueue(id);
  return true;
}
