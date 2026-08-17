import type { Metadata } from "next";
import Link from "next/link";
import { Mic } from "lucide-react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Recorder",
  description: "Record audio, transcribe it with Deepgram, then chat with the transcript.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-20 border-b border-line bg-page/90 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-5">
            <Link
              href="/"
              className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight"
            >
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-white">
                <Mic size={16} />
              </span>
              Recorder
            </Link>
            <span className="ml-auto hidden text-xs text-subtle sm:block">
              Deepgram transcription · OpenRouter chat · Firestore
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
      </body>
    </html>
  );
}
