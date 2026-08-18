/**
 * Audio lives in Firestore rather than Cloud Storage, which means working around
 * the 1 MiB per-document limit: the blob is split across `audioChunks` documents
 * stored as native Firestore bytes (no base64 inflation).
 */

/**
 * Raw bytes per chunk document, comfortably under Firestore's 1,048,576 cap.
 * This doubles as the upload request size: Vercel caps a serverless request body
 * at 4.5 MB, so one chunk per request stays far inside that.
 */
export const CHUNK_BYTES = 768 * 1024;

/** Chunk uploads run this many at a time. */
export const UPLOAD_CONCURRENCY = 3;

/**
 * Ceiling on a single recording. Roughly 2–3 hours of Opus mic audio. Firestore
 * is a document store, not a blob store, so this keeps one recording from eating
 * the whole quota (Spark allows 1 GiB total).
 */
export const MAX_AUDIO_BYTES = 40 * 1024 * 1024;

export function formatMaxSize(): string {
  return `${Math.round(MAX_AUDIO_BYTES / (1024 * 1024))} MB`;
}

/**
 * File types the upload picker accepts. Deepgram handles all of these; video
 * containers are excluded because the 40 MB ceiling makes them impractical and
 * the player here is audio-only.
 */
export const ACCEPTED_AUDIO = [
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/flac",
  "audio/x-flac",
];

/** The `accept` attribute — the MIME list plus extensions, since some
 *  platforms report an empty type for perfectly valid files. */
export const ACCEPT_ATTR = [
  "audio/*",
  ".mp3",
  ".m4a",
  ".aac",
  ".wav",
  ".flac",
  ".ogg",
  ".oga",
  ".opus",
  ".webm",
].join(",");

export function looksLikeAudio(file: File): boolean {
  if (file.type.startsWith("audio/")) return true;
  // Safari and some Android pickers hand over an empty type; fall back to the
  // extension rather than rejecting a valid file.
  if (!file.type) {
    return /\.(mp3|m4a|aac|wav|flac|ogg|oga|opus|webm)$/i.test(file.name);
  }
  return false;
}

/**
 * Reads a file's duration by letting the browser decode its metadata. Uploaded
 * files carry no duration otherwise, and MediaRecorder WebM often reports
 * Infinity, so both cases fall back to 0 (the UI then just shows 0:00).
 */
export function probeDuration(file: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    const done = (ms: number) => {
      URL.revokeObjectURL(url);
      resolve(ms);
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const seconds = audio.duration;
      done(Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0);
    };
    audio.onerror = () => done(0);
    // Don't hang the upload if metadata never arrives.
    setTimeout(() => done(0), 5000);
    audio.src = url;
  });
}

/** Strips the extension, so "team sync.m4a" becomes a sensible title. */
export function titleFromFilename(name: string): string {
  return name.replace(/\.[^./\\]+$/, "").trim() || "Uploaded recording";
}
