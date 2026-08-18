"use client";

import Link from "next/link";
import { ChevronRight, Loader2 } from "lucide-react";
import { listRecordings } from "@/lib/client-api";
import { usePoll } from "@/lib/use-poll";
import { formatBytes, formatTimestamp, type Recording } from "@/lib/types";

const STATUS_LABEL: Record<Recording["status"], string> = {
  uploading: "Saving",
  uploaded: "Queued",
  transcribing: "Transcribing",
  transcribed: "Ready",
  error: "Failed",
};

/** Anything unfinished means the list is still worth re-checking. */
const isBusy = (r: Recording) =>
  r.status === "uploading" || r.status === "uploaded" || r.status === "transcribing";

export default function RecordingsList() {
  const { data: recordings, error, loading } = usePoll(listRecordings, {
    keepPolling: (list) => list.some(isBusy),
    intervalMs: 2500,
  });

  if (error) {
    return (
      <p className="rounded-xl border-2 border-ink px-4 py-3 text-sm break-words">
        {error}
      </p>
    );
  }

  if (loading || !recordings) {
    return (
      <p className="flex items-center gap-2 text-sm">
        <Loader2 size={15} className="animate-spin" /> Loading…
      </p>
    );
  }

  if (!recordings.length) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-14 text-center text-sm">
        No recordings yet. Go to the Record tab and tap the microphone.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-hairline overflow-hidden rounded-xl border border-line">
      {recordings.map((r) => (
        <li key={r.id}>
          <Link
            href={`/recordings/${r.id}`}
            className="flex items-center gap-3 px-4 py-4 transition active:bg-wash sm:hover:bg-wash"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{r.title}</span>
              <span className="mt-0.5 block truncate text-[13px]">
                {formatTimestamp(r.durationMs / 1000)} · {formatBytes(r.sizeBytes)}
                {r.transcript?.speakerCount
                  ? ` · ${r.transcript.speakerCount} speaker${r.transcript.speakerCount > 1 ? "s" : ""}`
                  : ""}
              </span>
            </span>
            {/* Status reads as an outlined chip, filled once it's ready. */}
            <span
              className={`shrink-0 rounded-full border border-ink px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${
                r.status === "transcribed" ? "bg-ink text-page" : "bg-page text-ink"
              }`}
            >
              {STATUS_LABEL[r.status]}
            </span>
            <ChevronRight size={18} className="shrink-0" strokeWidth={1.8} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
