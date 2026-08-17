/**
 * Audio lives in Firestore rather than Cloud Storage, which means working around
 * the 1 MiB per-document limit: the blob is split across `audioChunks` documents
 * stored as native Firestore bytes (no base64 inflation).
 */

/** Raw bytes per chunk document, comfortably under Firestore's 1,048,576 cap. */
export const CHUNK_BYTES = 768 * 1024;

/**
 * Ceiling on a single recording. Roughly 2–3 hours of Opus mic audio. Firestore
 * is a document store, not a blob store, so this keeps one recording from eating
 * the whole quota (Spark allows 1 GiB total).
 */
export const MAX_AUDIO_BYTES = 40 * 1024 * 1024;

export function formatMaxSize(): string {
  return `${Math.round(MAX_AUDIO_BYTES / (1024 * 1024))} MB`;
}
