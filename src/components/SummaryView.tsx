"use client";

import { useState } from "react";
import { Check, Copy, Loader2, RefreshCw, Sparkles } from "lucide-react";
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
        <Loader2 size={22} className="animate-spin text-subtle" />
        <p className="text-sm text-subtle">
          Writing the summary from the transcript…
        </p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="grid place-items-center gap-4 px-4 py-16 text-center">
        <Sparkles size={22} className="text-subtle" />
        <div>
          <p className="text-sm font-medium">No summary yet</p>
          {error && <p className="mt-1 max-w-md text-xs text-brand">{error}</p>}
        </div>
        <button
          onClick={onRegenerate}
          className="rounded-lg bg-strong px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
        >
          Generate summary
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
        <span className="min-w-0 flex-1 truncate text-xs text-subtle">
          {summary.model} · {new Date(summary.generatedAt).toLocaleString()}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={copy}
            className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-subtle transition hover:border-subtle hover:text-strong"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            onClick={onRegenerate}
            disabled={generating}
            className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-subtle transition hover:border-subtle hover:text-strong disabled:opacity-50"
          >
            {generating ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
            Regenerate
          </button>
        </div>
      </div>

      {error && (
        <p className="border-b border-line bg-brand/5 px-5 py-2.5 text-xs text-brand">
          {error}
        </p>
      )}

      <div className="max-h-[58vh] overflow-y-auto px-4 py-4 sm:px-5">
        <Markdown text={summary.text} />
      </div>
    </div>
  );
}
