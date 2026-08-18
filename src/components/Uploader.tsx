"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { createRecording, transcribe } from "@/lib/client-api";
import {
  ACCEPT_ATTR,
  MAX_AUDIO_BYTES,
  formatMaxSize,
  looksLikeAudio,
  probeDuration,
  titleFromFilename,
} from "@/lib/audio";
import { formatBytes } from "@/lib/types";

/**
 * Upload an existing audio file into the same pipeline the recorder uses:
 * POST /api/recordings, then transcription. Tap-to-pick on a phone, and
 * drag-and-drop as well on desktop.
 */
export default function Uploader() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);

    if (!looksLikeAudio(file)) {
      setError(`"${file.name}" doesn't look like an audio file.`);
      return;
    }
    if (file.size === 0) {
      setError(`"${file.name}" is empty.`);
      return;
    }
    if (file.size > MAX_AUDIO_BYTES) {
      setError(
        `"${file.name}" is ${formatBytes(file.size)} — the limit is ${formatMaxSize()}.`,
      );
      return;
    }

    setBusy(true);
    setProgress(0);
    try {
      setStage("Reading file");
      const durationMs = await probeDuration(file);

      setStage("Uploading");
      const id = await createRecording(
        file,
        durationMs,
        titleFromFilename(file.name),
        setProgress,
      );

      // Same as the recorder: fire and forget, the detail page polls for status.
      setStage("Transcribing");
      void transcribe(id).catch(() => {});
      router.push(`/recordings/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setProgress(0);
      setStage("");
      // Let the same file be picked again after a failure.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="w-full max-w-xs space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void handleFile(file);
        }}
        className={`flex w-full items-center justify-center gap-2 rounded-full border-2 border-ink px-5 py-3.5 text-sm font-semibold transition disabled:opacity-50 ${
          dragging ? "bg-ink text-page" : "bg-page text-ink"
        }`}
      >
        {busy ? (
          <Loader2 size={17} className="animate-spin" />
        ) : (
          <Upload size={17} strokeWidth={2} />
        )}
        {busy ? stage || "Uploading" : "Upload a recording"}
      </button>

      {busy && (
        <div
          className="h-1.5 overflow-hidden rounded-full bg-wash"
          role="progressbar"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-ink transition-all"
            style={{ width: `${Math.max(4, Math.round(progress * 100))}%` }}
          />
        </div>
      )}

      {!busy && (
        <p className="text-center text-[12px]">
          MP3, M4A, WAV, FLAC, OGG or WebM · up to {formatMaxSize()}
        </p>
      )}

      {error && (
        <p className="rounded-xl border-2 border-ink px-3 py-2 text-[13px] break-words">
          {error}
        </p>
      )}
    </div>
  );
}
