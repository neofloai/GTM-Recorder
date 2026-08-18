import RecordingsList from "@/components/RecordingsList";

export default function RecordingsPage() {
  return (
    <div className="py-6">
      <h1 className="mb-5 text-2xl font-semibold tracking-tight">Recordings</h1>
      <RecordingsList />
    </div>
  );
}
