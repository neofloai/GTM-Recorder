import { recordingDoc } from "@/lib/firebase/admin";
import { DEFAULT_MODEL, streamChat, type LlmMessage } from "@/lib/openrouter";
import { transcriptForPrompt } from "@/lib/transcript";
import type { ChatMessage, Utterance } from "@/lib/types";

export const maxDuration = 300;

/** How many prior turns to replay, so context stays bounded on long threads. */
const HISTORY_TURNS = 20;

function systemPrompt(title: string, transcript: string): string {
  return [
    "You are an assistant answering questions about a single audio recording.",
    "The full transcript is below, diarized by speaker and timestamped as [mm:ss].",
    "",
    "Rules:",
    "- Answer only from the transcript. If it does not contain the answer, say so plainly.",
    "- Cite timestamps like [12:34] when referring to something specific.",
    "- Speakers are labelled Speaker 1, Speaker 2, ... Use those labels unless the",
    "  transcript makes a real name clear, then you may use the name.",
    "- Transcription is imperfect; note it when a passage looks garbled.",
    "- Be concise and concrete. No preamble.",
    "",
    `Recording title: ${title}`,
    "",
    "--- TRANSCRIPT START ---",
    transcript,
    "--- TRANSCRIPT END ---",
  ].join("\n");
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    recordingId?: string;
    message?: string;
    model?: string;
  };
  const question = body.message?.trim();
  if (!body.recordingId || !question) {
    return Response.json(
      { error: "recordingId and message are required" },
      { status: 400 },
    );
  }

  const doc = recordingDoc(body.recordingId);
  const snap = await doc.get();
  if (!snap.exists) {
    return Response.json({ error: "recording not found" }, { status: 404 });
  }

  const data = snap.data() as {
    title?: string;
    transcript?: { text?: string; utterances?: Utterance[] };
  };
  if (!data.transcript) {
    return Response.json(
      { error: "this recording has not been transcribed yet" },
      { status: 409 },
    );
  }
  if (!data.transcript.text?.trim() && !data.transcript.utterances?.length) {
    return Response.json(
      { error: "no speech was detected in this recording, so there is nothing to discuss" },
      { status: 409 },
    );
  }

  const messagesRef = doc.collection("messages");
  const historySnap = await messagesRef
    .orderBy("createdAt", "desc")
    .limit(HISTORY_TURNS)
    .get();
  const history = historySnap.docs
    .map((d) => d.data() as ChatMessage)
    .reverse()
    .map<LlmMessage>((m) => ({ role: m.role, content: m.content }));

  const transcript = transcriptForPrompt(data.transcript);
  const model = body.model || DEFAULT_MODEL;

  const llmMessages: LlmMessage[] = [
    { role: "system", content: systemPrompt(data.title || "Untitled", transcript) },
    ...history,
    { role: "user", content: question },
  ];

  // Persist the question before streaming so the thread survives a dropped
  // connection mid-answer.
  const userMsgRef = messagesRef.doc();
  await userMsgRef.set({
    id: userMsgRef.id,
    role: "user",
    content: question,
    createdAt: Date.now(),
  });

  try {
    const stream = await streamChat(llmMessages, model, async (fullText) => {
      if (!fullText.trim()) return;
      const ref = messagesRef.doc();
      await ref.set({
        id: ref.id,
        role: "assistant",
        content: fullText,
        createdAt: Date.now(),
        model,
      });
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Model": model,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
