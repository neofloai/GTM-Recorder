"use client";

import { useState } from "react";
import { Check, Copy, Loader2, Pencil } from "lucide-react";
import { formatTimestamp, hasSpeech, type Recording } from "@/lib/types";

type Props = {
  recording: Recording;
  currentTime: number;
  onSeek: (seconds: number) => void;
  /** Persists one edited utterance; resolves once saved. */
  onEditUtterance: (index: number, text: string) => Promise<void>;
};

export default function TranscriptView({
  recording,
  currentTime,
  onSeek,
  onEditUtterance,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const transcript = recording.transcript;
  if (!transcript) return null;

  if (!hasSpeech(recording)) {
    return (
      <div className="grid place-items-center gap-2 px-4 py-16 text-center">
        <p className="text-sm font-medium">No speech detected</p>
        <p className="max-w-xs text-[13px]">
          This recording was processed, but no words were found in the audio. Check
          your microphone and try again.
        </p>
      </div>
    );
  }

  async function copyAll() {
    const body = transcript!.utterances.length
      ? transcript!.utterances
          .map((u) => `[${formatTimestamp(u.start)}] Speaker ${u.speaker + 1}: ${u.text}`)
          .join("\n")
      : transcript!.text;
    await navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function beginEdit(index: number, text: string) {
    setError(null);
    setEditing(index);
    setDraft(text);
  }

  async function commit(index: number) {
    const next = draft.trim();
    const current = transcript!.utterances[index]?.text ?? "";
    setEditing(null);
    if (next === current) return;

    setSavingIndex(index);
    setError(null);
    try {
      await onEditUtterance(index, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingIndex(null);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 border-b border-hairline px-4 py-3">
        <span className="min-w-0 flex-1 truncate text-[12px] uppercase tracking-wide">
          {transcript.speakerCount || 1} speaker
          {transcript.speakerCount > 1 ? "s" : ""} · {transcript.model}
          {transcript.editedAt ? " · edited" : ""}
        </span>
        <button
          onClick={copyAll}
          className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-ink px-4 text-[12px] font-medium transition active:bg-ink active:text-page"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <p className="border-b border-hairline px-4 py-2 text-[12px]">
        Tap any line to correct it.
      </p>

      {error && (
        <p className="border-b border-hairline px-4 py-2.5 text-[13px] break-words">
          {error}
        </p>
      )}

      <div className="max-h-[55vh] overflow-y-auto px-4 py-4">
        <ul className="space-y-1">
          {transcript.utterances.map((u, i) => {
            const active = currentTime >= u.start && currentTime < u.end;
            const isEditing = editing === i;
            return (
              <li
                key={`${u.start}-${i}`}
                className={`border-l-2 py-2 pl-3 transition ${
                  active && !isEditing ? "border-ink bg-wash" : "border-transparent"
                }`}
              >
                <div className="mb-1 flex items-baseline gap-2 text-[12px]">
                  <button
                    onClick={() => onSeek(u.start)}
                    className="-my-2 -ml-1 inline-flex min-h-11 items-center px-1 font-mono tabular-nums underline decoration-dotted underline-offset-2"
                    title="Jump to this moment"
                  >
                    {formatTimestamp(u.start)}
                  </button>
                  <span className="font-semibold uppercase tracking-wide">
                    Speaker {u.speaker + 1}
                  </span>
                  {savingIndex === i && <Loader2 size={11} className="animate-spin" />}
                  {!isEditing && savingIndex !== i && (
                    <Pencil size={11} className="opacity-40" strokeWidth={2} />
                  )}
                </div>

                {isEditing ? (
                  <textarea
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => void commit(i)}
                    onKeyDown={(e) => {
                      // Enter saves; Shift+Enter allows a line break.
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void commit(i);
                      }
                      if (e.key === "Escape") setEditing(null);
                    }}
                    rows={Math.max(2, Math.ceil(draft.length / 42))}
                    aria-label={`Edit the line at ${formatTimestamp(u.start)}`}
                    className="w-full resize-none rounded-lg border border-ink px-2.5 py-2 text-[15px] leading-relaxed outline-none"
                  />
                ) : (
                  <button
                    onClick={() => beginEdit(i, u.text)}
                    className="block w-full py-1 text-left text-[15px] leading-relaxed"
                  >
                    {u.text || <span className="opacity-40">(empty — tap to write)</span>}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
