import { describe, expect, it } from "vitest";
import { autoSplitSegment, splitFrenchSentenceSpans, splitFrenchSentences } from "@/lib/text";

describe("splitFrenchSentences", () => {
  it("keeps French abbreviations intact", () => {
    const input = "M. Dupont arrive. Il parle doucement.";
    expect(splitFrenchSentences(input)).toEqual([
      "M. Dupont arrive.",
      "Il parle doucement.",
    ]);
  });

  it("splits quoted and punctuated speech cleanly", () => {
    const input = "« Bonjour ! » dit-elle. Ensuite, elle sourit...";
    expect(splitFrenchSentences(input)).toEqual([
      "« Bonjour ! » dit-elle.",
      "Ensuite, elle sourit...",
    ]);
  });

  it("returns sentence spans for source-audio timing", () => {
    const input = "Bonjour ! Nous partons a huit heures.";
    expect(splitFrenchSentenceSpans(input)).toEqual([
      {
        text: "Bonjour !",
        startIndex: 0,
        endIndex: 9,
      },
      {
        text: "Nous partons a huit heures.",
        startIndex: 10,
        endIndex: 37,
      },
    ]);
  });
});

describe("autoSplitSegment", () => {
  it("splits long manual lines into sentence chunks", () => {
    const input = "Tu viens demain ? Nous partons a huit heures.";
    expect(autoSplitSegment(input)).toEqual([
      "Tu viens demain ?",
      "Nous partons a huit heures.",
    ]);
  });
});
