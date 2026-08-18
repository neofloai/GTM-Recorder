"use client";

import { useState, type ReactNode } from "react";
import { FileText, Loader2, MessageSquare, Sparkles } from "lucide-react";
import ChatPanel from "@/components/ChatPanel";
import SummaryView from "@/components/SummaryView";
import TranscriptView from "@/components/TranscriptView";
import { hasSpeech, type Recording } from "@/lib/types";

type Tab = "transcript" | "summary";

type Props = {
  recording: Recording;
  currentTime: number;
  onSeek: (seconds: number) => void;
  summarizing: boolean;
  summaryError: string | null;
  onRegenerate: () => void;
  onEditUtterance: (index: number, text: string) => Promise<void>;
};

export default function RecordingTabs({
  recording,
  currentTime,
  onSeek,
  summarizing,
  summaryError,
  onRegenerate,
  onEditUtterance,
}: Props) {
  const [tab, setTab] = useState<Tab>("transcript");
  const [chatOpen, setChatOpen] = useState(false);
  // With no speech there is nothing to summarize or ask about.
  const speech = hasSpeech(recording);

  return (
    <>
      <section className="overflow-hidden rounded-xl border border-line">
        <div role="tablist" className="flex border-b border-line">
          <TabButton
            active={tab === "transcript"}
            onClick={() => setTab("transcript")}
            icon={<FileText size={15} strokeWidth={1.9} />}
            label="Transcript"
          />
          <TabButton
            active={tab === "summary"}
            onClick={() => setTab("summary")}
            icon={
              summarizing && !recording.summary ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Sparkles size={15} strokeWidth={1.9} />
              )
            }
            label={recording.summaryStale ? "Summary *" : "Summary"}
          />
        </div>

        {tab === "transcript" ? (
          <TranscriptView
            recording={recording}
            currentTime={currentTime}
            onSeek={onSeek}
            onEditUtterance={onEditUtterance}
          />
        ) : speech ? (
          <SummaryView
            recording={recording}
            generating={summarizing}
            error={summaryError}
            onRegenerate={onRegenerate}
          />
        ) : (
          <p className="px-4 py-16 text-center text-sm">
            Nothing to summarize — no speech was detected in this recording.
          </p>
        )}
      </section>

      {speech && (
        <>
          <button
            onClick={() => setChatOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-ink px-5 py-3.5 text-sm font-semibold text-page transition active:opacity-80"
          >
            <MessageSquare size={16} strokeWidth={2} />
            Chat with this transcript
          </button>

          <ChatPanel
            recordingId={recording.id}
            title={recording.title}
            open={chatOpen}
            onClose={() => setChatOpen(false)}
          />
        </>
      )}
    </>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={active}
      /* Inverting fill is the whole active treatment — legible without colour. */
      className={`flex flex-1 items-center justify-center gap-2 py-3.5 text-[13px] font-semibold uppercase tracking-wide transition ${
        active ? "bg-ink text-page" : "bg-page text-ink"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
