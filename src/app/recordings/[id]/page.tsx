"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CircleAlert,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import RecordingTabs from "@/components/RecordingTabs";
import {
  audioUrl,
  deleteRecording,
  getRecording,
  renameRecording,
  summarize,
  transcribe,
} from "@/lib/client-api";
import { usePoll } from "@/lib/use-poll";
import { formatBytes, formatTimestamp, type Recording } from "@/lib/types";

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
    // refresh is stable enough for this purpose; recordingId is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recordingId],
  );

  // Summarize once, as soon as a transcript exists, so the tab is already
  // populated by the time the user opens it.
  useEffect(() => {
    if (autoSummaryFired.current) return;
    if (recording?.status !== "transcribed" || recording.summary) return;
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
      router.push("/");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  function seek(seconds: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = seconds;
    void audio.play();
  }

  if (loading && !recording) {
    return (
      <div className="space-y-4">
        <BackLink />
        <p className="flex items-center gap-2 text-sm text-subtle">
          <Loader2 size={14} className="animate-spin" /> Loading recording…
        </p>
      </div>
    );
  }

  if (!recording) {
    return (
      <div className="space-y-4">
        <BackLink />
        <p className="flex items-start gap-2 rounded-2xl border border-brand/30 bg-brand/5 px-4 py-3 text-sm text-brand">
          <CircleAlert size={16} className="mt-0.5 shrink-0" />
          <span className="break-words">{error ?? "That recording doesn't exist."}</span>
        </p>
      </div>
    );
  }

  const ready = recording.status === "transcribed" && Boolean(recording.transcript);

  return (
    <div className="space-y-5">
      <BackLink />

      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {editingTitle ? (
          <input
            autoFocus
            defaultValue={recording.title}
            onBlur={(e) => void saveTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void saveTitle(e.currentTarget.value);
              if (e.key === "Escape") setEditingTitle(false);
            }}
            className="flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-[22px] font-semibold outline-none focus:border-focus"
          />
        ) : (
          <h1 className="flex items-center gap-2 text-[22px] font-semibold tracking-tight">
            {recording.title}
            <button
              onClick={() => setEditingTitle(true)}
              className="text-subtle transition hover:text-strong"
              aria-label="Rename"
            >
              <Pencil size={14} />
            </button>
          </h1>
        )}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-subtle">
            {new Date(recording.createdAt).toLocaleString()} ·{" "}
            {formatTimestamp(recording.durationMs / 1000)} ·{" "}
            {formatBytes(recording.sizeBytes)}
          </span>
          <button
            onClick={() => void remove()}
            className="text-subtle transition hover:text-brand"
            aria-label="Delete recording"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </header>

      {recording.chunkCount ? (
        <audio
          ref={audioRef}
          src={audioUrl(recordingId)}
          controls
          preload="metadata"
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          className="w-full rounded-xl border border-line bg-raised p-2"
        />
      ) : null}

      {isBusy(recording) && (
        <p className="flex items-center gap-2 rounded-2xl border border-line bg-raised px-4 py-3 text-sm text-subtle">
          <Loader2 size={14} className="animate-spin" />
          {recording.status === "transcribing"
            ? "Deepgram is transcribing this recording. This page updates itself when it's done."
            : recording.status === "uploading"
              ? "Saving audio…"
              : "Queued for transcription…"}
        </p>
      )}

      {(recording.status === "error" || actionError) && (
        <div className="rounded-2xl border border-brand/30 bg-brand/5 px-4 py-3 text-sm">
          <p className="flex items-start gap-2 text-brand">
            <CircleAlert size={16} className="mt-0.5 shrink-0" />
            <span className="break-words">{actionError || recording.error}</span>
          </p>
          <button
            onClick={() => void retryTranscription()}
            disabled={retrying}
            className="mt-3 flex items-center gap-2 rounded-lg border border-brand/40 px-3 py-1.5 text-xs font-medium text-brand transition hover:bg-brand/10 disabled:opacity-50"
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
        />
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-1.5 text-sm text-subtle transition hover:text-strong"
    >
      <ArrowLeft size={14} /> All recordings
    </Link>
  );
}
