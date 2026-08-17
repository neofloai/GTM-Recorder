import type { Utterance } from "@/lib/types";

const DEEPGRAM_URL = "https://api.deepgram.com/v1/listen";

type DeepgramResponse = {
  metadata?: { duration?: number; models?: string[] };
  results?: {
    channels?: Array<{
      detected_language?: string;
      alternatives?: Array<{
        transcript?: string;
        paragraphs?: { transcript?: string };
      }>;
    }>;
    utterances?: Array<{
      speaker?: number;
      start?: number;
      end?: number;
      transcript?: string;
      confidence?: number;
    }>;
  };
};

export type TranscriptionResult = {
  text: string;
  utterances: Utterance[];
  speakerCount: number;
  language?: string;
  model: string;
  durationSec?: number;
  raw: unknown;
};

function listenUrl(model: string): string {
  const params = new URLSearchParams({
    model,
    language: process.env.DEEPGRAM_LANGUAGE || "en",
    smart_format: "true",
    punctuate: "true",
    paragraphs: "true",
    diarize: "true",
    utterances: "true",
    detect_language: "false",
  });
  return `${DEEPGRAM_URL}?${params}`;
}

function requireKey(): string {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error("Missing required env var DEEPGRAM_API_KEY");
  return apiKey;
}

/**
 * Uploads the audio bytes to Deepgram directly. Since the audio lives in
 * Firestore rather than behind a public URL, there's nothing for Deepgram to
 * fetch — we have to send the body ourselves.
 */
export async function transcribeBytes(
  audio: Uint8Array,
  mimeType: string,
): Promise<TranscriptionResult> {
  const model = process.env.DEEPGRAM_MODEL || "nova-3";

  const res = await fetch(listenUrl(model), {
    method: "POST",
    headers: {
      Authorization: `Token ${requireKey()}`,
      // Deepgram sniffs the container, but being explicit avoids misdetection.
      "Content-Type": mimeType || "audio/webm",
    },
    body: audio as unknown as BodyInit,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Deepgram failed (${res.status}): ${detail.slice(0, 500)}`);
  }

  return parseDeepgram((await res.json()) as DeepgramResponse, model);
}

export function parseDeepgram(
  json: DeepgramResponse,
  model: string,
): TranscriptionResult {
  const channel = json.results?.channels?.[0];
  const alternative = channel?.alternatives?.[0];

  const utterances: Utterance[] = (json.results?.utterances ?? [])
    .map((u) => ({
      speaker: u.speaker ?? 0,
      start: u.start ?? 0,
      end: u.end ?? 0,
      text: (u.transcript ?? "").trim(),
      confidence: u.confidence ?? 0,
    }))
    .filter((u) => u.text.length > 0);

  // paragraphs.transcript keeps Deepgram's own line breaks; the flat transcript
  // is the fallback when paragraph formatting wasn't returned.
  const text =
    alternative?.paragraphs?.transcript?.trim() ||
    alternative?.transcript?.trim() ||
    utterances.map((u) => u.text).join(" ");

  return {
    text,
    utterances,
    speakerCount: new Set(utterances.map((u) => u.speaker)).size,
    language: channel?.detected_language,
    model,
    durationSec: json.metadata?.duration,
    raw: json,
  };
}

/** Speaker-labelled, timestamped transcript — the form the LLM reasons over. */
export function formatForPrompt(
  utterances: Utterance[],
  fallbackText: string,
): string {
  if (!utterances.length) return fallbackText;
  return utterances
    .map((u) => {
      const mm = String(Math.floor(u.start / 60)).padStart(2, "0");
      const ss = String(Math.floor(u.start % 60)).padStart(2, "0");
      return `[${mm}:${ss}] Speaker ${u.speaker + 1}: ${u.text}`;
    })
    .join("\n");
}
