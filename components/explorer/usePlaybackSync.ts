"use client";

import { useCallback, useEffect, useRef } from "react";
import { useExplorerStore } from "@/lib/client/store";
import { hydratePlaybackRate } from "@/lib/client/store";

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

export type PlaybackControls = {
  toggle: () => void;
  seek: (ms: number, play?: boolean) => void;
  skip: (deltaMs: number) => void;
  stepRate: (direction: 1 | -1) => void;
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function isActivatableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("button, a, summary"));
}

/**
 * Audio time is the single source of truth. We never write the store's time back
 * into the media element, which is what keeps the two panes from fighting.
 */
export function usePlaybackSync(
  audioRef: React.RefObject<HTMLAudioElement | null>,
  durationMs: number,
): PlaybackControls {
  const setCurrentTime = useExplorerStore((state) => state.setCurrentTime);
  const setPlaying = useExplorerStore((state) => state.setPlaying);
  const setPlaybackRate = useExplorerStore((state) => state.setPlaybackRate);
  const playbackRate = useExplorerStore((state) => state.playbackRate);

  const durationRef = useRef(durationMs);
  durationRef.current = durationMs;
  const pendingSeekRef = useRef<number | null>(null);
  const playWhenReadyRef = useRef(false);

  useEffect(() => {
    hydratePlaybackRate();
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    let timer: number | null = null;
    const sync = () => {
      setCurrentTime(audio.currentTime * 1000);
    };
    const start = () => {
      if (timer !== null) return;
      timer = window.setInterval(sync, 100);
    };
    const stop = () => {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
      sync();
    };

    const onPlay = () => {
      setPlaying(true);
      start();
    };
    const onPause = () => {
      setPlaying(false);
      stop();
    };
    const onEnded = () => {
      setPlaying(false);
      stop();
      setCurrentTime(Number.isFinite(audio.duration) ? audio.duration * 1000 : 0);
    };
    const onLoaded = () => {
      audio.playbackRate = useExplorerStore.getState().playbackRate;
      if (pendingSeekRef.current !== null) {
        const target = pendingSeekRef.current;
        pendingSeekRef.current = null;
        try {
          audio.currentTime = target / 1000;
        } catch {
          // metadata may still be settling; the next seek will land
        }
        if (playWhenReadyRef.current) {
          playWhenReadyRef.current = false;
          void audio.play().catch(() => undefined);
        }
      }
      sync();
    };
    const onSeeked = () => sync();

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("seeked", onSeeked);
    audio.addEventListener("timeupdate", sync);

    if (!audio.paused) onPlay();

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("seeked", onSeeked);
      audio.removeEventListener("timeupdate", sync);
      if (timer !== null) window.clearInterval(timer);
    };
  }, [audioRef, setCurrentTime, setPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = playbackRate;
  }, [audioRef, playbackRate]);

  const seek = useCallback(
    (ms: number, play = false) => {
      const audio = audioRef.current;
      const duration = durationRef.current || 0;
      const target = Math.max(0, duration > 0 ? Math.min(ms, duration) : ms);

      setCurrentTime(target);

      if (!audio) return;
      if (audio.readyState === 0) {
        pendingSeekRef.current = target;
        playWhenReadyRef.current = play;
        return;
      }

      try {
        audio.currentTime = target / 1000;
      } catch {
        pendingSeekRef.current = target;
        return;
      }

      if (play) {
        playWhenReadyRef.current = false;
        void audio.play().catch(() => undefined);
      }
    },
    [audioRef, setCurrentTime],
  );

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      if (audio.readyState === 0 && pendingSeekRef.current === null) {
        playWhenReadyRef.current = true;
        return;
      }
      void audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  }, [audioRef]);

  const skip = useCallback(
    (deltaMs: number) => {
      const audio = audioRef.current;
      const current = audio ? audio.currentTime * 1000 : useExplorerStore.getState().currentTimeMs;
      seek(current + deltaMs);
    },
    [audioRef, seek],
  );

  const stepRate = useCallback(
    (direction: 1 | -1) => {
      const index = RATES.indexOf(playbackRate);
      const nextIndex = Math.min(RATES.length - 1, Math.max(0, (index === -1 ? 2 : index) + direction));
      setPlaybackRate(RATES[nextIndex]);
    },
    [playbackRate, setPlaybackRate],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.isComposing) return;
      if (isTypingTarget(event.target)) return;

      switch (event.key) {
        case " ":
          // Let a focused button/link handle Space natively instead of toggling twice.
          if (isActivatableTarget(event.target)) return;
          event.preventDefault();
          toggle();
          break;
        case "ArrowLeft":
          event.preventDefault();
          skip(-5000);
          break;
        case "ArrowRight":
          event.preventDefault();
          skip(5000);
          break;
        case "[":
          event.preventDefault();
          stepRate(-1);
          break;
        case "]":
          event.preventDefault();
          stepRate(1);
          break;
        case "/": {
          const search = document.querySelector<HTMLInputElement>("[data-search-input]");
          if (search) {
            event.preventDefault();
            search.focus();
          }
          break;
        }
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [skip, stepRate, toggle]);

  return { toggle, seek, skip, stepRate };
}
