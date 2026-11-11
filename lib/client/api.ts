import type { HistoryEntry, Job, TranscriptFile } from "@/lib/transcript/schema";
import type { SettingsStatus, SettingsUpdate } from "@/lib/settings/schema";

export type JobListResponse = {
  jobs: Job[];
  defaultProvider?: string;
  defaultProviderReady?: boolean;
};

export type AttachResponse = {
  job: Job;
  warning?: string;
};

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // ignore non-JSON error bodies
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed (${response.status})`;
    throw new Error(message);
  }

  return payload as T;
}

export async function listTranscriptions(): Promise<JobListResponse> {
  return fetchJson<JobListResponse>("/api/transcriptions", { cache: "no-store" });
}

export async function getJob(id: string): Promise<Job> {
  const data = await fetchJson<{ job: Job }>(`/api/transcriptions/${id}`, { cache: "no-store" });
  return data.job;
}

export async function getTranscript(id: string): Promise<TranscriptFile> {
  const data = await fetchJson<{ transcript: TranscriptFile }>(
    `/api/transcriptions/${id}/transcript`,
    { cache: "no-store" },
  );
  return data.transcript;
}

/** Returns null only when the transcript does not exist yet; other failures still throw. */
export async function getTranscriptIfAvailable(id: string): Promise<TranscriptFile | null> {
  const response = await fetch(`/api/transcriptions/${encodeURIComponent(id)}/transcript`, {
    cache: "no-store",
  });
  if (response.status === 404) return null;

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // ignore non-JSON error bodies
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed (${response.status})`;
    throw new Error(message);
  }

  return (payload as { transcript: TranscriptFile }).transcript;
}

export async function retranscribe(
  id: string,
  payload: { provider?: string; language?: string; numSpeakers?: number | null },
): Promise<Job> {
  const data = await fetchJson<{ job: Job }>(
    `/api/transcriptions/${encodeURIComponent(id)}/retranscribe`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  return data.job;
}

export async function listHistory(id: string): Promise<HistoryEntry[]> {
  const data = await fetchJson<{ entries: HistoryEntry[] }>(
    `/api/transcriptions/${encodeURIComponent(id)}/history`,
    { cache: "no-store" },
  );
  return data.entries;
}

export async function restoreHistory(
  id: string,
  version: string,
): Promise<{ transcript: TranscriptFile; job: Job; warning?: string }> {
  return fetchJson<{ transcript: TranscriptFile; job: Job; warning?: string }>(
    `/api/transcriptions/${encodeURIComponent(id)}/history/${encodeURIComponent(version)}?action=restore`,
    { method: "POST" },
  );
}

export async function getSettings(): Promise<SettingsStatus> {
  return fetchJson<SettingsStatus>("/api/settings", { cache: "no-store" });
}

export async function saveSettings(update: SettingsUpdate): Promise<SettingsStatus> {
  return fetchJson<SettingsStatus>("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  });
}

export function historyDownloadUrl(id: string, version: string): string {
  return `/api/transcriptions/${encodeURIComponent(id)}/history/${encodeURIComponent(version)}`;
}

type UploadOptions = {
  file: File;
  language: string;
  numSpeakers?: number;
  provider?: string;
  mimeType?: string;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
};

function uploadRequest(url: string, options: UploadOptions): Promise<{ id?: string; job?: Job; warning?: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Content-Type", options.mimeType || options.file.type || "application/octet-stream");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && options.onProgress) {
        options.onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onerror = () => reject(new Error("Upload failed. Check that the dev server is still running."));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    xhr.onload = () => {
      let payload: { id?: string; job?: Job; warning?: string; error?: string } = {};
      try {
        payload = JSON.parse(xhr.responseText) as typeof payload;
      } catch {
        // fall through
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(payload);
      } else {
        reject(new Error(payload.error || `Upload failed (${xhr.status})`));
      }
    };

    if (options.signal) {
      if (options.signal.aborted) {
        reject(new DOMException("Upload cancelled", "AbortError"));
        return;
      }
      options.signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }

    xhr.send(options.file);
  });
}

export async function uploadAudio(options: UploadOptions): Promise<{ id: string }> {
  const params = new URLSearchParams({
    fileName: options.file.name,
    language: options.language,
    mimeType: options.mimeType || options.file.type || "application/octet-stream",
  });
  if (options.numSpeakers) params.set("numSpeakers", String(options.numSpeakers));
  if (options.provider) params.set("provider", options.provider);

  const result = await uploadRequest(`/api/transcriptions?${params.toString()}`, options);
  if (!result.id) throw new Error("The server did not return a transcription id.");
  return { id: result.id };
}

export async function attachAudio(
  id: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<AttachResponse> {
  const params = new URLSearchParams({
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
  });
  const result = await uploadRequest(`/api/transcriptions/${encodeURIComponent(id)}/audio?${params.toString()}`, {
    file,
    language: "auto",
    onProgress,
  });
  if (!result.job) throw new Error("The audio was uploaded but the server response was incomplete.");
  return { job: result.job, warning: result.warning };
}

export async function importTranscript(file: File): Promise<{ id: string }> {
  const text = await file.text();
  return fetchJson<{ id: string }>("/api/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: text,
  });
}

export async function deleteTranscription(id: string): Promise<void> {
  await fetchJson(`/api/transcriptions/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function retryTranscription(id: string): Promise<void> {
  await fetchJson(`/api/transcriptions/${encodeURIComponent(id)}?action=retry`, { method: "POST" });
}

export async function cancelTranscription(id: string): Promise<void> {
  await fetchJson(`/api/transcriptions/${encodeURIComponent(id)}?action=cancel`, { method: "POST" });
}

export async function saveEdits(
  id: string,
  payload: {
    segments?: { id: string; text?: string; speakerId?: string | null }[];
    speakers?: { id: string; name?: string; color?: string }[];
  },
): Promise<TranscriptFile> {
  const data = await fetchJson<{ transcript: TranscriptFile }>(
    `/api/transcriptions/${encodeURIComponent(id)}/transcript`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  return data.transcript;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
