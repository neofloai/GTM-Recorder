"use client";

import { useEffect } from "react";
import { MessageSquareText, X } from "lucide-react";
import Chat from "@/components/Chat";

type Props = {
  recordingId: string;
  title: string;
  open: boolean;
  onClose: () => void;
};

/**
 * The chatbox itself: a floating window docked bottom-right on desktop and
 * near-fullscreen on phones. Mounted only while open so the transcript stays
 * fully readable behind it.
 */
export default function ChatPanel({ recordingId, title, open, onClose }: Props) {
  // Escape closes it, matching every other dismissible panel on the web.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label={`Chat with ${title}`}
      className="panel-in fixed inset-x-3 bottom-3 top-20 z-40 flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl sm:inset-x-auto sm:top-auto sm:right-6 sm:bottom-6 sm:h-[600px] sm:max-h-[calc(100vh-6rem)] sm:w-[420px]"
    >
      <div className="flex items-center gap-2.5 border-b border-line bg-raised px-4 py-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-strong text-white">
          <MessageSquareText size={14} />
        </span>
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold leading-tight">Chat with transcript</p>
          <p className="truncate text-[11.5px] leading-tight text-subtle">{title}</p>
        </div>
        <button
          onClick={onClose}
          className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-lg text-subtle transition hover:bg-line/60 hover:text-strong"
          aria-label="Close chat"
        >
          <X size={16} />
        </button>
      </div>

      <div className="min-h-0 flex-1">
        <Chat recordingId={recordingId} />
      </div>
    </div>
  );
}
