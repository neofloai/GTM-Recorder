import { recordingDoc } from "@/lib/firebase/admin";
import { complete, DEFAULT_MODEL } from "@/lib/openrouter";
import { transcriptForPrompt } from "@/lib/transcript";
import type { Utterance } from "@/lib/types";

export const maxDuration = 300;

const SYSTEM = [
  "You summarize transcripts of audio recordings.",
  "The transcript is diarized by speaker and timestamped as [mm:ss].",
  "",
  "Return GitHub-flavored Markdown using exactly these sections, in this order,",
  "and omit any section that genuinely has no content:",
  "",
  "## Overview",
  "Two or three sentences on what this recording is and what happened.",
  "",
  "## Key points",
  "- Bullets covering the substance. Cite timestamps like [12:34].",
  "",
  "## Decisions",
  "- Each decision made, with who made it if the transcript shows that.",
  "",
  "## Action items",
  "- Each task, its owner if stated, and a timestamp.",
  "",
  "## Open questions",
  "- Anything raised but left unresolved.",
  "",
  "Rules:",
  "- Use only what the transcript supports. Never invent an owner, date or decision.",
  "- Speakers are Speaker 1, Speaker 2, ... unless the transcript makes a real name",
  "  clear, in which case use the name.",
  "- Transcription is imperfect; say so if a passage is too garbled to summarize.",
  "- No preamble and no closing remarks. Start with the `## Overview` heading.",
].join("\n");

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    recordingId?: string;
    model?: string;
    /** Set by the "Regenerate" button to bypass the cached summary. */
    force?: boolean;
  };
  if (!body.recordingId) {
    return Response.json({ error: "recordingId is required" }, { status: 400 });
  }

  const doc = recordingDoc(body.recordingId);
  const snap = await doc.get();
  if (!snap.exists) {
    return Response.json({ error: "recording not found" }, { status: 404 });
  }

  const data = snap.data() as {
    title?: string;
    transcript?: { text?: string; utterances?: Utterance[] };
    summary?: { text?: string };
    summaryStale?: boolean;
  };
  if (!data.transcript) {
    return Response.json(
      { error: "this recording has not been transcribed yet" },
      { status: 409 },
    );
  }
  if (!data.transcript.text?.trim() && !data.transcript.utterances?.length) {
    return Response.json(
      { error: "no speech was detected in this recording, so there is nothing to summarize" },
      { status: 409 },
    );
  }

  // The detail page fires this automatically on first view, so a cached summary
  // short-circuits instead of re-billing the model on every visit.
  if (data.summary?.text && !body.force && !data.summaryStale) {
    return Response.json({ ok: true, cached: true });
  }

  const model = body.model || DEFAULT_MODEL;

  try {
    const text = await complete(
      [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            `Recording title: ${data.title || "Untitled"}`,
            "",
            "--- TRANSCRIPT START ---",
            transcriptForPrompt(data.transcript),
            "--- TRANSCRIPT END ---",
          ].join("\n"),
        },
      ],
      model,
    );

    await doc.update({
      summary: { text, model, generatedAt: Date.now() },
      // This summary now reflects the current transcript.
      summaryStale: false,
    });

    return Response.json({ ok: true, cached: false, characters: text.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
