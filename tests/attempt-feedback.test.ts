import { describe, expect, it } from "vitest";
import {
  buildAttemptFeedbackMarkdown,
  buildAttemptFeedbackPayload,
  getAttemptFeedbackPaths,
} from "@/lib/attempt-feedback";
import type { PracticeAttempt, SentenceSegment, StudyMaterial } from "@/lib/types";

const material: StudyMaterial = {
  id: "mat-1",
  kind: "text",
  locale: "fr-FR",
  title: "Bonjour Demo",
  sourceText: "Bonjour tout le monde.",
  sourceAudioPath: null,
  status: "ready",
  statusDetail: null,
  createdAt: "2026-04-22T09:00:00.000Z",
};

const segment: SentenceSegment = {
  id: "seg-1",
  materialId: "mat-1",
  index: 0,
  text: "Bonjour tout le monde.",
  normalizedText: "bonjour tout le monde.",
  startMs: null,
  endMs: null,
  ttsAudioPath: null,
  starred: false,
  source: "text",
  createdAt: "2026-04-22T09:01:00.000Z",
};

const attempt: PracticeAttempt = {
  id: "att-1",
  materialId: "mat-1",
  segmentId: "seg-1",
  attemptAudioPath: "attempts/seg-1/normalized/att-1.wav",
  feedbackJsonPath: "attempts/seg-1/feedback/att-1-feedback.json",
  feedbackMarkdownPath: "attempts/seg-1/feedback/att-1-feedback.md",
  recognizedText: "Bonjour tout le monde",
  pronScore: 82.4,
  accuracyScore: 79.6,
  fluencyScore: 85.1,
  completenessScore: 90,
  wordResultsJson: [
    {
      word: "Bonjour",
      accuracyScore: 74.2,
      errorType: null,
    },
  ],
  providerRawJson: {
    provider: "azure",
  },
  analysisJson: {
    summary: "Watch the nasal vowel and keep the rhythm even.",
    nextDrill: "Replay bonjour three times, then record the full sentence again.",
    weakPatterns: [
      {
        type: "nasal_vowel",
        key: "bonjour",
        displayText: "bonjour",
        severity: 2,
        reason: "The nasal vowel is still too flat.",
      },
    ],
    highlightTokens: ["bonjour"],
  },
  createdAt: "2026-04-22T09:02:00.000Z",
};

describe("getAttemptFeedbackPaths", () => {
  it("builds deterministic feedback paths from attempt id and segment id", () => {
    expect(getAttemptFeedbackPaths(attempt)).toEqual({
      feedbackJsonPath: "attempts/seg-1/feedback/att-1-feedback.json",
      feedbackMarkdownPath: "attempts/seg-1/feedback/att-1-feedback.md",
    });
  });
});

describe("buildAttemptFeedbackPayload", () => {
  it("includes the persisted artifact paths and rounded scores", () => {
    const payload = buildAttemptFeedbackPayload({
      material,
      segment,
      attempt,
    });

    expect(payload.attempt.feedbackJsonPath).toBe(attempt.feedbackJsonPath);
    expect(payload.attempt.feedbackMarkdownPath).toBe(attempt.feedbackMarkdownPath);
    expect(payload.attempt.scores.pron).toBe(82.4);
    expect(payload.segment.text).toBe(segment.text);
  });
});

describe("buildAttemptFeedbackMarkdown", () => {
  it("renders a readable markdown summary for the saved attempt", () => {
    const markdown = buildAttemptFeedbackMarkdown({
      material,
      segment,
      attempt,
    });

    expect(markdown).toContain("# Practice Attempt Feedback");
    expect(markdown).toContain("Bonjour Demo");
    expect(markdown).toContain("Pronunciation: 82.4");
    expect(markdown).toContain("bonjour");
    expect(markdown).toContain("attempts/seg-1/feedback/att-1-feedback.json");
  });
});
