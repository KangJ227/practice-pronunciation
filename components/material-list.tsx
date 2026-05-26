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
  const [errorBulkPending, setErrorBulkPending] = useState(false);
  const [selectedDeletePending, setSelectedDeletePending] = useState(false);
  const [reportPending, setReportPending] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const errorCount = materials.filter((material) => material.status === "error").length;
  const selectedCount = selectedIds.length;
  const allSelected = materials.length > 0 && selectedCount === materials.length;
  const hasBusyDelete = errorBulkPending || selectedDeletePending || Boolean(pendingId);
  const hasBusyAction = hasBusyDelete || Boolean(reportPending);
  const selectionLabel = allSelected
    ? `All ${selectedCount} sessions selected`
    : selectedCount > 0
      ? `${selectedCount} selected`
      : "Select all sessions";

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
    setErrorBulkPending(true);
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
      setErrorBulkPending(false);
    }
  };

  const toggleMaterial = (materialId: string) => {
    setSelectedIds((current) =>
      current.includes(materialId)
        ? current.filter((selectedId) => selectedId !== materialId)
        : [...current, materialId],
    );
  };

  const toggleAllMaterials = () => {
    setSelectedIds(allSelected ? [] : materials.map((material) => material.id));
  };

  const deleteSelectedSessions = async () => {
    const sessionLabel = selectedCount === 1 ? "session" : "sessions";
    if (!window.confirm(`Delete ${selectedCount} selected ${sessionLabel}?`)) {
      return;
    }

    setSelectedDeletePending(true);
    setError(null);

    try {
      const response = await fetch("/api/materials/bulk-delete", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: selectedIds }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to delete selected sessions.");
      }

      setSelectedIds([]);
      router.refresh();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete selected sessions.",
      );
    } finally {
      setSelectedDeletePending(false);
    }
  };

  const downloadSelectedReport = async () => {
    const format = "pdf";
    setReportPending(true);
    setError(null);

    try {
      const response = await fetch("/api/materials/word-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: selectedIds, format }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "Failed to build word score report.");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = getDownloadFilename(
        response.headers.get("Content-Disposition"),
        `low-word-score-report.${format}`,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (reportError) {
      setError(
        reportError instanceof Error
          ? reportError.message
          : "Failed to build word score report.",
      );
    } finally {
      setReportPending(false);
    }
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 rounded-[24px] border border-black/10 bg-white/80 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="flex min-w-0 flex-wrap items-start gap-4">
          <label className="flex items-center gap-3 text-sm font-semibold text-ink/75">
            <input
              type="checkbox"
              className="h-4 w-4 accent-ink"
              checked={allSelected}
              disabled={hasBusyAction}
              onChange={toggleAllMaterials}
            />
            {selectionLabel}
          </label>
          <p className="max-w-xl text-sm leading-6 text-ink/60">
            Select sessions, then download one PDF report of words under 70, sorted by frequency
            across every attempt.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <button
            type="button"
            className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={hasBusyAction || selectedCount === 0}
            onClick={() => void downloadSelectedReport()}
          >
            {reportPending ? "Building report..." : "Download low-score report"}
          </button>
          {selectedCount > 0 ? (
            <button
              type="button"
              className="rounded-full border border-berry/30 px-4 py-2 text-sm font-semibold text-berry transition hover:bg-berry/10 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={hasBusyAction}
              onClick={() => void deleteSelectedSessions()}
            >
              {selectedDeletePending ? "Deleting..." : `Delete ${selectedCount}`}
            </button>
          ) : null}
        </div>
      </div>

      {errorCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-berry/20 bg-berry/10 p-4">
          <p className="text-sm font-semibold text-berry">
            {errorCount} ERROR {errorCount === 1 ? "session" : "sessions"}
          </p>
          <button
            type="button"
            className="rounded-full bg-berry px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={hasBusyAction}
            onClick={deleteAllErrorSessions}
          >
            {errorBulkPending ? "Deleting..." : "Delete ERROR Sessions"}
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
            <div className="flex min-w-0 flex-1 gap-3">
              <input
                type="checkbox"
                className="mt-2 h-4 w-4 shrink-0 accent-ink"
                aria-label={`Select ${material.title}`}
                checked={selectedIds.includes(material.id)}
                disabled={hasBusyAction}
                onChange={() => toggleMaterial(material.id)}
              />
              <div className="min-w-0">
                <div className="flex flex-wrap gap-2">
                  <Pill>{material.kind}</Pill>
                  <Pill>{material.status}</Pill>
                  <Pill>{material.locale}</Pill>
                </div>
                <h3 className="mt-3 font-display text-2xl text-ink">{material.title}</h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/70">
                  {material.statusDetail ||
                    material.sourceText.slice(0, 180) ||
                    "Ready to review."}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              {material.status === "error" ? (
                <button
                  type="button"
                  className="rounded-full border border-berry/30 px-4 py-2 text-sm font-semibold text-berry transition hover:bg-berry/10 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={hasBusyAction || pendingId === material.id}
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

function getDownloadFilename(contentDisposition: string | null, fallback: string) {
  const match = contentDisposition?.match(/filename="([^"]+)"/);
  return match?.[1] || fallback;
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-black/10 bg-paper px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink/70">
      {children}
    </span>
  );
}
