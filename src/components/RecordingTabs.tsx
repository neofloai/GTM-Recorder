"use client";

import { useState, type ReactNode } from "react";
import { FileText, Loader2, MessageSquareText, Sparkles } from "lucide-react";
import ChatPanel from "@/components/ChatPanel";
import SummaryView from "@/components/SummaryView";
import TranscriptView from "@/components/TranscriptView";
import type { Recording } from "@/lib/types";

type Tab = "transcript" | "summary";

type Props = {
  recording: Recording;
  currentTime: number;
  onSeek: (seconds: number) => void;
  summarizing: boolean;
  summaryError: string | null;
  onRegenerate: () => void;
  /** Opens the chatbox on mount — used by the preview route. */
  initialChatOpen?: boolean;
};

/**
 * Transcript and Summary as tabs, with the "Chat with this" trigger docked in
 * the tab bar. The chatbox itself is a floating panel, mounted only while open.
 */
export default function RecordingTabs({
  recording,
  currentTime,
  onSeek,
  summarizing,
  summaryError,
  onRegenerate,
  initialChatOpen = false,
}: Props) {
  const [tab, setTab] = useState<Tab>("transcript");
  const [chatOpen, setChatOpen] = useState(initialChatOpen);

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div
          role="tablist"
          className="flex items-center gap-0.5 border-b border-line px-2 pt-2.5 sm:gap-1 sm:px-3"
        >
          <TabButton
            active={tab === "transcript"}
            onClick={() => setTab("transcript")}
            icon={<FileText size={14} />}
            label="Transcript"
          />
          <TabButton
            active={tab === "summary"}
            onClick={() => setTab("summary")}
            icon={<Sparkles size={14} />}
            label="Summary"
            badge={
              summarizing && !recording.summary ? (
                <Loader2 size={11} className="animate-spin" />
              ) : null
            }
          />

          <button
            onClick={() => setChatOpen(true)}
            aria-label="Chat with this transcript"
            className="mb-2 ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-strong px-3 py-2 text-[13px] font-medium text-white transition hover:opacity-90"
          >
            <MessageSquareText size={14} />
            {/* The full label doesn't fit beside the tabs on a phone. */}
            <span className="hidden sm:inline">Chat with this</span>
            <span className="sm:hidden">Chat</span>
          </button>
        </div>

        {tab === "transcript" ? (
          <TranscriptView
            recording={recording}
            currentTime={currentTime}
            onSeek={onSeek}
          />
        ) : (
          <SummaryView
            recording={recording}
            generating={summarizing}
            error={summaryError}
            onRegenerate={onRegenerate}
          />
        )}
      </section>

      <ChatPanel
        recordingId={recording.id}
        title={recording.title}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
      />
    </>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  badge?: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={`-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 py-2.5 text-[13.5px] font-medium transition sm:px-3.5 ${
        active
          ? "border-strong text-strong"
          : "border-transparent text-subtle hover:text-strong"
      }`}
    >
      {icon}
      {label}
      {badge}
    </button>
  );
}
