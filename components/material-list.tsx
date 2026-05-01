"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";
import type { StudyMaterial } from "@/lib/types";

type MaterialListItem = StudyMaterial & {
  practiceHref: string;
  editHref: string;
};

export function MaterialList({ materials }: { materials: MaterialListItem[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [bulkPending, setBulkPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorCount = materials.filter((material) => material.status === "error").length;

  if (materials.length === 0) {
    return (
      <div className="rounded-[28px] border border-dashed border-black/10 bg-white/60 p-8 text-sm leading-6 text-ink/65">
        No materials yet. Create your first text or audio exercise on the left.
      </div>
    );
  }

  const deleteErrorSession = async (materialId: string) => {
    setPendingId(materialId);
    setError(null);

    try {
      const response = await fetch(`/api/materials/${materialId}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to delete ERROR session.");
      }

      router.refresh();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete ERROR session.",
      );
    } finally {
      setPendingId(null);
    }
  };

  const deleteAllErrorSessions = async () => {
    setBulkPending(true);
    setError(null);

    try {
      const response = await fetch("/api/materials/error-sessions", {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to delete ERROR sessions.");
      }

      router.refresh();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete ERROR sessions.",
      );
    } finally {
      setBulkPending(false);
    }
  };

  return (
    <div className="grid gap-4">
      {errorCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-berry/20 bg-berry/10 p-4">
          <p className="text-sm font-semibold text-berry">
            {errorCount} ERROR {errorCount === 1 ? "session" : "sessions"}
          </p>
          <button
            type="button"
            className="rounded-full bg-berry px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={bulkPending || Boolean(pendingId)}
            onClick={deleteAllErrorSessions}
          >
            {bulkPending ? "Deleting..." : "Delete ERROR Sessions"}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-2xl bg-berry/10 px-4 py-3 text-sm text-berry">{error}</p>
      ) : null}

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
            <div className="flex flex-wrap gap-3">
              {material.status === "error" ? (
                <button
                  type="button"
                  className="rounded-full border border-berry/30 px-4 py-2 text-sm font-semibold text-berry transition hover:bg-berry/10 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={bulkPending || pendingId === material.id}
                  onClick={() => void deleteErrorSession(material.id)}
                >
                  {pendingId === material.id ? "Deleting..." : "Delete"}
                </button>
              ) : null}
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
