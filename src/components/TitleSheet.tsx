"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { formatBytes, formatTimestamp } from "@/lib/types";

type Props = {
  /** Prefilled suggestion — the filename for uploads, empty for recordings. */
  initialTitle?: string;
  sizeBytes: number;
  durationMs: number;
  saving: boolean;
  error: string | null;
  onSave: (title: string) => void;
  onDiscard: () => void;
};

/**
 * Asks for a title before anything is saved. The title is mandatory, so Save
 * stays disabled until the field has content and the route rejects a blank one
 * as well.
 */
export default function TitleSheet({
  initialTitle = "",
  sizeBytes,
  durationMs,
  saving,
  error,
  onSave,
  onDiscard,
}: Props) {
  const [title, setTitle] = useState(initialTitle);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus and select so an offered filename can be typed straight over.
    inputRef.current?.focus();
    inputRef.current?.select();
    // iOS doesn't shrink the viewport for the keyboard, so make sure the field
    // and the buttons under it are scrolled into view.
    inputRef.current?.scrollIntoView({ block: "center" });
  }, []);

  const trimmed = title.trim();
  const canSave = trimmed.length > 0 && !saving;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Name this recording"
      className="fixed inset-0 z-50 flex flex-col justify-end overflow-y-auto bg-ink/40 sm:items-center sm:justify-center"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) onSave(trimmed);
        }}
        className="panel-in w-full rounded-t-2xl border-t-2 border-ink bg-page p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:max-w-sm sm:rounded-2xl sm:border-2 sm:pb-5"
      >
        <h2 className="text-lg font-semibold tracking-tight">Name this recording</h2>
        <p className="mt-1 text-[12px] uppercase tracking-wide">
          {formatTimestamp(durationMs / 1000)} · {formatBytes(sizeBytes)}
        </p>

        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={saving}
          maxLength={120}
          placeholder="e.g. Weekly product sync"
          aria-label="Title"
          aria-required="true"
          className="mt-4 w-full rounded-xl border border-line px-3.5 py-3 text-[16px] outline-none placeholder:text-placeholder focus:border-ink disabled:opacity-50"
        />
        <p className="mt-2 text-[12px]">
          {trimmed ? " " : "A title is required."}
        </p>

        {error && (
          <p className="mt-1 rounded-xl border-2 border-ink px-3 py-2 text-[13px] break-words">
            {error}
          </p>
        )}

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={onDiscard}
            disabled={saving}
            className="flex-1 rounded-full border-2 border-ink px-4 py-3 text-sm font-semibold transition active:bg-ink active:text-page disabled:opacity-40"
          >
            Discard
          </button>
          <button
            type="submit"
            disabled={!canSave}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-ink px-4 py-3 text-sm font-semibold text-page transition active:opacity-80 disabled:opacity-30"
          >
            {saving && <Loader2 size={15} className="animate-spin" />}
            {saving ? "Saving" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
