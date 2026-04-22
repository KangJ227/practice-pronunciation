import { appConfig, isKimiConfigured } from "@/lib/config";
import { inferWeakPatternTypeForToken } from "@/lib/text";
import type { KimiAnalysis, WeakPattern, WordAssessment } from "@/lib/types";

type AnalyzeInput = {
  referenceText: string;
  recognizedText: string;
  pronScore: number | null;
  accuracyScore: number | null;
  fluencyScore: number | null;
  completenessScore: number | null;
  wordResults: WordAssessment[];
  history: WeakPattern[];
};

export const analyzeAttemptWithKimi = async (input: AnalyzeInput): Promise<KimiAnalysis> => {
  if (!isKimiConfigured()) {
    return fallbackAnalysis(input);
  }

  const requestBody: Record<string, unknown> = {
    model: appConfig.kimiModel,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a French pronunciation coach. Respond with JSON only. Keep feedback concise and practical. Use weakPatterns.type only from: word_pronunciation, liaison_elision, nasal_vowel, vowel_quality, silent_letter, fluency_pause, omission_insertion.",
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Analyze a single French pronunciation attempt.",
          constraints: {
            locale: "fr-FR",
            noGrammarClaims: true,
            tokenLevelHighlightsOnly: true,
          },
          expectedJsonShape: {
            summary: "string",
            nextDrill: "string",
            weakPatterns: [
              {
                type: "word_pronunciation|liaison_elision|nasal_vowel|vowel_quality|silent_letter|fluency_pause|omission_insertion",
                key: "stable-lowercase-key",
                displayText: "short label",
                severity: "1-3 integer",
                reason: "one short reason",
              },
            ],
            highlightTokens: ["token"],
          },
          input,
        }),
      },
    ],
  };

  if (appConfig.kimiModel === "kimi-k2.5") {
    requestBody.thinking = { type: "disabled" };
  }

  const response = await fetch(`${appConfig.kimiBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${appConfig.kimiApiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorMessage = await readKimiError(response);
    return fallbackAnalysis(
      input,
      errorMessage
        ? `Kimi request failed (${response.status}): ${errorMessage}`
        : `Kimi request failed: ${response.status}`,
    );
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    return fallbackAnalysis(input, "Kimi returned an empty response.");
  }

  try {
    const parsed = JSON.parse(content) as Partial<KimiAnalysis>;
    return {
      summary: String(parsed.summary ?? "Focus on one sentence at a time and match the reference rhythm."),
      nextDrill: String(parsed.nextDrill ?? "Replay the sentence, then record again with steadier pacing."),
      weakPatterns: Array.isArray(parsed.weakPatterns)
        ? parsed.weakPatterns
            .filter((item): item is KimiAnalysis["weakPatterns"][number] => Boolean(item && typeof item === "object"))
            .map((item) => ({
              type: item.type ?? "word_pronunciation",
              key: String(item.key ?? item.displayText ?? "").toLowerCase(),
              displayText: String(item.displayText ?? item.key ?? "Focus word"),
              severity: clampSeverity(item.severity),
              reason: String(item.reason ?? "This sound needs another pass."),
            }))
            .filter((item) => item.key)
        : [],
      highlightTokens: Array.isArray(parsed.highlightTokens)
        ? parsed.highlightTokens.map((token) => String(token).toLowerCase()).filter(Boolean)
        : [],
    };
  } catch {
    return fallbackAnalysis(input, "Kimi returned invalid JSON.");
  }
};

const fallbackAnalysis = (input: AnalyzeInput, warning?: string): KimiAnalysis => {
  const lowWords = input.wordResults
    .filter((word) => {
      const score = word.accuracyScore ?? 100;
      return score < 75 || /omission|insertion/i.test(word.errorType ?? "");
    })
    .slice(0, 6);

  const weakPatterns = lowWords.map((word) => ({
    type: /omission|insertion/i.test(word.errorType ?? "")
      ? ("omission_insertion" as const)
      : inferWeakPatternTypeForToken(word.word),
    key: word.word.toLowerCase(),
    displayText: word.word,
    severity:
      /omission|insertion/i.test(word.errorType ?? "") || (word.accuracyScore ?? 100) < 60 ? 3 : 2,
    reason:
      word.errorType && !/none/i.test(word.errorType)
        ? `Azure detected ${word.errorType.toLowerCase()} on this word.`
        : "This word scored low and should be repeated slowly before another full attempt.",
  }));

  const summaryBase =
    lowWords.length > 0
      ? `Priority words: ${lowWords.map((word) => word.word).join(", ")}.`
      : "The attempt is recorded. Repeat once more and aim for steadier pacing.";

  return {
    summary: warning ? `${summaryBase} ${warning}` : summaryBase,
    nextDrill:
      lowWords.length > 0
        ? `Replay ${lowWords[0]?.word ?? "the target phrase"} three times, then record the sentence again.`
        : "Listen once, shadow the reference, then record again.",
    weakPatterns,
    highlightTokens: lowWords.map((word) => word.word.toLowerCase()),
  };
};

const clampSeverity = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return 1;
  }

  return Math.max(1, Math.min(3, Math.round(parsed)));
};

const readKimiError = async (response: Response) => {
  try {
    const payload = (await response.json()) as {
      error?: {
        message?: string;
      };
    };

    return payload.error?.message ?? null;
  } catch {
    return null;
  }
};
