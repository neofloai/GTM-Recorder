"use client";

import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { formatTimestamp, type Recording } from "@/lib/types";

/** Speaker tints chosen to stay legible on white. */
const SPEAKER_COLORS = [
  "text-sky-700",
  "text-emerald-700",
  "text-amber-700",
  "text-violet-700",
  "text-rose-700",
  "text-teal-700",
];

type Props = {
  recording: Recording;
  currentTime: number;
  onSeek: (seconds: number) => void;
};

export default function TranscriptView({ recording, currentTime, onSeek }: Props) {
  const [copied, setCopied] = useState(false);
  const transcript = recording.transcript;

  if (!transcript) return null;

  async function copyAll() {
    const body = transcript!.utterances.length
      ? transcript!.utterances
          .map(
            (u) =>
              `[${formatTimestamp(u.start)}] Speaker ${u.speaker + 1}: ${u.text}`,
          )
          .join("\n")
      : transcript!.text;
    await navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div>
      <div className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
        <span className="min-w-0 flex-1 truncate text-xs text-subtle">
          {transcript.speakerCount || 1} speaker
          {transcript.speakerCount > 1 ? "s" : ""} · {transcript.model}
          {transcript.language ? ` · ${transcript.language}` : ""}
        </span>
        <button
          onClick={copyAll}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-subtle transition hover:border-subtle hover:text-strong"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <div className="max-h-[58vh] overflow-y-auto px-3 py-4 sm:px-5">
        {transcript.utterances.length ? (
          <ul className="space-y-1">
            {transcript.utterances.map((u, i) => {
              const active = currentTime >= u.start && currentTime < u.end;
              return (
                <li
                  key={`${u.start}-${i}`}
                  className={`rounded-lg px-2.5 py-2 transition ${
                    active ? "bg-amber-50 ring-1 ring-amber-200" : ""
                  }`}
                >
                  <div className="mb-1 flex items-baseline gap-2 text-xs">
                    <button
                      onClick={() => onSeek(u.start)}
                      className="font-mono tabular-nums text-subtle underline decoration-dotted underline-offset-2 transition hover:text-strong"
                      title="Jump to this moment"
                    >
                      {formatTimestamp(u.start)}
                    </button>
                    <span
                      className={`font-semibold ${SPEAKER_COLORS[u.speaker % SPEAKER_COLORS.length]}`}
                    >
                      Speaker {u.speaker + 1}
                    </span>
                  </div>
                  <p className="text-[14.5px] leading-relaxed text-strong">{u.text}</p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-strong">
            {transcript.text}
          </p>
        )}
      </div>
    </div>
  );
}
