import { promises as fs } from "node:fs";
import path from "node:path";
import { generatePeaks } from "@/lib/audio/peaks";
import { probeAudio } from "@/lib/audio/probe";
import { requireBinary, runBinary } from "@/lib/audio/ffmpeg";
import { createJob } from "@/lib/jobs/store";
import { mockProvider } from "@/lib/providers/mock";
import { buildTranscript } from "@/lib/transcript/build";
import type { Job } from "@/lib/transcript/schema";
import {
  atomicWriteJson,
  ensureLibraryDir,
  hashFile,
  newId,
  peaksPath,
  writeTranscript,
} from "@/lib/storage";

const DURATION_SECONDS = 45;
const FILE_NAME = "demo-conversation.wav";

async function main() {
  const id = newId();
  const directory = await ensureLibraryDir(id);
  const destination = path.join(directory, `original${path.extname(FILE_NAME)}`);

  console.log("Generating demo audio…");
  await runBinary(
    requireBinary("ffmpeg"),
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=220:duration=${DURATION_SECONDS}`,
      "-af",
      "volume='0.18+0.12*sin(2*PI*t*0.6)':eval=frame",
      "-ac",
      "1",
      "-ar",
      "16000",
      destination,
    ],
    120_000,
  );

  const probe = await probeAudio(destination);
  const timestamp = new Date().toISOString();
  const stats = await fs.stat(destination);

  const job: Job = {
    id,
    status: "completed",
    title: "Demo conversation",
    fileName: FILE_NAME,
    mimeType: "audio/wav",
    sizeBytes: stats.size,
    durationMs: probe.durationMs,
    language: "auto",
    provider: "mock",
    model: "mock-v1",
    audioFile: `original${path.extname(FILE_NAME)}`,
    sha256: await hashFile(destination),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await createJob(job);

  const result = await mockProvider.transcribe(
    {
      audioPath: destination,
      fileName: FILE_NAME,
      mimeType: "audio/wav",
      durationSec: probe.durationMs / 1000,
      language: "auto",
    },
    { signal: AbortSignal.timeout(30_000) },
  );

  const transcript = buildTranscript(job, result);
  await writeTranscript(transcript);

  console.log("Computing waveform peaks…");
  const peaks = await generatePeaks(destination, probe.durationMs);
  await atomicWriteJson(peaksPath(id), peaks);

  console.log(`\nFixture ready: http://127.0.0.1:3000/c/${id}`);
  console.log(`Transcript:    ${transcript.segments.length} segments, ${transcript.speakers.length} speakers\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
