import Link from "next/link";
import { notFound } from "next/navigation";
import { PracticeStudio } from "@/components/practice-studio";
import { getPracticeMaterialView } from "@/lib/services";

export default async function PracticePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    const { id } = await params;
    const view = getPracticeMaterialView(id);

    return (
      <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-5 py-8 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass">
              Practice Mode
            </p>
            <h1 className="mt-2 font-display text-4xl text-ink">{view.material.title}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/70">
              Repeat one sentence at a time. Use the source clip or TTS reference, then upload or
              record your attempt and let the app update your weak-spot memory.
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href={`/materials/${view.material.id}/edit`}
              className="rounded-full border border-black/10 px-4 py-2 text-sm font-semibold text-ink/75"
            >
              Edit Segments
            </Link>
            <Link
              href="/"
              className="rounded-full bg-berry px-4 py-2 text-sm font-semibold text-white"
            >
              Home
            </Link>
          </div>
        </div>

        <PracticeStudio initialPractice={view} />
      </main>
    );
  } catch {
    notFound();
  }
}
