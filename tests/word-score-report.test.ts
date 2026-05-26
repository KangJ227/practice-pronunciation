import { describe, expect, it } from "vitest";
import {
  buildLowWordScoreReport,
  normalizeReportWord,
  renderLowWordScoreReportMarkdown,
  renderLowWordScoreReportPdf,
} from "@/lib/word-score-report";
import type { PracticeAttempt, StudyMaterial } from "@/lib/types";

const materials: StudyMaterial[] = [
  {
    id: "mat-1",
    kind: "text",
    locale: "fr-FR",
    title: "Nasal vowels",
    sourceText: "Bonjour tout le monde.",
    sourceAudioPath: null,
    status: "ready",
    statusDetail: null,
    createdAt: "2026-05-20T08:00:00.000Z",
  },
  {
    id: "mat-2",
    kind: "audio",
    locale: "fr-FR",
    title: "Daily recording",
    sourceText: "Je voudrais reserver.",
    sourceAudioPath: "materials/mat-2/source/source.wav",
    status: "ready",
    statusDetail: null,
    createdAt: "2026-05-21T08:00:00.000Z",
  },
];

const createAttempt = (
  patch: Partial<PracticeAttempt> & Pick<PracticeAttempt, "id" | "materialId" | "createdAt">,
): PracticeAttempt => ({
  segmentId: "seg-1",
  attemptAudioPath: `attempts/${patch.id}.wav`,
  feedbackJsonPath: null,
  feedbackMarkdownPath: null,
  recognizedText: "",
  pronScore: 75,
  accuracyScore: 72,
  fluencyScore: 80,
  completenessScore: 90,
  wordResultsJson: [],
  providerRawJson: {},
  analysisJson: {
    summary: "",
    nextDrill: "",
    weakPatterns: [],
    highlightTokens: [],
  },
  ...patch,
});

describe("normalizeReportWord", () => {
  it("keeps French letters while trimming punctuation", () => {
    expect(normalizeReportWord("Bonjour,")).toBe("bonjour");
    expect(normalizeReportWord("l'amour")).toBe("l'amour");
    expect(normalizeReportWord("été")).toBe("été");
  });
});

describe("buildLowWordScoreReport", () => {
  it("aggregates every low word score across selected sessions and attempts", () => {
    const report = buildLowWordScoreReport({
      materials,
      generatedAt: "2026-05-26T09:00:00.000Z",
      attempts: [
        createAttempt({
          id: "att-1",
          materialId: "mat-1",
          createdAt: "2026-05-22T08:00:00.000Z",
          recognizedText: "Bonjour tout le monde",
          wordResultsJson: [
            { word: "Bonjour", accuracyScore: 62.4, errorType: null },
            { word: "tout", accuracyScore: 92, errorType: null },
          ],
        }),
        createAttempt({
          id: "att-2",
          materialId: "mat-1",
          createdAt: "2026-05-23T08:00:00.000Z",
          recognizedText: "bonjour tout le monde",
          wordResultsJson: [
            { word: "bonjour", accuracyScore: 58, errorType: "Mispronunciation" },
            { word: "monde", accuracyScore: 69.9, errorType: null },
          ],
        }),
        createAttempt({
          id: "att-3",
          materialId: "mat-2",
          createdAt: "2026-05-24T08:00:00.000Z",
          recognizedText: "Je voudrais reserver",
          wordResultsJson: [
            { word: "voudrais", accuracyScore: 68, errorType: null },
            { word: "bonjour", accuracyScore: 64, errorType: null },
          ],
        }),
      ],
    });

    expect(report.lowScoreResultCount).toBe(5);
    expect(report.words.map((word) => word.normalizedWord)).toEqual([
      "bonjour",
      "voudrais",
      "monde",
    ]);
    expect(report.words[0]).toMatchObject({
      frequency: 3,
      averageScore: 61.5,
      minScore: 58,
      maxScore: 64,
      latestScore: 64,
      sessionCount: 2,
    });
  });

  it("renders downloadable markdown and pdf output", () => {
    const report = buildLowWordScoreReport({
      materials: [materials[0]],
      generatedAt: "2026-05-26T09:00:00.000Z",
      attempts: [
        createAttempt({
          id: "att-1",
          materialId: "mat-1",
          createdAt: "2026-05-22T08:00:00.000Z",
          wordResultsJson: [{ word: "Bonjour", accuracyScore: 62.4, errorType: null }],
        }),
      ],
    });

    const markdown = renderLowWordScoreReportMarkdown(report);
    expect(markdown).toContain("# Low Word Score Report");
    expect(markdown).toContain("Bonjour");
    expect(markdown).toContain("62.4");

    const pdf = renderLowWordScoreReportPdf(report);
    expect(pdf.subarray(0, 8).toString("latin1")).toBe("%PDF-1.4");
  });
});
