import { recordingsCollection, writeAudio } from "@/lib/firebase/admin";
import { CHUNK_BYTES, MAX_AUDIO_BYTES, formatMaxSize } from "@/lib/audio";
import type { Recording } from "@/lib/types";

export const maxDuration = 300;

/** Lists recordings, newest first. Audio chunks are never included. */
export async function GET() {
  try {
    const snap = await recordingsCollection().orderBy("createdAt", "desc").get();
    return Response.json({
      recordings: snap.docs.map((d) => d.data() as Recording),
    });
  } catch (err) {
    return Response.json({ error: message(err) }, { status: 500 });
  }
}

/**
 * Creates a recording. The body is the raw audio; metadata rides along in query
 * params so we avoid multipart parsing for what is otherwise one big blob.
 */
export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const durationMs = Number(url.searchParams.get("durationMs") ?? "0");
    const mimeType = url.searchParams.get("mimeType") || "audio/webm";
    // The client asks for a title before uploading; enforce it here too so a
    // recording can never end up untitled.
    const title = (url.searchParams.get("title") ?? "").trim();
    if (!title) {
      return Response.json({ error: "a title is required" }, { status: 400 });
    }

    // The client validates too, but it can be bypassed — and a non-audio body
    // would otherwise fail deep inside Deepgram with a confusing message.
    if (!/^(audio|video)\//.test(mimeType)) {
      return Response.json(
        { error: `unsupported content type "${mimeType}" — audio is required` },
        { status: 415 },
      );
    }

    const audio = new Uint8Array(await req.arrayBuffer());
    if (audio.byteLength === 0) {
      return Response.json({ error: "the recording is empty" }, { status: 400 });
    }
    if (audio.byteLength > MAX_AUDIO_BYTES) {
      return Response.json(
        { error: `recording exceeds the ${formatMaxSize()} limit` },
        { status: 413 },
      );
    }

    const ref = recordingsCollection().doc();
    await ref.set({
      id: ref.id,
      title,
      status: "uploading",
      createdAt: Date.now(),
      durationMs,
      sizeBytes: audio.byteLength,
      mimeType,
    });

    const chunkCount = await writeAudio(ref.id, audio, CHUNK_BYTES);

    // chunkCount lands only once every chunk is written, so a failed upload can
    // never look like complete audio.
    await ref.update({ status: "uploaded", chunkCount });

    return Response.json({ id: ref.id, chunkCount, sizeBytes: audio.byteLength });
  } catch (err) {
    return Response.json({ error: message(err) }, { status: 500 });
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
