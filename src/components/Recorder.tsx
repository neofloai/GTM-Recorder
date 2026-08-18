"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, Loader2 } from "lucide-react";
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

type Phase = "idle" | "recording" | "saving";

export default function Recorder() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);
  const [stage, setStage] = useState("");
  const [error, setError] = useState<string | null>(null);

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

  /** The Submit button: stops capture, which kicks off save() via onstop. */
  function submit() {
    const recorder = recorderRef.current;
    if (!recorder || phase !== "recording") return;
    setPhase("saving");
    setStage("Finishing recording");
    recorder.stop();
  }

  async function save(mimeType: string) {
    const durationMs = Date.now() - startedAtRef.current;
    teardown();

    try {
      const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
      chunksRef.current = [];
      if (blob.size === 0) throw new Error("the recording came back empty");
      if (blob.size > MAX_AUDIO_BYTES) {
        throw new Error(
          `this recording is ${formatBytes(blob.size)}, over the ${formatMaxSize()} limit`,
        );
      }

      setStage("Saving");
      const id = await createRecording(
        blob,
        durationMs,
        `Recording ${new Date().toLocaleString()}`,
      );

      // Kick transcription off without waiting; the detail page polls for status.
      setStage("Transcribing");
      void transcribe(id).catch(() => {});

      setPhase("idle");
      setStage("");
      setElapsedMs(0);
      router.push(`/recordings/${id}`);
    } catch (err) {
      setPhase("idle");
      setStage("");
      setError(
        `Could not save the recording: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const saving = phase === "saving";
  const recording = phase === "recording";
  // The button grows slightly with your voice, so you can see the mic is live.
  const scale = recording ? 1 + level * 0.08 : 1;

  return (
    <div className="flex min-h-[calc(100dvh-9rem)] flex-col items-center justify-center gap-10 text-center">
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
          disabled={saving}
          aria-label={recording ? "Stop recording" : "Start recording"}
          style={{ transform: `scale(${scale})` }}
          className={`relative grid h-40 w-40 place-items-center rounded-full border-2 border-ink transition-transform duration-75 disabled:opacity-40 ${
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
        <p className="font-mono text-4xl tabular-nums">
          {formatTimestamp(elapsedMs / 1000)}
        </p>
        <p className="flex items-center justify-center gap-2 text-sm">
          {recording && <span className="blink h-2 w-2 rounded-full bg-ink" />}
          {recording
            ? "Recording"
            : saving
              ? stage || "Saving"
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

      {saving && (
        <p className="flex items-center gap-2 text-sm">
          <Loader2 size={15} className="animate-spin" /> {stage}
        </p>
      )}

      {error && (
        <p className="max-w-sm rounded-xl border-2 border-ink px-4 py-3 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
