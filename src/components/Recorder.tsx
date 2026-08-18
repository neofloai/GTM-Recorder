"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, Loader2 } from "lucide-react";
import TitleSheet from "@/components/TitleSheet";
import Uploader from "@/components/Uploader";
import { createRecording, transcribe } from "@/lib/client-api";
import { MAX_AUDIO_BYTES, formatMaxSize } from "@/lib/audio";
import { formatBytes, formatTimestamp } from "@/lib/types";

/** Browsers disagree on container support; take the first one that sticks. */
function pickMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "";
}

// "naming" holds the finished blob while the user supplies a mandatory title.
type Phase = "idle" | "recording" | "naming" | "saving";

/**
 * Browsers only expose getUserMedia in a secure context. Opening the dev server
 * from a phone over plain http://<lan-ip> therefore cannot record at all, which
 * is worth saying plainly instead of failing on tap.
 */
function micUnavailableReason(): string | null {
  if (typeof window === "undefined") return null;
  // The types say mediaDevices always exists; at runtime it is absent outside a
  // secure context, so this has to be checked rather than trusted.
  const media = (navigator as Navigator & { mediaDevices?: MediaDevices })
    .mediaDevices;
  if (media && typeof media.getUserMedia === "function") return null;
  if (!window.isSecureContext) {
    return "Recording needs a secure connection. Open this page over HTTPS or on localhost — on a phone, run `npm run dev:https` and use the https:// address.";
  }
  return "This browser doesn't support audio recording. You can still upload a file.";
}

export default function Recorder() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);
  const [stage, setStage] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // The finished recording, held back until it has been given a title.
  const [pending, setPending] = useState<{ blob: Blob; durationMs: number } | null>(
    null,
  );
  // Resolved on the client only, since it depends on window.
  const [micBlocked, setMicBlocked] = useState<string | null>(null);

  useEffect(() => setMicBlocked(micUnavailableReason()), []);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);

  const teardown = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setLevel(0);
  }, []);

  useEffect(() => teardown, [teardown]);

  useEffect(() => {
    if (phase !== "recording") return;
    const id = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 100);
    return () => clearInterval(id);
  }, [phase]);

  function startMeter(stream: MediaStream) {
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buffer = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteTimeDomainData(buffer);
      let sum = 0;
      for (const sample of buffer) {
        const centered = (sample - 128) / 128;
        sum += centered * centered;
      }
      setLevel(Math.min(1, Math.sqrt(sum / buffer.length) * 3));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  async function start() {
    setError(null);
    const blocked = micUnavailableReason();
    if (blocked) {
      setError(blocked);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      startMeter(stream);

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => void prepare(recorder.mimeType || mimeType);
      recorder.start(1000);
      recorderRef.current = recorder;

      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setPhase("recording");
    } catch (err) {
      teardown();
      setError(
        err instanceof Error && err.name === "NotAllowedError"
          ? "Microphone access was blocked. Allow it in your browser settings and try again."
          : `Could not start recording: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** The Submit button: stops capture, which hands off to prepare() via onstop. */
  function submit() {
    const recorder = recorderRef.current;
    if (!recorder || phase !== "recording") return;
    setPhase("naming");
    recorder.stop();
  }

  /** Assembles the blob and asks for a title; nothing is uploaded yet. */
  async function prepare(mimeType: string) {
    const durationMs = Date.now() - startedAtRef.current;
    teardown();

    const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
    chunksRef.current = [];

    if (blob.size === 0) {
      setPhase("idle");
      setError("The recording came back empty.");
      return;
    }
    if (blob.size > MAX_AUDIO_BYTES) {
      setPhase("idle");
      setError(
        `This recording is ${formatBytes(blob.size)}, over the ${formatMaxSize()} limit.`,
      );
      return;
    }

    setPending({ blob, durationMs });
  }

  async function save(title: string) {
    if (!pending) return;
    setPhase("saving");
    setError(null);
    setProgress(0);

    try {
      const id = await createRecording(
        pending.blob,
        pending.durationMs,
        title,
        setProgress,
      );

      // Kick transcription off without waiting; the detail page polls for status.
      void transcribe(id).catch(() => {});

      setPending(null);
      setPhase("idle");
      setStage("");
      setProgress(0);
      setElapsedMs(0);
      router.push(`/recordings/${id}`);
    } catch (err) {
      // Stay on the sheet so the title isn't lost and Save can be retried.
      setPhase("naming");
      setProgress(0);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function discard() {
    if (!confirm("Discard this recording? It hasn't been saved.")) return;
    setPending(null);
    setPhase("idle");
    setStage("");
    setError(null);
    setElapsedMs(0);
  }

  const saving = phase === "saving" || phase === "naming";
  const recording = phase === "recording";
  // The button grows slightly with your voice, so you can see the mic is live.
  const scale = recording ? 1 + level * 0.08 : 1;

  return (
    <div className="record-pane flex min-h-[calc(100dvh-9rem)] flex-col items-center justify-center gap-10 py-8 text-center">
      <div className="relative grid place-items-center">
        {recording && (
          <>
            <span className="record-ring absolute h-40 w-40 rounded-full border-2 border-ink" />
            <span
              className="record-ring absolute h-40 w-40 rounded-full border-2 border-ink"
              style={{ animationDelay: "0.8s" }}
            />
          </>
        )}

        <button
          onClick={recording ? submit : start}
          disabled={saving || Boolean(micBlocked)}
          aria-label={recording ? "Stop recording" : "Start recording"}
          style={{ transform: `scale(${scale})` }}
          className={`record-button relative grid h-40 w-40 place-items-center rounded-full border-2 border-ink transition-transform duration-75 disabled:opacity-40 ${
            recording ? "bg-page text-ink" : "bg-ink text-page"
          }`}
        >
          {saving ? (
            <Loader2 size={44} className="animate-spin" strokeWidth={1.5} />
          ) : recording ? (
            // A square reads universally as "stop".
            <span className="h-11 w-11 rounded-sm bg-ink" />
          ) : (
            <Mic size={52} strokeWidth={1.5} />
          )}
        </button>
      </div>

      <div className="space-y-2">
        <p className="record-timer font-mono text-4xl tabular-nums">
          {formatTimestamp(elapsedMs / 1000)}
        </p>
        <p className="flex items-center justify-center gap-2 text-sm">
          {recording && <span className="blink h-2 w-2 rounded-full bg-ink" />}
          {recording
            ? "Recording"
            : phase === "naming"
              ? "Name it to save"
              : saving
                ? stage || "Saving"
                : micBlocked
                  ? "Recording unavailable here"
                  : "Tap the microphone to start"}
        </p>
      </div>

      {recording && (
        <button
          onClick={submit}
          className="w-full max-w-xs rounded-full bg-ink px-8 py-4 text-base font-semibold text-page transition active:opacity-80"
        >
          Submit
        </button>
      )}

      {saving && progress > 0 && (
        <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-wash">
          <div
            className="h-full bg-ink transition-all"
            style={{ width: `${Math.max(4, Math.round(progress * 100))}%` }}
          />
        </div>
      )}

      {micBlocked && (
        <p className="max-w-xs rounded-xl border-2 border-ink px-4 py-3 text-[13px] leading-relaxed">
          {micBlocked}
        </p>
      )}

      {/* Uploading an existing file is an alternative to capturing a new one, so
          it only shows when the recorder is idle. */}
      {phase === "idle" && (
        <>
          <div className="flex w-full max-w-xs items-center gap-3">
            <span className="h-px flex-1 bg-line" />
            <span className="text-[11px] font-medium uppercase tracking-wide">or</span>
            <span className="h-px flex-1 bg-line" />
          </div>
          <Uploader />
        </>
      )}

      {/* Errors raised before the sheet opens; the sheet shows its own. */}
      {error && !pending && (
        <p className="max-w-sm rounded-xl border-2 border-ink px-4 py-3 text-sm">
          {error}
        </p>
      )}

      {pending && (
        <TitleSheet
          sizeBytes={pending.blob.size}
          durationMs={pending.durationMs}
          saving={phase === "saving"}
          error={error}
          onSave={(title) => void save(title)}
          onDiscard={discard}
        />
      )}
    </div>
  );
}
