import { recordingDoc } from "@/lib/firebase/admin";
import type { Recording, Utterance } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

/**
 * Edits one utterance of the transcript. Only the text changes — timestamps and
 * speaker numbers are left alone, so seeking and `[mm:ss]` citations keep working.
 *
 * Editing invalidates any existing summary, which is flagged rather than deleted
 * so the user can read the old one while deciding to regenerate.
 */
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;

  const body = (await req.json().catch(() => ({}))) as {
    index?: number;
    text?: string;
  };
  const index = body.index;
  const text = body.text;

  if (typeof index !== "number" || !Number.isInteger(index) || index < 0) {
    return Response.json({ error: "a valid utterance index is required" }, { status: 400 });
  }
  if (typeof text !== "string") {
    return Response.json({ error: "text is required" }, { status: 400 });
  }

  try {
    const doc = recordingDoc(id);
    const snap = await doc.get();
    if (!snap.exists) {
      return Response.json({ error: "recording not found" }, { status: 404 });
    }

    const data = snap.data() as Recording;
    const utterances: Utterance[] = data.transcript?.utterances ?? [];
    if (!data.transcript || !utterances.length) {
      return Response.json(
        { error: "this recording has no editable transcript" },
        { status: 409 },
      );
    }
    if (index >= utterances.length) {
      return Response.json(
        { error: `utterance ${index} does not exist` },
        { status: 400 },
      );
    }

    const updated = utterances.map((u, i) =>
      i === index ? { ...u, text: text.trim() } : u,
    );

    // Keep the flat text in step with the utterances: chat and summary fall back
    // to it, and hasSpeech() reads it.
    const flat = updated
      .map((u) => u.text)
      .filter(Boolean)
      .join(" ");

    await doc.update({
      "transcript.utterances": updated,
      "transcript.text": flat,
      "transcript.editedAt": Date.now(),
      // Only worth flagging if there is a summary to invalidate.
      ...(data.summary?.text ? { summaryStale: true } : {}),
    });

    const after = await doc.get();
    return Response.json({ recording: after.data() as Recording });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
