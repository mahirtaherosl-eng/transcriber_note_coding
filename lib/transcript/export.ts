import { formatSrtTimestamp, formatVttTimestamp } from "@/lib/format";
import type { TranscriptFile } from "@/lib/transcript/schema";

function speakerName(transcript: TranscriptFile, speakerId: string | null): string | null {
  if (!speakerId) return null;
  return transcript.speakers.find((speaker) => speaker.id === speakerId)?.name ?? null;
}

export function toTranscriptJson(transcript: TranscriptFile): string {
  return `${JSON.stringify(transcript, null, 2)}\n`;
}

export function toSrt(transcript: TranscriptFile): string {
  return transcript.segments
    .map((segment, index) => {
      const name = speakerName(transcript, segment.speakerId);
      const text = name ? `${name}: ${segment.text}` : segment.text;
      return `${index + 1}\r\n${formatSrtTimestamp(segment.startMs)} --> ${formatSrtTimestamp(
        segment.endMs,
      )}\r\n${text}\r\n`;
    })
    .join("\r\n");
}

export function toVtt(transcript: TranscriptFile): string {
  const cues = transcript.segments.map((segment, index) => {
    const name = speakerName(transcript, segment.speakerId);
    const text = name ? `${name}: ${segment.text}` : segment.text;
    return `${index + 1}\r\n${formatVttTimestamp(segment.startMs)} --> ${formatVttTimestamp(
      segment.endMs,
    )}\r\n${text}`;
  });
  return `WEBVTT\r\n\r\n${cues.join("\r\n\r\n")}\r\n`;
}

export function toPlainText(transcript: TranscriptFile): string {
  return (
    transcript.segments
      .map((segment) => {
        const name = speakerName(transcript, segment.speakerId);
        return name ? `${name}: ${segment.text}` : segment.text;
      })
      .join("\r\n\r\n") + "\r\n"
  );
}
