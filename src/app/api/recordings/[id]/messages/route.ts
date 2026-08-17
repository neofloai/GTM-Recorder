import { recordingDoc } from "@/lib/firebase/admin";
import type { ChatMessage } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

/** Chat history for a recording, oldest first. */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  try {
    const snap = await recordingDoc(id)
      .collection("messages")
      .orderBy("createdAt", "asc")
      .get();
    return Response.json({
      messages: snap.docs.map((d) => d.data() as ChatMessage),
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
