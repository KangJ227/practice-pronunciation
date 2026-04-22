import Link from "next/link";
import type { ReactNode } from "react";
import type { StudyMaterial } from "@/lib/types";

type MaterialListItem = StudyMaterial & {
  practiceHref: string;
  editHref: string;
};

export function MaterialList({ materials }: { materials: MaterialListItem[] }) {
  if (materials.length === 0) {
    return (
      <div className="rounded-[28px] border border-dashed border-black/10 bg-white/60 p-8 text-sm leading-6 text-ink/65">
        No materials yet. Create your first text or audio exercise on the left.
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {materials.map((material) => (
        <article
          key={material.id}
          className="rounded-[28px] border border-black/10 bg-white/85 p-5 shadow-card"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap gap-2">
                <Pill>{material.kind}</Pill>
                <Pill>{material.status}</Pill>
                <Pill>{material.locale}</Pill>
              </div>
              <h3 className="mt-3 font-display text-2xl text-ink">{material.title}</h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/70">
                {material.statusDetail || material.sourceText.slice(0, 180) || "Ready to review."}
              </p>
            </div>
            <div className="flex gap-3">
              <Link
                href={material.editHref}
                className="rounded-full border border-black/10 px-4 py-2 text-sm font-semibold text-ink/75"
              >
                Review
              </Link>
              <Link
                href={material.practiceHref}
                className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white"
              >
                Practice
              </Link>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-black/10 bg-paper px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink/70">
      {children}
    </span>
  );
}
