import { readAudio, recordingDoc } from "@/lib/firebase/admin";
import { transcribeBytes } from "@/lib/deepgram";

// Deepgram can take a while on long files; well past the default 15s.
// Deepgram on a long file can still approach this; Vercel Hobby caps at 60s
// and Pro/Fluid allows more, so raise it there if you record long sessions.
export const maxDuration = 60;

export async function POST(req: Request) {
  const { recordingId } = (await req.json().catch(() => ({}))) as {
    recordingId?: string;
  };
  if (!recordingId) {
    return Response.json({ error: "recordingId is required" }, { status: 400 });
  }

  const doc = recordingDoc(recordingId);

  let data: { chunkCount?: number; mimeType?: string; status?: string };
  try {
    const snap = await doc.get();
    if (!snap.exists) {
      return Response.json({ error: "recording not found" }, { status: 404 });
    }
    data = snap.data() as typeof data;
  } catch (err) {
    return Response.json({ error: message(err) }, { status: 500 });
  }

  if (!data.chunkCount) {
    return Response.json({ error: "recording has no audio" }, { status: 409 });
  }
  if (data.status === "transcribing") {
    return Response.json({ error: "already transcribing" }, { status: 409 });
  }

  await doc.update({ status: "transcribing", error: null });

  try {
    const audio = await readAudio(recordingId, data.chunkCount);
    const result = await transcribeBytes(audio, data.mimeType || "audio/webm");

    await doc.update({
      status: "transcribed",
      error: null,
      transcript: {
        text: result.text,
        utterances: result.utterances,
        speakerCount: result.speakerCount,
        language: result.language ?? null,
        model: result.model,
        transcribedAt: Date.now(),
      },
    });

    return Response.json({
      ok: true,
      characters: result.text.length,
      utterances: result.utterances.length,
      speakerCount: result.speakerCount,
    });
  } catch (err) {
    await doc.update({ status: "error", error: message(err) });
    return Response.json({ error: message(err) }, { status: 500 });
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
