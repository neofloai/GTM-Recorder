export type RecordingStatus =
  | "uploading"
  | "uploaded"
  | "transcribing"
  | "transcribed"
  | "error";

/** One diarized chunk of speech, flattened from Deepgram's utterances. */
export type Utterance = {
  speaker: number;
  start: number;
  end: number;
  text: string;
  confidence: number;
};

export type Recording = {
  id: string;
  title: string;
  status: RecordingStatus;
  createdAt: number;
  durationMs: number;
  sizeBytes: number;
  mimeType: string;
  /**
   * How many documents the audio is split across, in the `audioChunks`
   * subcollection. Written once the upload finishes.
   */
  chunkCount?: number;
  transcript?: {
    text: string;
    utterances: Utterance[];
    speakerCount: number;
    /** Deepgram's own detected language, may differ from the requested one. */
    language?: string;
    model?: string;
    transcribedAt: number;
  };
  summary?: {
    /** Markdown, rendered by src/components/Markdown.tsx. */
    text: string;
    model: string;
    generatedAt: number;
  };
  error?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  model?: string;
};

export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
