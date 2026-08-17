import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. Copy .env.local.example to .env.local and fill it in.`,
    );
  }
  return value;
}

let cached: App | undefined;

function adminApp(): App {
  if (cached) return cached;
  const existing = getApps();
  cached = existing.length
    ? existing[0]
    : initializeApp({
        credential: cert({
          projectId: requireEnv("FIREBASE_PROJECT_ID"),
          clientEmail: requireEnv("FIREBASE_CLIENT_EMAIL"),
          // Env files can't hold real newlines, so the key arrives escaped.
          privateKey: requireEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
        }),
      });
  return cached;
}

export const adminDb = () => getFirestore(adminApp());

/**
 * There is no Firebase Auth in this app: the browser never talks to Firestore
 * directly, so every document lives in one top-level collection and all access
 * goes through the API routes below using the Admin SDK (which bypasses security
 * rules). That means the rules can stay fully locked down.
 */
export const recordingsCollection = () => adminDb().collection("recordings");

export const recordingDoc = (id: string) => recordingsCollection().doc(id);

/**
 * Reassembles the audio from its `audioChunks` documents. Ordered by the numeric
 * `index` field rather than document id, and a gap is a hard error instead of
 * silently producing truncated audio.
 */
export async function readAudio(
  recordingId: string,
  expectedChunks: number,
): Promise<Uint8Array> {
  const snap = await recordingDoc(recordingId)
    .collection("audioChunks")
    .orderBy("index")
    .get();

  if (snap.empty) throw new Error("no audio chunks found for this recording");
  if (snap.size !== expectedChunks) {
    throw new Error(
      `audio is incomplete: expected ${expectedChunks} chunks, found ${snap.size}`,
    );
  }

  const parts = snap.docs.map((doc, i) => {
    const data = doc.data() as { index?: number; data?: unknown };
    if (data.index !== i) {
      throw new Error(`audio chunk ${i} is missing (found index ${data.index})`);
    }
    // The Admin SDK reads a Firestore bytes field back as a Node Buffer, which is
    // a Uint8Array subclass.
    const bytes = data.data;
    if (bytes instanceof Uint8Array) return bytes;
    throw new Error(
      `audio chunk ${i} has unexpected data type ${
        (bytes as { constructor?: { name?: string } })?.constructor?.name ?? typeof bytes
      }`,
    );
  });

  const total = parts.reduce((sum, p) => sum + p.byteLength, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.byteLength;
  }
  return joined;
}

/** Writes the audio across chunk documents, batched to stay under commit limits. */
export async function writeAudio(
  recordingId: string,
  audio: Uint8Array,
  chunkBytes: number,
): Promise<number> {
  const chunks = recordingDoc(recordingId).collection("audioChunks");
  let index = 0;

  for (let offset = 0; offset < audio.byteLength; offset += chunkBytes) {
    const slice = audio.subarray(offset, Math.min(offset + chunkBytes, audio.byteLength));
    // One document per commit: each is ~768 KB and Firestore caps a commit at
    // roughly 10 MiB, so batching several risks tripping that limit.
    await chunks.doc(String(index)).set({
      index,
      data: Buffer.from(slice),
    });
    index++;
  }

  return index;
}

/** Removes a recording and everything underneath it. */
export async function deleteRecording(recordingId: string): Promise<void> {
  const doc = recordingDoc(recordingId);
  for (const sub of ["audioChunks", "messages"]) {
    const snap = await doc.collection(sub).get();
    // Chunk documents are large, so delete in modest batches.
    for (let i = 0; i < snap.docs.length; i += 50) {
      const batch = adminDb().batch();
      snap.docs.slice(i, i + 50).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
  await doc.delete();
}
