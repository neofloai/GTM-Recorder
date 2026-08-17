import { formatForPrompt } from "@/lib/deepgram";
import type { Utterance } from "@/lib/types";

/** Roughly 100k tokens of transcript — comfortable for any long-context model. */
const MAX_TRANSCRIPT_CHARS = 400_000;

/**
 * Renders the stored transcript as `[mm:ss] Speaker N: …` and elides the middle
 * if it would blow the context budget. Shared by the chat and summary routes so
 * both reason over exactly the same text.
 */
export function transcriptForPrompt(transcript: {
  text?: string;
  utterances?: Utterance[];
}): string {
  const rendered = formatForPrompt(transcript.utterances ?? [], transcript.text ?? "");
  if (rendered.length <= MAX_TRANSCRIPT_CHARS) return rendered;

  const half = Math.floor(MAX_TRANSCRIPT_CHARS / 2);
  return [
    rendered.slice(0, half),
    "\n\n[... middle of the transcript omitted because it exceeds the context budget ...]\n\n",
    rendered.slice(-half),
  ].join("");
}
