"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Pencil, RefreshCw, Trash2 } from "lucide-react";
import RecordingTabs from "@/components/RecordingTabs";
import {
  audioUrl,
  deleteRecording,
  getRecording,
  renameRecording,
  summarize,
  transcribe,
  updateUtterance,
} from "@/lib/client-api";
import { usePoll } from "@/lib/use-poll";
import { formatBytes, formatTimestamp, hasSpeech, type Recording } from "@/lib/types";

const isBusy = (r: Recording) =>
  r.status === "uploading" || r.status === "uploaded" || r.status === "transcribing";

export default function RecordingPage() {
  const params = useParams<{ id: string }>();
  const recordingId = params.id;
  const router = useRouter();

  const [currentTime, setCurrentTime] = useState(0);
  const [editingTitle, setEditingTitle] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  // Guards the automatic first summary so a re-render can't fire it twice.
  const autoSummaryFired = useRef(false);

  const {
    data: recording,
    error,
    loading,
    refresh,
    setData,
  } = usePoll(() => getRecording(recordingId), { keepPolling: isBusy }, [recordingId]);

  const runSummarize = useCallback(
    async (force: boolean) => {
      setSummarizing(true);
      setSummaryError(null);
      try {
        await summarize(recordingId, force);
        refresh();
      } catch (err) {
        setSummaryError(err instanceof Error ? err.message : String(err));
      } finally {
        setSummarizing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recordingId],
  );

  // Summarize once, as soon as a transcript exists, so the tab is already
  // populated by the time the user opens it.
  useEffect(() => {
    if (autoSummaryFired.current) return;
    if (recording?.status !== "transcribed" || recording.summary) return;
    // Silence produces an empty transcript — summarizing it would just 409.
    if (!hasSpeech(recording)) return;
    autoSummaryFired.current = true;
    void runSummarize(false);
  }, [recording?.status, recording?.summary, runSummarize]);

  async function retryTranscription() {
    setRetrying(true);
    setActionError(null);
    try {
      await transcribe(recordingId);
      refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setRetrying(false);
    }
  }

  async function saveTitle(title: string) {
    setEditingTitle(false);
    const trimmed = title.trim();
    if (!trimmed || trimmed === recording?.title) return;
    try {
      await renameRecording(recordingId, trimmed);
      if (recording) setData({ ...recording, title: trimmed });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  async function remove() {
    if (!confirm("Delete this recording, its transcript and its chat history?")) return;
    try {
      await deleteRecording(recordingId);
      router.push("/recordings");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  /** Saves one edited line and swaps in the server's copy of the recording. */
  async function editUtterance(index: number, text: string) {
    const updated = await updateUtterance(recordingId, index, text);
    setData(updated);
  }

  function seek(seconds: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = seconds;
    void audio.play();
  }

  if (loading && !recording) {
    return (
      <div className="space-y-4 py-6">
        <BackLink />
        <p className="flex items-center gap-2 text-sm">
          <Loader2 size={15} className="animate-spin" /> Loading…
        </p>
      </div>
    );
  }

  if (!recording) {
    return (
      <div className="space-y-4 py-6">
        <BackLink />
        <p className="rounded-xl border-2 border-ink px-4 py-3 text-sm break-words">
          {error ?? "That recording doesn't exist."}
        </p>
      </div>
    );
  }

  const ready = recording.status === "transcribed" && Boolean(recording.transcript);

  return (
    <div className="space-y-4 py-6">
      <BackLink />

      <header className="space-y-1">
        {editingTitle ? (
          <input
            autoFocus
            defaultValue={recording.title}
            onBlur={(e) => void saveTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void saveTitle(e.currentTarget.value);
              if (e.key === "Escape") setEditingTitle(false);
            }}
            className="w-full rounded-lg border border-line px-3 py-1.5 text-xl font-semibold outline-none focus:border-ink"
          />
        ) : (
          <div className="flex items-start gap-1">
            <h1 className="mt-1.5 min-w-0 flex-1 text-xl font-semibold tracking-tight">
              {recording.title}
            </h1>
            {/* 44px hit areas, and a gap before Delete so it isn't mis-tapped. */}
            <button
              onClick={() => setEditingTitle(true)}
              className="tap grid shrink-0 place-items-center rounded-full"
              aria-label="Rename"
            >
              <Pencil size={17} strokeWidth={1.9} />
            </button>
            <button
              onClick={() => void remove()}
              className="tap ml-1 grid shrink-0 place-items-center rounded-full"
              aria-label="Delete recording"
            >
              <Trash2 size={17} strokeWidth={1.9} />
            </button>
          </div>
        )}
        <p className="text-[12px] uppercase tracking-wide">
          {new Date(recording.createdAt).toLocaleString()} ·{" "}
          {formatTimestamp(recording.durationMs / 1000)} ·{" "}
          {formatBytes(recording.sizeBytes)}
        </p>
      </header>

      {recording.chunkCount ? (
        <audio
          ref={audioRef}
          src={audioUrl(recordingId)}
          controls
          preload="metadata"
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          className="w-full rounded-xl border border-line p-2"
        />
      ) : null}

      {isBusy(recording) && (
        <p className="flex items-center gap-2 rounded-xl border border-line px-4 py-3 text-sm">
          <Loader2 size={15} className="animate-spin" />
          {recording.status === "transcribing"
            ? "Transcribing. This page updates itself when it's done."
            : recording.status === "uploading"
              ? "Saving audio…"
              : "Queued for transcription…"}
        </p>
      )}

      {(recording.status === "error" || actionError) && (
        <div className="rounded-xl border-2 border-ink px-4 py-3 text-sm">
          <p className="break-words">{actionError || recording.error}</p>
          <button
            onClick={() => void retryTranscription()}
            disabled={retrying}
            className="mt-3 flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 text-[13px] font-semibold text-page transition active:opacity-80 disabled:opacity-40"
          >
            {retrying ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
            Retry transcription
          </button>
        </div>
      )}

      {ready && (
        <RecordingTabs
          recording={recording}
          currentTime={currentTime}
          onSeek={seek}
          summarizing={summarizing}
          summaryError={summaryError}
          onRegenerate={() => void runSummarize(true)}
          onEditUtterance={editUtterance}
        />
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/recordings"
      className="-ml-1 inline-flex min-h-11 items-center gap-1.5 px-1 text-[13px] font-medium uppercase tracking-wide"
    >
      <ArrowLeft size={15} strokeWidth={2} /> Recordings
    </Link>
  );
}
