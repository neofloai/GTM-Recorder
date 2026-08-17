import { readAudio, recordingDoc } from "@/lib/firebase/admin";

export const maxDuration = 300;

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
