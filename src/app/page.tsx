import Recorder from "@/components/Recorder";
import RecordingsList from "@/components/RecordingsList";

export default function HomePage() {
  return (
    <div className="space-y-9">
      <section>
        <h1 className="mb-1 text-[22px] font-semibold tracking-tight">New recording</h1>
        <p className="mb-4 text-sm text-subtle">
          Record from your microphone. When you stop, it&apos;s transcribed and
          summarized automatically.
        </p>
        <Recorder />
      </section>
      <section>
        <h2 className="mb-4 text-[22px] font-semibold tracking-tight">Your recordings</h2>
        <RecordingsList />
      </section>
    </div>
  );
}
