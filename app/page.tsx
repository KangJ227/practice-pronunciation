import Link from "next/link";
import { appConfig, isAzureSpeechConfigured, isKimiConfigured } from "@/lib/config";
import { getDashboardMaterials } from "@/lib/services";
import { CreateMaterialForms } from "@/components/create-material-forms";
import { MaterialList } from "@/components/material-list";
import { requirePageUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await requirePageUser();
  const materials = await getDashboardMaterials();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-10 px-5 py-8 md:px-8 lg:px-10">
      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="relative overflow-hidden rounded-[32px] border border-black/10 bg-paper px-6 py-8 shadow-card md:px-8">
          <div className="absolute right-4 top-4 h-24 w-24 rounded-full bg-berry/10 blur-2xl" />
          <div className="absolute bottom-0 left-12 h-28 w-28 rounded-full bg-moss/10 blur-2xl" />
          <div className="relative">
            <p className="mb-4 inline-flex rounded-full border border-brass/30 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-brass">
              Atelier de Prononciation
            </p>
            <h1 className="max-w-3xl font-display text-4xl leading-tight text-ink md:text-6xl">
              Build a tight French pronunciation loop around every sentence.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-ink/70 md:text-lg">
              Upload a text passage or a single-speaker audio clip, review the sentence split,
              generate reference TTS, then practice line by line with AI-backed feedback and a
              memory of your recurring weak spots.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-sm text-ink/80">
              <StatusBadge
                label={`Azure Speech ${isAzureSpeechConfigured() ? "ready" : "not configured"}`}
                tone={isAzureSpeechConfigured() ? "green" : "amber"}
              />
              <StatusBadge
                label={`Kimi ${isKimiConfigured() ? "ready" : "optional fallback mode"}`}
                tone={isKimiConfigured() ? "green" : "amber"}
              />
              <StatusBadge label={`Locale ${appConfig.locale}`} tone="neutral" />
            </div>
          </div>
        </div>

        <div className="rounded-[32px] border border-black/10 bg-white/80 p-6 shadow-card backdrop-blur">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass">
                Practice Flow
              </p>
              <h2 className="mt-2 font-display text-2xl text-ink">From material to repetition</h2>
            </div>
            <div className="rounded-full bg-paper px-3 py-1 text-xs font-semibold text-ink/70">
              v1 MVP
            </div>
          </div>
          <ol className="space-y-4 text-sm leading-6 text-ink/75">
            <li>
              1. Import text or audio and let the app create initial sentence segments.
            </li>
            <li>
              2. Review the split, merge or auto-split lines, then generate reference audio.
            </li>
            <li>
              3. Practice sentence by sentence with TTS, source clip replay, and upload or browser
              recording.
            </li>
            <li>
              4. Keep iterating until weak words and patterns stop showing up in red.
            </li>
          </ol>
          <div className="mt-6 rounded-3xl border border-black/10 bg-paper/80 p-4 text-sm text-ink/75">
            <p className="font-semibold text-ink">Environment hint</p>
            <p className="mt-2">
              If Azure credentials are missing, text materials still work and attempts are saved,
              but transcription, TTS, and pronunciation assessment stay in degraded mode until you
              add keys in <code>.env.local</code>.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <CreateMaterialForms />
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass">
                Study Materials
              </p>
              <h2 className="mt-2 font-display text-3xl text-ink">Resume a session</h2>
            </div>
            <Link
              href="https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-pronunciation-assessment"
              className="text-sm font-semibold text-berry underline decoration-berry/30 underline-offset-4"
              target="_blank"
            >
              Azure docs
            </Link>
            <Link
              href="/settings"
              className="text-sm font-semibold text-berry underline decoration-berry/30 underline-offset-4"
            >
              Settings
            </Link>
          </div>
          <MaterialList materials={materials} />
        </div>
      </section>
    </main>
  );
}

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "green" | "amber" | "neutral";
}) {
  const toneMap = {
    green: "border-moss/30 bg-moss/10 text-moss",
    amber: "border-brass/30 bg-brass/10 text-brass",
    neutral: "border-black/10 bg-white/60 text-ink/75",
  } as const;

  return <span className={`rounded-full border px-3 py-1 ${toneMap[tone]}`}>{label}</span>;
}
