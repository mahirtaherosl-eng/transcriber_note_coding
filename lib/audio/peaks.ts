import { EOL } from "node:os";
import { spawnBinary, requireBinary } from "@/lib/audio/ffmpeg";

export const PEAKS_VERSION = 1;
export const PEAK_SAMPLE_RATE = 8000;
export const TARGET_BUCKETS = 16000;

export type PeaksFile = {
  version: number;
  durationMs: number;
  sampleRate: number;
  bucketCount: number;
  /** Interleaved min,max pairs in [-1, 1]. */
  peaks: number[];
};

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Streams mono PCM from ffmpeg and computes min/max buckets without ever holding
 * the whole decoded file in memory. Roughly 16k buckets even for a four-hour file.
 */
export async function generatePeaks(filePath: string, durationMs: number): Promise<PeaksFile> {
  const binary = requireBinary("ffmpeg");
  const totalSamples = Math.max(1, Math.round((durationMs / 1000) * PEAK_SAMPLE_RATE));
  const bucketCount = Math.max(1, Math.min(TARGET_BUCKETS, totalSamples));
  const samplesPerBucket = totalSamples / bucketCount;

  const mins = new Float32Array(bucketCount).fill(1);
  const maxs = new Float32Array(bucketCount).fill(-1);
  const filled = new Uint8Array(bucketCount);

  const child = spawnBinary(binary, [
    "-v",
    "error",
    "-i",
    filePath,
    "-ac",
    "1",
    "-ar",
    String(PEAK_SAMPLE_RATE),
    "-f",
    "s16le",
    "-",
  ]);

  let sampleIndex = 0;
  let leftover: Buffer | null = null;
  let stderr = "";

  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
    if (stderr.length > 8000) stderr = stderr.slice(-4000);
  });

  const consume = (samples: Int16Array) => {
    let i = 0;
    while (i < samples.length) {
      const bucket = Math.min(
        bucketCount - 1,
        Math.floor(sampleIndex / samplesPerBucket),
      );
      const bucketRemaining = Math.ceil((bucket + 1) * samplesPerBucket - sampleIndex);
      const end = Math.min(samples.length, i + Math.max(1, bucketRemaining));

      let min = mins[bucket];
      let max = maxs[bucket];
      for (; i < end; i += 1, sampleIndex += 1) {
        const value = samples[i] / 32768;
        if (value < min) min = value;
        if (value > max) max = value;
      }
      mins[bucket] = min;
      maxs[bucket] = max;
      filled[bucket] = 1;
    }
  };

  await new Promise<void>((resolve, reject) => {
    child.stdout?.on("data", (chunk: Buffer) => {
      let buffer = chunk;
      if (leftover) {
        buffer = Buffer.concat([leftover, chunk]);
      }
      const usableBytes = buffer.length - (buffer.length % 2);
      leftover = usableBytes === buffer.length ? null : buffer.subarray(usableBytes);

      if (usableBytes > 0) {
        const copy = Buffer.from(buffer.subarray(0, usableBytes));
        consume(new Int16Array(copy.buffer, copy.byteOffset, copy.byteLength / 2));
      }
    });

    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg failed while generating waveform peaks.${EOL}${stderr}`));
        return;
      }
      resolve();
    });
  });

  const peaks: number[] = new Array(bucketCount * 2);
  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    if (!filled[bucket]) {
      peaks[bucket * 2] = 0;
      peaks[bucket * 2 + 1] = 0;
    } else {
      peaks[bucket * 2] = round3(Math.max(-1, mins[bucket]));
      peaks[bucket * 2 + 1] = round3(Math.min(1, maxs[bucket]));
    }
  }

  return {
    version: PEAKS_VERSION,
    durationMs,
    sampleRate: PEAK_SAMPLE_RATE,
    bucketCount,
    peaks,
  };
}
