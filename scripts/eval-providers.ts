import { readFile } from "node:fs/promises";
import { probeAudio } from "@/lib/audio/probe";
import { getProvider } from "@/lib/providers";
import { isProviderId, type ProviderId } from "@/lib/providers/ids";
import { buildTranscript } from "@/lib/transcript/build";
import type { Job } from "@/lib/transcript/schema";

// tsx does not load .env.local automatically; Settings keys come from the file store.
try {
  process.loadEnvFile(".env.local");
} catch {
  // .env.local is optional.
}

function option(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((argument) => argument.startsWith(prefix));
  return found?.slice(prefix.length);
}

function normalize(value: string, splitWords: boolean): string[] {
  const cleaned = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[.,!?;:，。！？；：、"'“”‘’()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return [];
  return splitWords ? cleaned.split(" ") : Array.from(cleaned.replace(/\s+/g, ""));
}

function editDistance(a: string[], b: string[]): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }

  return previous[b.length];
}

function errorRate(reference: string[], hypothesis: string[]): number {
  if (reference.length === 0) return 0;
  return editDistance(reference, hypothesis) / reference.length;
}

async function main() {
  const audioPath = process.argv[2];
  if (!audioPath || audioPath.startsWith("--")) {
    console.error(
      "Usage: npm run eval -- <audio file> [--providers=mock,elevenlabs] [--language=auto] [--reference=transcript.txt]",
    );
    process.exit(1);
  }

  const requestedIds = (option("providers") ?? "mock")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const unknownIds = requestedIds.filter((id) => !isProviderId(id));
  if (unknownIds.length > 0) {
    console.error(
      `Unknown provider(s): ${unknownIds.join(", ")}. Available: openrouter, elevenlabs, gemini, mock.`,
    );
    process.exit(1);
  }
  const providerIds = requestedIds as ProviderId[];
  const language = option("language") ?? "auto";
  const referencePath = option("reference");
  const reference = referencePath ? await readFile(referencePath, "utf8") : null;
  const probe = await probeAudio(audioPath);

  const timestamp = new Date().toISOString();
  const job: Job = {
    id: "eval",
    status: "completed",
    title: "Eval",
    fileName: audioPath,
    mimeType: "audio/wav",
    sizeBytes: 0,
    durationMs: probe.durationMs,
    language,
    provider: "mock",
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  console.log(
    `Audio: ${(probe.durationMs / 1000).toFixed(1)}s · language: ${language} · providers: ${providerIds.join(", ")}\n`,
  );

  for (const id of providerIds) {
    const provider = getProvider(id);
    const started = Date.now();
    try {
      const result = await provider.transcribe(
        {
          audioPath,
          fileName: audioPath,
          mimeType: "audio/wav",
          durationSec: probe.durationMs / 1000,
          language,
        },
        { signal: AbortSignal.timeout(30 * 60 * 1000) },
      );
      const transcript = buildTranscript(job, result);
      const text = transcript.segments.map((segment) => segment.text).join(" ");
      const elapsed = ((Date.now() - started) / 1000).toFixed(1);

      let metrics = "";
      if (reference) {
        const words = normalize(reference, true);
        const chars = normalize(reference, false);
        const hypothesisWords = normalize(text, true);
        const hypothesisChars = normalize(text, false);
        metrics = ` · WER ${(errorRate(words, hypothesisWords) * 100).toFixed(1)}% · CER ${(
          errorRate(chars, hypothesisChars) * 100
        ).toFixed(1)}%`;
      }

      console.log(
        `${id.padEnd(12)} ${elapsed}s · ${transcript.segments.length} segments · ${transcript.speakers.length} speakers · ${text.length} chars${metrics}`,
      );
      console.log(`  ${text.slice(0, 180)}${text.length > 180 ? "…" : ""}\n`);
    } catch (error) {
      console.log(`${id.padEnd(12)} failed: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
