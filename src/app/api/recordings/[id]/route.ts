import { deleteRecording, recordingDoc } from "@/lib/firebase/admin";
import type { Recording } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

/** The client polls this while a recording is uploading or transcribing. */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  try {
    const snap = await recordingDoc(id).get();
    if (!snap.exists) {
      return Response.json({ error: "recording not found" }, { status: 404 });
    }
    return Response.json({ recording: snap.data() as Recording });
  } catch (err) {
    return Response.json({ error: message(err) }, { status: 500 });
  }
}

/** Rename. */
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  try {
    const body = (await req.json().catch(() => ({}))) as { title?: string };
    const title = body.title?.trim();
    if (!title) {
      return Response.json({ error: "title is required" }, { status: 400 });
    }
    const snap = await recordingDoc(id).get();
    if (!snap.exists) {
      return Response.json({ error: "recording not found" }, { status: 404 });
    }
    await recordingDoc(id).update({ title });
    return Response.json({ ok: true, title });
  } catch (err) {
    return Response.json({ error: message(err) }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  try {
    await deleteRecording(id);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: message(err) }, { status: 500 });
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
