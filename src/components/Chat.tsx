"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import Markdown from "@/components/Markdown";
import {
  getMessages,
  getModels,
  streamChatAnswer,
  type ModelOption,
} from "@/lib/client-api";
import type { ChatMessage } from "@/lib/types";

const SUGGESTIONS = [
  "Summarize this recording in five bullets.",
  "What decisions were made, and who owns each one?",
  "List every action item with its timestamp.",
  "What was raised but left unanswered?",
];

/** Fills its parent, so it works inside the floating chat panel. */
export default function Chat({ recordingId }: { recordingId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [model, setModel] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load persisted history once; new turns are appended locally as they stream.
  useEffect(() => {
    getMessages(recordingId)
      .then(setMessages)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [recordingId]);

  useEffect(() => {
    getModels()
      .then(({ models: list, defaultModel }) => {
        setModels(list);
        setModel(defaultModel);
      })
      // Non-fatal: without the catalogue the server just uses its default.
      .catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streaming, busy]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;

    setBusy(true);
    setError(null);
    setInput("");
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: question, createdAt: Date.now() },
    ]);

    try {
      const full = await streamChatAnswer(
        recordingId,
        question,
        model || undefined,
        setStreaming,
      );

      setStreaming("");
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: full,
          createdAt: Date.now(),
          model,
        },
      ]);
    } catch (err) {
      setStreaming("");
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={scrollRef}
        className="flex-1 space-y-3.5 overflow-y-auto px-4 py-4"
      >
        {!messages.length && !streaming && (
          <div className="space-y-2">
            <p className="pb-1 text-[13px] text-subtle">
              Ask anything about what was said — answers cite timestamps.
            </p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => void send(s)}
                className="block w-full rounded-xl border border-line px-3 py-2 text-left text-[13.5px] text-strong transition hover:border-subtle hover:bg-raised"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-strong px-3.5 py-2.5 text-[14px] leading-relaxed text-white">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex justify-start">
              <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-raised px-3.5 py-2.5">
                <Markdown text={m.content} />
              </div>
            </div>
          ),
        )}

        {streaming && (
          <div className="flex justify-start">
            <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-raised px-3.5 py-2.5">
              <Markdown text={streaming} />
            </div>
          </div>
        )}

        {busy && !streaming && (
          <p className="flex items-center gap-2 text-xs text-subtle">
            <Loader2 size={13} className="animate-spin" /> Thinking…
          </p>
        )}

        {error && (
          <p className="rounded-xl border border-brand/30 bg-brand/5 px-3 py-2 text-[13px] text-brand">
            {error}
          </p>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="border-t border-line p-3"
      >
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={1}
            placeholder="Ask about this recording…"
            className="max-h-28 flex-1 resize-none rounded-xl border border-line bg-surface px-3 py-2.5 text-[14px] text-strong outline-none placeholder:text-subtle focus:border-focus"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-strong text-white transition hover:opacity-90 disabled:opacity-25"
            aria-label="Send"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={16} />}
          </button>
        </div>

        {models.length > 0 && (
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="mt-2 w-full truncate rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-subtle outline-none focus:border-focus focus:text-strong"
            aria-label="Model"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}
      </form>
    </div>
  );
}
