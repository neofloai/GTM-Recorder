import { readAudio, recordingDoc } from "@/lib/firebase/admin";
import { CHUNK_BYTES } from "@/lib/audio";

// One chunk per request, so this never runs long.
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

/**
 * Serves the reassembled audio so a plain `<audio src>` can play it. Range
 * requests are honoured because without them browsers refuse to seek, which
 * would break clicking a transcript timestamp.
 */
export async function GET(req: Request, { params }: Params) {
  const { id } = await params;

  const snap = await recordingDoc(id).get();
  if (!snap.exists) {
    return Response.json({ error: "recording not found" }, { status: 404 });
  }

  const data = snap.data() as { chunkCount?: number; mimeType?: string };
  if (!data.chunkCount) {
    return Response.json({ error: "recording has no audio" }, { status: 409 });
  }

  let audio: Uint8Array;
  try {
    audio = await readAudio(id, data.chunkCount);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  const contentType = data.mimeType || "audio/webm";
  const total = audio.byteLength;
  const range = req.headers.get("range");

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;

      if (Number.isNaN(start) || start > end || start >= total) {
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${total}` },
        });
      }

      const slice = audio.subarray(start, end + 1);
      return new Response(slice as unknown as BodyInit, {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(slice.byteLength),
          "Content-Range": `bytes ${start}-${end}/${total}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, max-age=3600",
        },
      });
    }
  }

  return new Response(audio as unknown as BodyInit, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(total),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
    },
  });
}

/**
 * Stores one chunk of the audio. Each request carries at most CHUNK_BYTES, which
 * keeps it well under Vercel's 4.5 MB serverless body limit — the whole reason
 * the upload is split up rather than sent in one piece.
 */
export async function PUT(req: Request, { params }: Params) {
  const { id } = await params;
  const index = Number(new URL(req.url).searchParams.get("index"));

  if (!Number.isInteger(index) || index < 0) {
    return Response.json({ error: "a valid chunk index is required" }, { status: 400 });
  }

  try {
    const doc = recordingDoc(id);
    const snap = await doc.get();
    if (!snap.exists) {
      return Response.json({ error: "recording not found" }, { status: 404 });
    }

    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.byteLength === 0) {
      return Response.json({ error: "chunk is empty" }, { status: 400 });
    }
    if (bytes.byteLength > CHUNK_BYTES) {
      return Response.json(
        { error: `chunk ${index} is ${bytes.byteLength} bytes, over the ${CHUNK_BYTES} limit` },
        { status: 413 },
      );
    }

    await doc.collection("audioChunks").doc(String(index)).set({
      index,
      data: Buffer.from(bytes),
    });

    return Response.json({ ok: true, index, bytes: bytes.byteLength });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

/**
 * Finalises the upload. Verifies every chunk actually landed before writing
 * `chunkCount`, so a partial upload is never mistaken for complete audio.
 */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const expected = Number(new URL(req.url).searchParams.get("chunks"));

  if (!Number.isInteger(expected) || expected < 1) {
    return Response.json({ error: "a valid chunk count is required" }, { status: 400 });
  }

  try {
    const doc = recordingDoc(id);
    if (!(await doc.get()).exists) {
      return Response.json({ error: "recording not found" }, { status: 404 });
    }

    const stored = await doc.collection("audioChunks").get();
    if (stored.size !== expected) {
      return Response.json(
        { error: `upload incomplete: expected ${expected} chunks, found ${stored.size}` },
        { status: 409 },
      );
    }

    await doc.update({ status: "uploaded", chunkCount: expected });
    return Response.json({ ok: true, chunkCount: expected });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
