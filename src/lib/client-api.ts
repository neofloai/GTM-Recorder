import { CHUNK_BYTES, UPLOAD_CONCURRENCY } from "@/lib/audio";
import type { ChatMessage, Recording } from "@/lib/types";

/** Unwraps a JSON response, surfacing the server's `error` string as thrown text. */
async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error || `request failed (${res.status})`);
  return body;
}

export async function listRecordings(): Promise<Recording[]> {
  const res = await fetch("/api/recordings", { cache: "no-store" });
  return (await json<{ recordings: Recording[] }>(res)).recordings;
}

export async function getRecording(id: string): Promise<Recording> {
  const res = await fetch(`/api/recordings/${id}`, { cache: "no-store" });
  return (await json<{ recording: Recording }>(res)).recording;
}

/** PUTs one chunk, reporting progress through onProgress via the caller. */
function putChunk(id: string, index: number, chunk: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `/api/recordings/${id}/audio?index=${index}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let body: { error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // Fall through to the status message.
      }
      reject(new Error(body.error || `chunk ${index} failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error(`chunk ${index} failed — network error`));
    xhr.send(chunk);
  });
}

/**
 * Creates a recording and uploads its audio.
 *
 * The audio goes up one CHUNK_BYTES piece per request rather than in a single
 * body, because Vercel caps a serverless request at 4.5 MB — a whole recording
 * would be rejected outright. `chunkCount` is only written by the finalize call
 * once every piece has landed, so an interrupted upload can't look complete.
 */
export async function createRecording(
  audio: Blob,
  durationMs: number,
  title: string,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const created = await fetch("/api/recordings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title,
      durationMs: Math.round(durationMs),
      sizeBytes: audio.size,
      mimeType: audio.type || "audio/webm",
    }),
  });
  const { id } = await json<{ id: string }>(created);

  try {
    const total = Math.ceil(audio.size / CHUNK_BYTES);
    let done = 0;
    onProgress?.(0);

    // A small amount of parallelism keeps a long upload moving without opening
    // dozens of connections at once.
    for (let i = 0; i < total; i += UPLOAD_CONCURRENCY) {
      const group = [];
      for (let k = i; k < Math.min(i + UPLOAD_CONCURRENCY, total); k++) {
        const slice = audio.slice(k * CHUNK_BYTES, Math.min((k + 1) * CHUNK_BYTES, audio.size));
        group.push(
          putChunk(id, k, slice).then(() => {
            done++;
            onProgress?.(done / total);
          }),
        );
      }
      await Promise.all(group);
    }

    await json(
      await fetch(`/api/recordings/${id}/audio?chunks=${total}`, { method: "POST" }),
    );
    onProgress?.(1);
    return id;
  } catch (err) {
    // Don't leave a half-uploaded recording stuck on "Saving" in the list.
    await fetch(`/api/recordings/${id}`, { method: "DELETE" }).catch(() => {});
    throw err;
  }
}

export async function renameRecording(id: string, title: string): Promise<void> {
  await json(
    await fetch(`/api/recordings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }),
  );
}

export async function deleteRecording(id: string): Promise<void> {
  await json(await fetch(`/api/recordings/${id}`, { method: "DELETE" }));
}

/** Saves an edited utterance and returns the updated recording. */
export async function updateUtterance(
  recordingId: string,
  index: number,
  text: string,
): Promise<Recording> {
  const res = await fetch(`/api/recordings/${recordingId}/transcript`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ index, text }),
  });
  return (await json<{ recording: Recording }>(res)).recording;
}

export async function transcribe(recordingId: string): Promise<void> {
  await json(
    await fetch("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recordingId }),
    }),
  );
}

export async function summarize(recordingId: string, force = false): Promise<void> {
  await json(
    await fetch("/api/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recordingId, force }),
    }),
  );
}

export async function getMessages(recordingId: string): Promise<ChatMessage[]> {
  const res = await fetch(`/api/recordings/${recordingId}/messages`, {
    cache: "no-store",
  });
  return (await json<{ messages: ChatMessage[] }>(res)).messages;
}

export type ModelOption = { id: string; name: string };

export async function getModels(): Promise<{
  models: ModelOption[];
  defaultModel: string;
}> {
  const res = await fetch("/api/models");
  return json<{ models: ModelOption[]; defaultModel: string }>(res);
}

/** Streams a chat answer, invoking `onDelta` with the text so far. */
export async function streamChatAnswer(
  recordingId: string,
  message: string,
  model: string | undefined,
  onDelta: (textSoFar: string) => void,
): Promise<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recordingId, message, model }),
  });

  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `request failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    full += decoder.decode(value, { stream: true });
    onDelta(full);
  }
  return full;
}

export const audioUrl = (id: string) => `/api/recordings/${id}/audio`;
