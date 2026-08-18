"use client";

import { useState } from "react";
import { Check, Copy, Loader2, RefreshCw } from "lucide-react";
import Markdown from "@/components/Markdown";
import type { Recording } from "@/lib/types";

type Props = {
  recording: Recording;
  generating: boolean;
  error: string | null;
  onRegenerate: () => void;
};

export default function SummaryView({
  recording,
  generating,
  error,
  onRegenerate,
}: Props) {
  const [copied, setCopied] = useState(false);
  const summary = recording.summary;

  async function copy() {
    if (!summary) return;
    await navigator.clipboard.writeText(summary.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (generating && !summary) {
    return (
      <div className="grid place-items-center gap-3 px-4 py-20 text-center">
        <Loader2 size={22} className="animate-spin" />
        <p className="text-sm">Writing the summary…</p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="grid place-items-center gap-4 px-4 py-16 text-center">
        <p className="text-sm font-medium">No summary yet</p>
        {error && <p className="max-w-md text-[13px]">{error}</p>}
        <button
          onClick={onRegenerate}
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-page transition active:opacity-80"
        >
          Generate summary
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
        <span className="min-w-0 flex-1 truncate text-[12px] uppercase tracking-wide">
          {summary.model}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={copy}
            className="flex items-center gap-1.5 rounded-full border border-ink px-3 py-1.5 text-[12px] font-medium transition active:bg-ink active:text-page"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            onClick={onRegenerate}
            disabled={generating}
            className="flex items-center gap-1.5 rounded-full border border-ink px-3 py-1.5 text-[12px] font-medium transition active:bg-ink active:text-page disabled:opacity-40"
            aria-label="Regenerate summary"
          >
            {generating ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
          </button>
        </div>
      </div>

      {error && <p className="border-b border-hairline px-4 py-2.5 text-[13px]">{error}</p>}

      <div className="max-h-[55vh] overflow-y-auto px-4 py-4">
        <Markdown text={summary.text} />
      </div>
    </div>
  );
}
