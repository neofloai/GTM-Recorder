import { recordingsCollection } from "@/lib/firebase/admin";
import { MAX_AUDIO_BYTES, formatMaxSize } from "@/lib/audio";
import type { Recording } from "@/lib/types";

// Metadata only — the audio arrives in separate chunk requests, so this is fast.
export const maxDuration = 60;

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
 * Creates the recording document. The audio is uploaded afterwards, one chunk per
 * request to PUT /api/recordings/[id]/audio, because Vercel caps a serverless
 * request body at 4.5 MB and a recording can be much larger than that.
 *
 * `chunkCount` is deliberately not set here — it lands only once every chunk has
 * been stored, so an interrupted upload can never look like complete audio.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      title?: string;
      durationMs?: number;
      sizeBytes?: number;
      mimeType?: string;
    };

    const title = (body.title ?? "").trim();
    if (!title) {
      return Response.json({ error: "a title is required" }, { status: 400 });
    }

    const mimeType = body.mimeType || "audio/webm";
    if (!/^(audio|video)\//.test(mimeType)) {
      return Response.json(
        { error: `unsupported content type "${mimeType}" — audio is required` },
        { status: 415 },
      );
    }

    const sizeBytes = Number(body.sizeBytes ?? 0);
    if (!sizeBytes || sizeBytes < 0) {
      return Response.json({ error: "sizeBytes is required" }, { status: 400 });
    }
    if (sizeBytes > MAX_AUDIO_BYTES) {
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
      durationMs: Math.max(0, Math.round(Number(body.durationMs ?? 0))),
      sizeBytes,
      mimeType,
    });

    return Response.json({ id: ref.id });
  } catch (err) {
    return Response.json({ error: message(err) }, { status: 500 });
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
