import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Transcriber",
  description: "Upload a conversation, transcribe it, and explore the text alongside the audio.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
