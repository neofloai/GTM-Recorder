"use client";

import Link from "next/link";
import { AudioLines, ChevronRight, CircleAlert, Loader2 } from "lucide-react";
import { listRecordings } from "@/lib/client-api";
import { usePoll } from "@/lib/use-poll";
import { formatBytes, formatTimestamp, type Recording } from "@/lib/types";

const STATUS_LABEL: Record<Recording["status"], string> = {
  uploading: "Uploading",
  uploaded: "Queued",
  transcribing: "Transcribing",
  transcribed: "Ready",
  error: "Failed",
};

const STATUS_STYLE: Record<Recording["status"], string> = {
  uploading: "bg-raised text-subtle",
  uploaded: "bg-raised text-subtle",
  transcribing: "bg-amber-50 text-amber-800",
  transcribed: "bg-emerald-50 text-emerald-800",
  error: "bg-brand/10 text-brand",
};

/** Anything not yet finished means the list is still worth re-checking. */
const isBusy = (r: Recording) =>
  r.status === "uploading" || r.status === "uploaded" || r.status === "transcribing";

export default function RecordingsList() {
  const { data: recordings, error, loading } = usePoll(listRecordings, {
    keepPolling: (list) => list.some(isBusy),
    intervalMs: 2500,
  });

  if (error) {
    return (
      <p className="flex items-start gap-2 rounded-2xl border border-brand/30 bg-brand/5 px-4 py-3 text-sm text-brand">
        <CircleAlert size={16} className="mt-0.5 shrink-0" />
        <span className="break-words">{error}</span>
      </p>
    );
  }

  if (loading || !recordings) {
    return (
      <p className="flex items-center gap-2 px-1 text-sm text-subtle">
        <Loader2 size={14} className="animate-spin" /> Loading recordings…
      </p>
    );
  }

  if (!recordings.length) {
    return (
      <p className="rounded-2xl border border-dashed border-line px-4 py-12 text-center text-sm text-subtle">
        No recordings yet. Hit the record button above to make your first one.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {recordings.map((r) => (
        <li key={r.id}>
          <Link
            href={`/recordings/${r.id}`}
            className="flex items-center gap-4 px-4 py-3.5 transition hover:bg-raised"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-raised text-subtle">
              <AudioLines size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-medium">{r.title}</span>
              <span className="block truncate text-xs text-subtle">
                {formatTimestamp(r.durationMs / 1000)} · {formatBytes(r.sizeBytes)}
                {r.transcript?.speakerCount
                  ? ` · ${r.transcript.speakerCount} speaker${r.transcript.speakerCount > 1 ? "s" : ""}`
                  : ""}
                {r.summary ? " · summarized" : ""}
              </span>
            </span>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_STYLE[r.status]}`}
            >
              {STATUS_LABEL[r.status]}
            </span>
            <ChevronRight size={16} className="shrink-0 text-subtle" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
