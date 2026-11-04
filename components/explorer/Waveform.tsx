"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatClockWithTenths } from "@/lib/format";
import type { Segment, Speaker } from "@/lib/transcript/schema";
import { UNASSIGNED_KEY } from "@/components/explorer/SpeakerFilter";

const HEIGHT = 132;

type Props = {
  peaks: number[] | null;
  durationMs: number;
  segments: Segment[];
  speakers: Speaker[];
  activeSegmentId: string | null;
  selectedSpeakers: string[];
  audioRef: React.RefObject<HTMLAudioElement | null>;
  onSeek: (ms: number) => void;
};

export default function Waveform({
  peaks,
  durationMs,
  segments,
  speakers,
  activeSegmentId,
  selectedSpeakers,
  audioRef,
  onSeek,
}: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const draggingRef = useRef(false);
  const activeRef = useRef(activeSegmentId);
  activeRef.current = activeSegmentId;
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;

  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<{ x: number; ms: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const speakerColor = useMemo(() => {
    const map = new Map<string, string>();
    for (const speaker of speakers) map.set(speaker.id, speaker.color);
    return map;
  }, [speakers]);

  // Quiet recordings would otherwise render as a hairline. Normalize to the
  // loudest peak, but don't amplify near-silence into noise.
  const peakScale = useMemo(() => {
    if (!peaks) return 1;
    let maximum = 0;
    for (let index = 0; index < peaks.length; index += 2) {
      const value = Math.max(Math.abs(peaks[index]), Math.abs(peaks[index + 1]));
      if (value > maximum) maximum = value;
    }
    if (maximum < 0.01) return 1;
    return Math.min(1 / maximum, 6);
  }, [peaks]);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const next = Math.max(0, Math.floor(entries[0].contentRect.width));
      setWidth(next);
    });
    observer.observe(element);
    setWidth(Math.max(0, Math.floor(element.getBoundingClientRect().width)));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (width <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    const pixelWidth = Math.max(1, Math.floor(width * dpr));
    const pixelHeight = Math.max(1, Math.floor(HEIGHT * dpr));

    let base = baseRef.current;
    if (!base) {
      base = document.createElement("canvas");
      baseRef.current = base;
    }
    base.width = pixelWidth;
    base.height = pixelHeight;

    const context = base.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, pixelWidth, pixelHeight);

    if (durationMs > 0) {
      const selected = new Set(selectedSpeakers);
      const stripHeight = Math.max(3, Math.floor(4 * dpr));
      for (const segment of segments) {
        const x0 = (segment.startMs / durationMs) * pixelWidth;
        const x1 = (segment.endMs / durationMs) * pixelWidth;
        if (x1 <= x0) continue;
        const key = segment.speakerId ?? UNASSIGNED_KEY;
        const color = segment.speakerId ? speakerColor.get(segment.speakerId) ?? "#8ea3ba" : "#8ea3ba";
        const dimmed = selected.size > 0 && !selected.has(key);
        context.globalAlpha = dimmed ? 0.012 : 0.04;
        context.fillStyle = color;
        context.fillRect(x0, 0, Math.max(1, x1 - x0), pixelHeight);
        // A solid speaker lane along the bottom reads better than full-height blocks.
        context.globalAlpha = dimmed ? 0.18 : 0.85;
        context.fillRect(x0, pixelHeight - stripHeight, Math.max(1, x1 - x0), stripHeight);
      }
      context.globalAlpha = 1;
    }

    if (peaks && peaks.length >= 2) {
      const bucketCount = peaks.length / 2;
      const middle = pixelHeight / 2;
      const amplitude = pixelHeight * 0.42 * peakScale;
      context.fillStyle = "#476a90";
      for (let px = 0; px < pixelWidth; px += 1) {
        const startBucket = Math.floor((px / pixelWidth) * bucketCount);
        const endBucket = Math.min(
          bucketCount,
          Math.max(startBucket + 1, Math.floor(((px + 1) / pixelWidth) * bucketCount)),
        );
        let minimum = 0;
        let maximum = 0;
        for (let bucket = startBucket; bucket < endBucket; bucket += 1) {
          const low = peaks[bucket * 2];
          const high = peaks[bucket * 2 + 1];
          if (low < minimum) minimum = low;
          if (high > maximum) maximum = high;
        }
        const y1 = middle - maximum * amplitude;
        const y2 = middle - minimum * amplitude;
        context.fillRect(px, y1, 1, Math.max(1, y2 - y1));
      }
    } else {
      context.strokeStyle = "#223044";
      context.lineWidth = Math.max(1, dpr);
      context.beginPath();
      context.moveTo(0, pixelHeight / 2);
      context.lineTo(pixelWidth, pixelHeight / 2);
      context.stroke();
    }

    context.globalAlpha = 0.28;
    context.fillStyle = "#6f8dab";
    context.fillRect(0, Math.floor(pixelHeight / 2), pixelWidth, Math.max(1, dpr));
    context.globalAlpha = 1;
  }, [width, peaks, segments, durationMs, speakerColor, selectedSpeakers, peakScale]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let frame = 0;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const pixelWidth = Math.max(1, Math.floor(width * dpr));
      const pixelHeight = Math.max(1, Math.floor(HEIGHT * dpr));

      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;

      const context = canvas.getContext("2d");
      if (!context) return;

      context.clearRect(0, 0, pixelWidth, pixelHeight);
      const base = baseRef.current;
      if (base) context.drawImage(base, 0, 0);

      if (durationMs > 0) {
        const currentMs = Math.min(
          durationMs,
          Math.max(0, (audioRef.current?.currentTime ?? 0) * 1000),
        );
        const playheadX = (currentMs / durationMs) * pixelWidth;

        const active = activeRef.current
          ? segmentsRef.current.find((segment) => segment.id === activeRef.current)
          : null;
        if (active) {
          const x0 = (active.startMs / durationMs) * pixelWidth;
          const x1 = (active.endMs / durationMs) * pixelWidth;
          context.fillStyle = "rgba(124,178,255,0.14)";
          context.fillRect(x0, 0, Math.max(1, x1 - x0), pixelHeight);
        }

        context.fillStyle = "rgba(124,178,255,0.06)";
        context.fillRect(0, 0, playheadX, pixelHeight);

        context.fillStyle = "#7cb2ff";
        context.fillRect(Math.max(0, playheadX - dpr), 0, Math.max(1, dpr * 2), pixelHeight);
      }

      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [width, durationMs, audioRef]);

  const millisecondsAt = (clientX: number): number => {
    const canvas = canvasRef.current;
    if (!canvas || durationMs <= 0) return 0;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)));
    return ratio * durationMs;
  };

  return (
    <div>
      <div
        ref={wrapRef}
        className={`relative select-none overflow-hidden rounded-lg border border-edge-soft bg-ink/50 ${
          dragging ? "cursor-grabbing" : "cursor-crosshair"
        }`}
        style={{ height: HEIGHT, touchAction: "none" }}
      >
        <canvas
          ref={canvasRef}
          role="slider"
          aria-label="Audio timeline"
          aria-valuemin={0}
          aria-valuemax={Math.round(durationMs)}
          aria-valuenow={Math.round(
            Math.min(durationMs, Math.max(0, (audioRef.current?.currentTime ?? 0) * 1000)),
          )}
          className="block h-full w-full"
          style={{ height: HEIGHT }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            const ms = millisecondsAt(event.clientX);
            draggingRef.current = true;
            setDragging(true);
            event.currentTarget.setPointerCapture(event.pointerId);
            const rect = event.currentTarget.getBoundingClientRect();
            setHover({ x: event.clientX - rect.left, ms });
            onSeek(ms);
          }}
          onPointerMove={(event) => {
            const ms = millisecondsAt(event.clientX);
            const rect = event.currentTarget.getBoundingClientRect();
            setHover({ x: event.clientX - rect.left, ms });
            if (draggingRef.current) onSeek(ms);
          }}
          onPointerUp={(event) => {
            draggingRef.current = false;
            setDragging(false);
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
          onPointerCancel={() => {
            draggingRef.current = false;
            setDragging(false);
          }}
          onPointerLeave={() => {
            if (!draggingRef.current) setHover(null);
          }}
        />

        {hover && (
          <>
            <div
              className="pointer-events-none absolute inset-y-0 w-px bg-fog/40"
              style={{ left: hover.x }}
            />
            <div
              className="pointer-events-none absolute top-1 -translate-x-1/2 rounded border border-edge bg-panel px-1.5 py-0.5 font-mono text-[10px] text-paper shadow"
              style={{ left: hover.x }}
            >
              {formatClockWithTenths(hover.ms)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
