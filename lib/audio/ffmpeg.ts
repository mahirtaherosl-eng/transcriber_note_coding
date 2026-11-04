import { execFile, spawn, type ChildProcess } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

export const FFMPEG_PATH: string | null = typeof ffmpegStatic === "string" ? ffmpegStatic : null;
export const FFPROBE_PATH: string | null =
  ffprobeStatic && typeof ffprobeStatic === "object" && "path" in ffprobeStatic
    ? ffprobeStatic.path
    : null;

export function requireBinary(kind: "ffmpeg" | "ffprobe"): string {
  const binary = kind === "ffmpeg" ? FFMPEG_PATH : FFPROBE_PATH;
  if (!binary) {
    throw new Error(
      `Could not resolve the ${kind} binary. Run \`npm install\` again, or set the binary path manually.`,
    );
  }
  return binary;
}

export type RunResult = { stdout: string; stderr: string };

export function runBinary(binary: string, args: string[], timeoutMs = 120_000): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    execFile(
      binary,
      args,
      { shell: false, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              `${binary.split(/[\\/]/).pop()} failed: ${error.message}${
                stderr ? `\n${stderr.slice(-2000)}` : ""
              }`,
            ),
          );
          return;
        }
        resolve({ stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });
}

export function spawnBinary(binary: string, args: string[]): ChildProcess {
  return spawn(binary, args, { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
}
