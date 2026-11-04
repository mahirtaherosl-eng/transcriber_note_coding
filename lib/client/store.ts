"use client";

import { create } from "zustand";
import type { Job, TranscriptFile } from "@/lib/transcript/schema";

const RATE_KEY = "transcriber:playbackRate";

function readStoredRate(): number {
  if (typeof window === "undefined") return 1;
  const raw = window.localStorage.getItem(RATE_KEY);
  const value = raw ? Number(raw) : 1;
  return Number.isFinite(value) && value >= 0.5 && value <= 3 ? value : 1;
}

type ExplorerState = {
  job: Job | null;
  transcript: TranscriptFile | null;
  currentTimeMs: number;
  isPlaying: boolean;
  playbackRate: number;
  follow: boolean;
  loading: boolean;
  error: string | null;

  setJob: (job: Job | null) => void;
  setTranscript: (transcript: TranscriptFile | null) => void;
  setCurrentTime: (ms: number) => void;
  setPlaying: (playing: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  setFollow: (follow: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;

  replaceTranscript: (transcript: TranscriptFile) => void;
};

export const useExplorerStore = create<ExplorerState>((set) => ({
  job: null,
  transcript: null,
  currentTimeMs: 0,
  isPlaying: false,
  playbackRate: 1,
  follow: true,
  loading: true,
  error: null,

  setJob: (job) => set({ job }),
  setTranscript: (transcript) => set({ transcript }),
  setCurrentTime: (currentTimeMs) => set({ currentTimeMs }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setPlaybackRate: (playbackRate) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(RATE_KEY, String(playbackRate));
    }
    set({ playbackRate });
  },
  setFollow: (follow) => set({ follow }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  reset: () =>
    set({
      job: null,
      transcript: null,
      currentTimeMs: 0,
      isPlaying: false,
      loading: true,
      error: null,
    }),
  replaceTranscript: (transcript) => set({ transcript }),
}));

export function hydratePlaybackRate(): void {
  const rate = readStoredRate();
  if (rate !== 1) useExplorerStore.getState().setPlaybackRate(rate);
}
