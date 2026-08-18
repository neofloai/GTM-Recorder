import type { Metadata, Viewport } from "next";
import TabBar from "@/components/TabBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Recorder",
  description: "Record audio, transcribe it, and chat with the transcript.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The layout is fixed-height on the record tab; let it fill the notch area.
  viewportFit: "cover",
  // Shrink the viewport when the on-screen keyboard opens, so fixed sheets stay
  // above it instead of being covered.
  interactiveWidget: "resizes-content",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col antialiased">
        {/* Room for the fixed tab bar at the bottom. */}
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-24">{children}</main>
        <TabBar />
      </body>
    </html>
  );
}
