import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import SettingsForm from "@/components/settings/SettingsForm";
import { getSettingsStatus } from "@/lib/settings/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Settings — Transcriber",
};

export default function SettingsPage() {
  const status = getSettingsStatus();

  return (
    <main className="mx-auto w-full max-w-3xl px-6 pb-24 pt-14">
      <Link
        href="/"
        className="inline-flex items-center gap-1 rounded-md border border-edge px-2 py-1 text-xs text-fog transition hover:border-accent/50 hover:text-paper"
      >
        <ChevronLeft size={14} /> Library
      </Link>

      <h1 className="mt-6 text-3xl font-semibold tracking-tight text-paper">Settings</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fog">
        Add your own transcription API keys. Everything is stored on this computer in
        <span className="font-mono text-fog"> .data/settings.json</span> and is never sent anywhere
        except the provider you select. The file is gitignored — never commit or share it.
      </p>

      <div className="mt-6">
        <SettingsForm initial={status} />
      </div>
    </main>
  );
}
