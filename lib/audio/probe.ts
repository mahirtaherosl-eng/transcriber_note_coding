import { FFPROBE_PATH, requireBinary, runBinary } from "@/lib/audio/ffmpeg";

export type ProbeResult = {
  durationMs: number;
  formatName: string;
  codec: string | null;
  sampleRate: number | null;
  channels: number | null;
};

type FfprobeStream = {
  codec_type?: string;
  codec_name?: string;
  duration?: string;
  sample_rate?: string;
  channels?: number;
};

type FfprobeOutput = {
  streams?: FfprobeStream[];
  format?: { duration?: string; format_name?: string };
};

export async function probeAudio(filePath: string): Promise<ProbeResult> {
  const binary = requireBinary("ffprobe");
  const { stdout } = await runBinary(
    binary,
    [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      filePath,
    ],
    60_000,
  );

  let parsed: FfprobeOutput;
  try {
    parsed = JSON.parse(stdout) as FfprobeOutput;
  } catch {
    throw new Error("The audio file could not be read (ffprobe returned invalid output).");
  }

  const audioStream = parsed.streams?.find((stream) => stream.codec_type === "audio");
  if (!audioStream) {
    throw new Error("This file has no audio track.");
  }

  const rawDuration =
    Number(parsed.format?.duration) || Number(audioStream.duration) || 0;
  if (!Number.isFinite(rawDuration) || rawDuration <= 0) {
    throw new Error("Could not determine the audio duration.");
  }

  return {
    durationMs: Math.round(rawDuration * 1000),
    formatName: parsed.format?.format_name ?? "unknown",
    codec: audioStream.codec_name ?? null,
    sampleRate: audioStream.sample_rate ? Number(audioStream.sample_rate) : null,
    channels: audioStream.channels ?? null,
  };
}
