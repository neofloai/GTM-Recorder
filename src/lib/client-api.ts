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

export async function createRecording(
  audio: Blob,
  durationMs: number,
  title: string,
): Promise<string> {
  const params = new URLSearchParams({
    durationMs: String(Math.round(durationMs)),
    mimeType: audio.type || "audio/webm",
    title,
  });
  const res = await fetch(`/api/recordings?${params}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: audio,
  });
  return (await json<{ id: string }>(res)).id;
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
