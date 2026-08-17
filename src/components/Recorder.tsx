"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, Square, Pause, Play, Loader2 } from "lucide-react";
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

type Phase = "idle" | "recording" | "paused" | "saving";

export default function Recorder() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  // Wall-clock accounting so pausing doesn't inflate the duration.
  const startedAtRef = useRef(0);
  const accumulatedRef = useRef(0);

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

  // Tick the on-screen timer while recording.
  useEffect(() => {
    if (phase !== "recording") return;
    const id = setInterval(() => {
      setElapsedMs(accumulatedRef.current + (Date.now() - startedAtRef.current));
    }, 100);
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
      const rms = Math.sqrt(sum / buffer.length);
      setLevel(Math.min(1, rms * 3));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  async function start() {
    setError(null);
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
      recorder.onstop = () => void save(recorder.mimeType || mimeType);
      recorder.start(1000);
      recorderRef.current = recorder;

      accumulatedRef.current = 0;
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setPhase("recording");
    } catch (err) {
      teardown();
      setError(
        err instanceof Error && err.name === "NotAllowedError"
          ? "Microphone access was blocked. Allow it in your browser's site settings and try again."
          : `Could not start recording: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  function togglePause() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (phase === "recording") {
      recorder.pause();
      accumulatedRef.current += Date.now() - startedAtRef.current;
      setPhase("paused");
    } else if (phase === "paused") {
      recorder.resume();
      startedAtRef.current = Date.now();
      setPhase("recording");
    }
  }

  function stop() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (phase === "recording") accumulatedRef.current += Date.now() - startedAtRef.current;
    setPhase("saving");
    setStage("Finishing recording");
    recorder.stop();
  }

  async function save(mimeType: string) {
    const durationMs = accumulatedRef.current;
    teardown();

    try {
      const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
      chunksRef.current = [];
      if (blob.size === 0) throw new Error("the recording came back empty");
      if (blob.size > MAX_AUDIO_BYTES) {
        throw new Error(
          `this recording is ${formatBytes(blob.size)}, over the ${formatMaxSize()} limit for Firestore-stored audio`,
        );
      }

      // The server splits the audio across Firestore chunk documents; the
      // browser just posts the blob once.
      setStage("Saving audio");
      setProgress(0.3);
      const id = await createRecording(
        blob,
        durationMs,
        `Recording ${new Date().toLocaleString()}`,
      );
      setProgress(1);

      // Kick transcription off without waiting — the detail page polls for status.
      setStage("Transcribing with Deepgram");
      void transcribe(id).catch(() => {});

      setPhase("idle");
      setProgress(0);
      setStage("");
      setElapsedMs(0);
      router.push(`/recordings/${id}`);
    } catch (err) {
      setPhase("idle");
      setProgress(0);
      setStage("");
      setError(`Could not save the recording: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const busy = phase === "saving";
  const bars = 28;

  return (
    <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          {phase === "idle" || busy ? (
            <button
              onClick={start}
              disabled={busy}
              className="grid h-16 w-16 place-items-center rounded-full bg-brand text-white shadow-sm transition hover:brightness-95 disabled:opacity-40"
              aria-label="Start recording"
            >
              {busy ? <Loader2 size={24} className="animate-spin" /> : <Mic size={24} />}
            </button>
          ) : (
            <>
              <button
                onClick={stop}
                className="grid h-16 w-16 place-items-center rounded-full bg-brand text-white shadow-sm transition hover:brightness-95"
                aria-label="Stop and save"
              >
                <Square size={20} />
              </button>
              <button
                onClick={togglePause}
                className="grid h-11 w-11 place-items-center rounded-full border border-line text-subtle transition hover:border-subtle hover:text-strong"
                aria-label={phase === "paused" ? "Resume" : "Pause"}
              >
                {phase === "paused" ? <Play size={16} /> : <Pause size={16} />}
              </button>
            </>
          )}

          <div>
            <div className="font-mono text-3xl tabular-nums">
              {formatTimestamp(elapsedMs / 1000)}
            </div>
            <div className="flex items-center gap-2 text-xs text-subtle">
              {phase === "recording" && (
                <>
                  <span className="recording-dot h-2 w-2 rounded-full bg-brand" />
                  Recording
                </>
              )}
              {phase === "paused" && "Paused"}
              {phase === "idle" && !busy && "Ready — click to record"}
              {busy && (stage || "Saving")}
            </div>
          </div>
        </div>

        {/* Live input level, so you know the mic is actually picking you up. */}
        <div className="flex h-12 flex-1 items-center gap-[3px]">
          {Array.from({ length: bars }).map((_, i) => {
            const threshold = (i + 1) / bars;
            const active = phase === "recording" && level >= threshold * 0.85;
            const height = active ? 12 + level * 34 * (1 - Math.abs(i / bars - 0.5)) : 4;
            return (
              <span
                key={i}
                className="w-full rounded-full transition-all duration-75"
                style={{
                  height: `${height}px`,
                  background: active ? "var(--color-brand)" : "var(--color-line)",
                }}
              />
            );
          })}
        </div>
      </div>

      {busy && progress > 0 && (
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-line">
          <div
            className="h-full bg-strong transition-all"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      )}

      {error && (
        <p className="mt-5 rounded-xl border border-brand/30 bg-brand/5 px-3 py-2 text-sm text-brand">
          {error}
        </p>
      )}
    </div>
  );
}
