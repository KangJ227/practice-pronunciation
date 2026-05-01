import path from "node:path";
import { writeStorageFile } from "@/lib/storage";
import type { PracticeAttempt, SentenceSegment, StudyMaterial } from "@/lib/types";
import { roundScore } from "@/lib/utils";

type AttemptFeedbackInput = {
  material: StudyMaterial;
  segment: SentenceSegment;
  attempt: PracticeAttempt;
};

export const getAttemptFeedbackPaths = (
  attempt: Pick<PracticeAttempt, "id" | "segmentId">,
) => ({
  feedbackJsonPath: path.posix.join(
    "attempts",
    attempt.segmentId ?? "unlinked",
    "feedback",
    `${attempt.id}-feedback.json`,
  ),
  feedbackMarkdownPath: path.posix.join(
    "attempts",
    attempt.segmentId ?? "unlinked",
    "feedback",
    `${attempt.id}-feedback.md`,
  ),
});

export const buildAttemptFeedbackPayload = ({
  material,
  segment,
  attempt,
}: AttemptFeedbackInput) => ({
  material: {
    id: material.id,
    title: material.title,
    kind: material.kind,
    locale: material.locale,
  },
  segment: {
    id: segment.id,
    index: segment.index,
    text: segment.text,
    source: segment.source,
    startMs: segment.startMs,
    endMs: segment.endMs,
  },
  attempt: {
    id: attempt.id,
    createdAt: attempt.createdAt,
    attemptAudioPath: attempt.attemptAudioPath,
    feedbackJsonPath: attempt.feedbackJsonPath,
    feedbackMarkdownPath: attempt.feedbackMarkdownPath,
    recognizedText: attempt.recognizedText,
    scores: {
      pron: roundScore(attempt.pronScore),
      accuracy: roundScore(attempt.accuracyScore),
      fluency: roundScore(attempt.fluencyScore),
      completeness: roundScore(attempt.completenessScore),
    },
    analysis: attempt.analysisJson,
    wordResults: attempt.wordResultsJson,
    providerRaw: attempt.providerRawJson,
  },
});

export const buildAttemptFeedbackMarkdown = ({
  material,
  segment,
  attempt,
}: AttemptFeedbackInput) => {
  const lines = [
    "# Practice Attempt Feedback",
    "",
    `- Material: ${material.title}`,
    `- Material ID: ${material.id}`,
    `- Segment: ${segment.index + 1}`,
    `- Segment ID: ${segment.id}`,
    `- Attempt ID: ${attempt.id}`,
    `- Created At: ${attempt.createdAt}`,
    `- Attempt Audio: ${attempt.attemptAudioPath}`,
    "",
    "## Target Text",
    "",
    segment.text,
    "",
    "## Scores",
    "",
    `- Pronunciation: ${formatScore(attempt.pronScore)}`,
    `- Accuracy: ${formatScore(attempt.accuracyScore)}`,
    `- Fluency: ${formatScore(attempt.fluencyScore)}`,
    `- Completeness: ${formatScore(attempt.completenessScore)}`,
    "",
    "## Recognized Text",
    "",
    attempt.recognizedText || "No transcript returned.",
    "",
    "## Summary",
    "",
    attempt.analysisJson.summary || "No summary returned.",
    "",
    "## Next Drill",
    "",
    attempt.analysisJson.nextDrill || "Repeat once more with the reference audio.",
    "",
    "## Weak Patterns",
    "",
  ];

  if (attempt.analysisJson.weakPatterns.length > 0) {
    for (const item of attempt.analysisJson.weakPatterns) {
      lines.push(
        `- [severity ${item.severity}] ${item.displayText} (${item.type}): ${item.reason}`,
      );
    }
  } else {
    lines.push("- None.");
  }

  lines.push("", "## Word Results", "");

  if (attempt.wordResultsJson.length > 0) {
    for (const word of attempt.wordResultsJson) {
      lines.push(
        `- ${word.word}: accuracy ${formatScore(word.accuracyScore)}, error ${word.errorType ?? "none"}`,
      );
    }
  } else {
    lines.push("- No word-level results.");
  }

  lines.push("", "## Feedback Files", "");

  if (attempt.feedbackJsonPath) {
    lines.push(`- JSON: ${attempt.feedbackJsonPath}`);
  }

  if (attempt.feedbackMarkdownPath) {
    lines.push(`- Markdown: ${attempt.feedbackMarkdownPath}`);
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
};

export const writeAttemptFeedbackArtifacts = async (input: AttemptFeedbackInput) => {
  const payload = buildAttemptFeedbackPayload(input);
  const markdown = buildAttemptFeedbackMarkdown(input);
  const paths = getAttemptFeedbackPaths(input.attempt);

  const [feedbackJsonPath, feedbackMarkdownPath] = await Promise.all([
    writeStorageFile(paths.feedbackJsonPath, `${JSON.stringify(payload, null, 2)}\n`),
    writeStorageFile(paths.feedbackMarkdownPath, markdown),
  ]);

  return {
    feedbackJsonPath,
    feedbackMarkdownPath,
  };
};

const formatScore = (value: number | null | undefined) => {
  const rounded = roundScore(value);
  return rounded === null ? "n/a" : `${rounded}`;
};
