import Link from "next/link";
import { notFound } from "next/navigation";
import { SegmentEditor } from "@/components/segment-editor";
import { getMaterialEditorView } from "@/lib/services";
import { storageUrl } from "@/lib/storage";
import { requirePageUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function MaterialEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    await requirePageUser();
    const { id } = await params;
    const view = await getMaterialEditorView(id);

    return (
      <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-5 py-8 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass">
              Segment Review
            </p>
            <h1 className="mt-2 font-display text-4xl text-ink">{view.material.title}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/70">
              Edit the transcript before you start practice. Merge lines that belong together or
              auto-split a long line into smaller sentence units.
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/"
              className="rounded-full border border-black/10 px-4 py-2 text-sm font-semibold text-ink/75"
            >
              Back Home
            </Link>
            <Link
              href={`/materials/${view.material.id}/practice`}
              className="rounded-full bg-berry px-4 py-2 text-sm font-semibold text-white"
            >
              Start Practice
            </Link>
          </div>
        </div>

        <SegmentEditor
          material={view.material}
          initialSegments={view.segments}
          initialAttemptsBySegment={view.attemptsBySegment}
          initialUnlinkedAttempts={view.unlinkedAttempts}
          sourceAudioUrl={storageUrl(view.material.sourceAudioPath)}
        />
      </main>
    );
  } catch {
    notFound();
  }
}
