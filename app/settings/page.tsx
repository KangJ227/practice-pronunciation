import Link from "next/link";
import { SettingsForm } from "@/components/settings-form";
import { requirePageUser } from "@/lib/auth";
import { getSettingsView } from "@/lib/services";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requirePageUser();
  const settings = await getSettingsView();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-5 py-8 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass">
            Settings
          </p>
          <h1 className="mt-2 font-display text-4xl text-ink">Practice preferences</h1>
        </div>
        <Link
          href="/"
          className="rounded-full bg-berry px-4 py-2 text-sm font-semibold text-white"
        >
          Home
        </Link>
      </div>

      <SettingsForm initialSettings={settings} />
    </main>
  );
}
