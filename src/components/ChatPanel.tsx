"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import Chat from "@/components/Chat";

type Props = {
  recordingId: string;
  title: string;
  open: boolean;
  onClose: () => void;
};

/**
 * Full-screen sheet on a phone, a docked window on wider screens. Mounted only
 * while open so the transcript behind it stays untouched.
 */
export default function ChatPanel({ recordingId, title, open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Stop the page behind the sheet from scrolling on touch.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label={`Chat with ${title}`}
      className="panel-in fixed inset-0 z-40 flex flex-col bg-page pb-[env(safe-area-inset-bottom)] sm:inset-auto sm:right-6 sm:bottom-6 sm:h-[600px] sm:max-h-[calc(100dvh-6rem)] sm:w-[420px] sm:rounded-2xl sm:border-2 sm:border-ink sm:pb-0 sm:shadow-2xl"
    >
      <div className="flex items-center gap-3 border-b-2 border-ink px-4 py-3.5">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold uppercase tracking-wide">
            Chat with transcript
          </p>
          <p className="truncate text-[12px]">{title}</p>
        </div>
        <button
          onClick={onClose}
          className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-full border border-ink transition active:bg-ink active:text-page"
          aria-label="Close chat"
        >
          <X size={17} strokeWidth={2} />
        </button>
      </div>

      <div className="min-h-0 flex-1">
        <Chat recordingId={recordingId} />
      </div>
    </div>
  );
}
