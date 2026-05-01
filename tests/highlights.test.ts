import { describe, expect, it } from "vitest";
import { computeSegmentHighlights } from "@/lib/highlights";
import type { SentenceSegment, WeakPattern } from "@/lib/types";

const segment: SentenceSegment = {
  id: "seg-1",
  materialId: "mat-1",
  index: 0,
  text: "Je prends un train demain.",
  normalizedText: "je prends un train demain.",
  startMs: null,
  endMs: null,
  ttsAudioPath: null,
  starred: false,
  source: "text",
  createdAt: new Date().toISOString(),
};

describe("computeSegmentHighlights", () => {
  it("highlights repeated low-score words after two hits", () => {
    const patterns: WeakPattern[] = [
      {
        id: "wp-1",
        patternType: "word_pronunciation",
        patternKey: "train",
        displayText: "train",
        severity: 2,
        evidenceCount: 2,
        lastSeenAt: new Date().toISOString(),
        lastSegmentText: segment.text,
        notesJson: {
          reason: "Repeated low score on this word.",
        },
      },
    ];

    const highlights = computeSegmentHighlights(segment, patterns);
    expect(highlights.map((item) => item.normalized)).toContain("train");
  });

  it("highlights omission/insertion patterns immediately", () => {
    const patterns: WeakPattern[] = [
      {
        id: "wp-2",
        patternType: "omission_insertion",
        patternKey: "prends",
        displayText: "prends",
        severity: 3,
        evidenceCount: 1,
        lastSeenAt: new Date().toISOString(),
        lastSegmentText: segment.text,
        notesJson: {
          reason: "Azure detected an omission here.",
        },
      },
    ];

    const highlights = computeSegmentHighlights(segment, patterns);
    expect(highlights.map((item) => item.normalized)).toContain("prends");
  });
});
