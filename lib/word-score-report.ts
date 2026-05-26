import { LOW_WORD_SCORE_THRESHOLD } from "@/lib/pronunciation-thresholds";
import type { PracticeAttempt, StudyMaterial } from "@/lib/types";
import { roundScore } from "@/lib/utils";

export type LowWordScoreEvidence = {
  attemptId: string;
  materialId: string;
  materialTitle: string;
  word: string;
  score: number;
  errorType: string | null;
  recognizedText: string;
  createdAt: string;
};

export type LowWordScoreSummary = {
  normalizedWord: string;
  displayWord: string;
  frequency: number;
  averageScore: number;
  minScore: number;
  maxScore: number;
  latestScore: number;
  latestSeenAt: string;
  sessionCount: number;
  sessionTitles: string[];
  errorTypes: string[];
  evidence: LowWordScoreEvidence[];
};

export type LowWordScoreReport = {
  generatedAt: string;
  threshold: number;
  materials: Array<Pick<StudyMaterial, "id" | "title" | "kind" | "createdAt">>;
  attemptCount: number;
  attemptWithWordScoresCount: number;
  lowScoreResultCount: number;
  words: LowWordScoreSummary[];
};

type MutableWordSummary = {
  normalizedWord: string;
  displayWord: string;
  scores: number[];
  sessionTitles: Set<string>;
  errorTypes: Set<string>;
  evidence: LowWordScoreEvidence[];
};

export const normalizeReportWord = (word: string) =>
  word
    .normalize("NFC")
    .toLocaleLowerCase("fr-FR")
    .replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, "")
    .trim();

export const buildLowWordScoreReport = (input: {
  materials: StudyMaterial[];
  attempts: PracticeAttempt[];
  generatedAt?: string;
  threshold?: number;
}): LowWordScoreReport => {
  const threshold = input.threshold ?? LOW_WORD_SCORE_THRESHOLD;
  const materialById = new Map(input.materials.map((material) => [material.id, material]));
  const summaries = new Map<string, MutableWordSummary>();
  let attemptWithWordScoresCount = 0;
  let lowScoreResultCount = 0;

  for (const attempt of input.attempts) {
    if (attempt.wordResultsJson.length > 0) {
      attemptWithWordScoresCount += 1;
    }

    const material = materialById.get(attempt.materialId);
    if (!material) {
      continue;
    }

    for (const word of attempt.wordResultsJson) {
      if (typeof word.accuracyScore !== "number" || !Number.isFinite(word.accuracyScore)) {
        continue;
      }

      if (word.accuracyScore >= threshold) {
        continue;
      }

      const normalizedWord = normalizeReportWord(word.word);
      if (!normalizedWord) {
        continue;
      }

      lowScoreResultCount += 1;

      const existing = summaries.get(normalizedWord);
      const summary =
        existing ??
        {
          normalizedWord,
          displayWord: word.word,
          scores: [],
          sessionTitles: new Set<string>(),
          errorTypes: new Set<string>(),
          evidence: [],
        };

      summary.scores.push(word.accuracyScore);
      summary.sessionTitles.add(material.title);
      if (word.errorType) {
        summary.errorTypes.add(word.errorType);
      }
      summary.evidence.push({
        attemptId: attempt.id,
        materialId: material.id,
        materialTitle: material.title,
        word: word.word,
        score: word.accuracyScore,
        errorType: word.errorType,
        recognizedText: attempt.recognizedText,
        createdAt: attempt.createdAt,
      });

      summaries.set(normalizedWord, summary);
    }
  }

  const words = Array.from(summaries.values()).map((summary) => {
    const evidence = summary.evidence.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const minScore = Math.min(...summary.scores);
    const maxScore = Math.max(...summary.scores);
    const averageScore = roundScore(
      summary.scores.reduce((total, score) => total + score, 0) / summary.scores.length,
    );

    return {
      normalizedWord: summary.normalizedWord,
      displayWord: summary.displayWord,
      frequency: summary.scores.length,
      averageScore: averageScore ?? 0,
      minScore,
      maxScore,
      latestScore: evidence[0]?.score ?? 0,
      latestSeenAt: evidence[0]?.createdAt ?? "",
      sessionCount: summary.sessionTitles.size,
      sessionTitles: Array.from(summary.sessionTitles).sort((a, b) => a.localeCompare(b)),
      errorTypes: Array.from(summary.errorTypes).sort((a, b) => a.localeCompare(b)),
      evidence,
    };
  });

  words.sort((a, b) => {
    if (b.frequency !== a.frequency) {
      return b.frequency - a.frequency;
    }
    if (a.averageScore !== b.averageScore) {
      return a.averageScore - b.averageScore;
    }
    if (a.minScore !== b.minScore) {
      return a.minScore - b.minScore;
    }
    return a.displayWord.localeCompare(b.displayWord);
  });

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    threshold,
    materials: input.materials.map((material) => ({
      id: material.id,
      title: material.title,
      kind: material.kind,
      createdAt: material.createdAt,
    })),
    attemptCount: input.attempts.length,
    attemptWithWordScoresCount,
    lowScoreResultCount,
    words,
  };
};

export const renderLowWordScoreReportMarkdown = (report: LowWordScoreReport) => {
  const lines = [
    "# Low Word Score Report",
    "",
    `Generated: ${formatTimestamp(report.generatedAt)}`,
    `Threshold: word accuracy < ${formatScore(report.threshold)}`,
    `Sessions: ${report.materials.length}`,
    `Attempts scanned: ${report.attemptCount}`,
    `Attempts with word scores: ${report.attemptWithWordScoresCount}`,
    `Low-score word results: ${report.lowScoreResultCount}`,
    `Unique low-score words: ${report.words.length}`,
    "",
    "## Sessions",
    "",
    ...report.materials.map(
      (material) =>
        `- ${escapeMarkdown(material.title)} (${material.kind}, created ${formatTimestamp(
          material.createdAt,
        )})`,
    ),
    "",
    "## Low Words By Frequency",
    "",
  ];

  if (report.words.length === 0) {
    lines.push(`No word accuracy scores below ${formatScore(report.threshold)} were found.`);
    return `${lines.join("\n")}\n`;
  }

  lines.push(
    "| Rank | Word | Hits | Avg | Min | Max | Latest | Sessions | Error types |",
    "| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
  );

  report.words.forEach((word, index) => {
    const cells = [
      index + 1,
      escapeTableCell(word.displayWord),
      word.frequency,
      formatScore(word.averageScore),
      formatScore(word.minScore),
      formatScore(word.maxScore),
      formatScore(word.latestScore),
      word.sessionCount,
      escapeTableCell(word.errorTypes.join(", ") || "none"),
    ];

    lines.push(`| ${cells.join(" | ")} |`);
  });

  lines.push("", "## Evidence", "");

  for (const word of report.words) {
    lines.push(
      `### ${escapeMarkdown(word.displayWord)}`,
      "",
      `Sessions: ${word.sessionTitles.map(escapeMarkdown).join(", ")}`,
      "",
    );

    for (const evidence of word.evidence) {
      lines.push(
        `- ${formatScore(evidence.score)} in ${escapeMarkdown(
          evidence.materialTitle,
        )} at ${formatTimestamp(evidence.createdAt)}${
          evidence.errorType ? ` (${escapeMarkdown(evidence.errorType)})` : ""
        }`,
      );

      if (evidence.recognizedText) {
        lines.push(`  Recognized: ${escapeMarkdown(truncate(evidence.recognizedText, 180))}`);
      }
    }

    lines.push("");
  }

  return `${lines.join("\n")}\n`;
};

export const renderLowWordScoreReportPdf = (report: LowWordScoreReport) => {
  const lines = renderLowWordScoreReportText(report);
  return createTextPdf(lines);
};

const renderLowWordScoreReportText = (report: LowWordScoreReport) => {
  const lines = [
    "Low Word Score Report",
    "",
    `Generated: ${formatTimestamp(report.generatedAt)}`,
    `Threshold: word accuracy < ${formatScore(report.threshold)}`,
    `Sessions: ${report.materials.length}`,
    `Attempts scanned: ${report.attemptCount}`,
    `Attempts with word scores: ${report.attemptWithWordScoresCount}`,
    `Low-score word results: ${report.lowScoreResultCount}`,
    `Unique low-score words: ${report.words.length}`,
    "",
    "Sessions",
  ];

  for (const material of report.materials) {
    lines.push(`- ${material.title} (${material.kind}, created ${formatTimestamp(material.createdAt)})`);
  }

  lines.push("", "Low Words By Frequency");

  if (report.words.length === 0) {
    lines.push(`No word accuracy scores below ${formatScore(report.threshold)} were found.`);
    return lines;
  }

  report.words.forEach((word, index) => {
    lines.push(
      `${index + 1}. ${word.displayWord} | hits ${word.frequency} | avg ${formatScore(
        word.averageScore,
      )} | min ${formatScore(word.minScore)} | latest ${formatScore(word.latestScore)}`,
    );
    lines.push(`   Sessions: ${word.sessionTitles.join(", ")}`);
    if (word.errorTypes.length > 0) {
      lines.push(`   Error types: ${word.errorTypes.join(", ")}`);
    }
  });

  lines.push("", "Evidence");

  for (const word of report.words) {
    lines.push("", word.displayWord);
    for (const evidence of word.evidence) {
      lines.push(
        `- ${formatScore(evidence.score)} | ${evidence.materialTitle} | ${formatTimestamp(
          evidence.createdAt,
        )}${evidence.errorType ? ` | ${evidence.errorType}` : ""}`,
      );
      if (evidence.recognizedText) {
        lines.push(`  Recognized: ${truncate(evidence.recognizedText, 160)}`);
      }
    }
  }

  return lines;
};

const formatScore = (score: number) =>
  Number.isInteger(score) ? String(score) : score.toFixed(1);

const formatTimestamp = (value: string) => {
  if (!value) {
    return "unknown";
  }

  return value.replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
};

const escapeMarkdown = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/\*/g, "\\*").replace(/_/g, "\\_");

const escapeTableCell = (value: string) => escapeMarkdown(value).replace(/\|/g, "\\|");

const truncate = (value: string, maxLength: number) =>
  value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;

const createTextPdf = (lines: string[]) => {
  const wrappedLines = lines.flatMap((line) => wrapLine(line, 92));
  const pages = chunk(wrappedLines, 48);
  const fontObjectId = 3;
  const objects: Buffer[] = [];
  const pageRefs: number[] = [];
  let nextObjectId = 4;

  for (const pageLines of pages.length > 0 ? pages : [[]]) {
    const pageObjectId = nextObjectId++;
    const contentObjectId = nextObjectId++;
    pageRefs.push(pageObjectId);

    const content = buildPageContent(pageLines);
    objects[pageObjectId] = Buffer.from(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`,
      "latin1",
    );
    objects[contentObjectId] = Buffer.concat([
      Buffer.from(`<< /Length ${content.length} >>\nstream\n`, "latin1"),
      content,
      Buffer.from("\nendstream", "latin1"),
    ]);
  }

  objects[1] = Buffer.from("<< /Type /Catalog /Pages 2 0 R >>", "latin1");
  objects[2] = Buffer.from(
    `<< /Type /Pages /Kids [${pageRefs.map((id) => `${id} 0 R`).join(" ")}] /Count ${
      pageRefs.length
    } >>`,
    "latin1",
  );
  objects[fontObjectId] = Buffer.from(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "latin1",
  );

  const buffers: Buffer[] = [Buffer.from("%PDF-1.4\n", "latin1")];
  const offsets = [0];
  const maxObjectId = nextObjectId - 1;

  for (let objectId = 1; objectId <= maxObjectId; objectId += 1) {
    offsets[objectId] = totalLength(buffers);
    buffers.push(Buffer.from(`${objectId} 0 obj\n`, "latin1"));
    buffers.push(objects[objectId]);
    buffers.push(Buffer.from("\nendobj\n", "latin1"));
  }

  const xrefOffset = totalLength(buffers);
  buffers.push(Buffer.from(`xref\n0 ${maxObjectId + 1}\n`, "latin1"));
  buffers.push(Buffer.from("0000000000 65535 f \n", "latin1"));

  for (let objectId = 1; objectId <= maxObjectId; objectId += 1) {
    buffers.push(Buffer.from(`${String(offsets[objectId]).padStart(10, "0")} 00000 n \n`, "latin1"));
  }

  buffers.push(
    Buffer.from(
      `trailer\n<< /Size ${maxObjectId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
      "latin1",
    ),
  );

  return Buffer.concat(buffers);
};

const buildPageContent = (lines: string[]) => {
  const chunks: Buffer[] = [Buffer.from("BT\n/F1 10 Tf\n14 TL\n50 760 Td\n", "latin1")];

  for (const line of lines) {
    chunks.push(pdfLiteral(line));
    chunks.push(Buffer.from(" Tj\nT*\n", "latin1"));
  }

  chunks.push(Buffer.from("ET\n", "latin1"));
  return Buffer.concat(chunks);
};

const pdfLiteral = (value: string) => {
  const bytes = [40];
  const safeValue = value.normalize("NFC").replace(/[^\u0009\u000A\u000D\u0020-\u00FF]/g, "?");

  for (const char of safeValue) {
    const code = char.charCodeAt(0);
    if (code === 40 || code === 41 || code === 92) {
      bytes.push(92);
    }
    bytes.push(code < 32 ? 32 : code);
  }

  bytes.push(41);
  return Buffer.from(bytes);
};

const wrapLine = (line: string, maxLength: number) => {
  if (line.length <= maxLength) {
    return [line];
  }

  const words = line.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }

    if (`${current} ${word}`.length <= maxLength) {
      current = `${current} ${word}`;
      continue;
    }

    lines.push(current);
    current = word;
  }

  if (current) {
    lines.push(current);
  }

  return lines.flatMap((item) => splitLongLine(item, maxLength));
};

const splitLongLine = (line: string, maxLength: number) => {
  if (line.length <= maxLength) {
    return [line];
  }

  const result: string[] = [];
  for (let index = 0; index < line.length; index += maxLength) {
    result.push(line.slice(index, index + maxLength));
  }
  return result;
};

const chunk = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const totalLength = (buffers: Buffer[]) =>
  buffers.reduce((total, buffer) => total + buffer.length, 0);
