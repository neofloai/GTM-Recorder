"use client";

import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { formatTimestamp, hasSpeech, type Recording } from "@/lib/types";

type Props = {
  recording: Recording;
  currentTime: number;
  onSeek: (seconds: number) => void;
};

export default function TranscriptView({ recording, currentTime, onSeek }: Props) {
  const [copied, setCopied] = useState(false);
  const transcript = recording.transcript;

  if (!transcript) return null;

  // Deepgram returns an empty transcript for silence or non-speech audio; say so
  // rather than showing an empty panel that looks broken.
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

  return (
    <div>
      <div className="flex items-center gap-3 border-b border-hairline px-4 py-3">
        <span className="min-w-0 flex-1 truncate text-[12px] uppercase tracking-wide">
          {transcript.speakerCount || 1} speaker
          {transcript.speakerCount > 1 ? "s" : ""} · {transcript.model}
        </span>
        <button
          onClick={copyAll}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-ink px-3 py-1.5 text-[12px] font-medium transition active:bg-ink active:text-page"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <div className="max-h-[55vh] overflow-y-auto px-4 py-4">
        {transcript.utterances.length ? (
          <ul className="space-y-1">
            {transcript.utterances.map((u, i) => {
              const active = currentTime >= u.start && currentTime < u.end;
              return (
                <li
                  key={`${u.start}-${i}`}
                  /* The playing line is marked by a grey wash and a black rule —
                     no colour needed. */
                  className={`border-l-2 py-2 pl-3 transition ${
                    active ? "border-ink bg-wash" : "border-transparent"
                  }`}
                >
                  <div className="mb-1 flex items-baseline gap-2 text-[12px]">
                    <button
                      onClick={() => onSeek(u.start)}
                      className="font-mono tabular-nums underline decoration-dotted underline-offset-2"
                      title="Jump to this moment"
                    >
                      {formatTimestamp(u.start)}
                    </button>
                    <span className="font-semibold uppercase tracking-wide">
                      Speaker {u.speaker + 1}
                    </span>
                  </div>
                  <p className="text-[15px] leading-relaxed">{u.text}</p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
            {transcript.text}
          </p>
        )}
      </div>
    </div>
  );
}
