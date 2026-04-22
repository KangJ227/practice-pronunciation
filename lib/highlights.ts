import { inferWeakPatternTypeForToken, tokenizeFrench } from "@/lib/text";
import type { HighlightToken, SentenceSegment, WeakPattern } from "@/lib/types";

const qualifiesForHighlight = (pattern: WeakPattern) => {
  if (pattern.patternType === "omission_insertion") {
    return pattern.evidenceCount >= 1;
  }

  if (pattern.patternType === "word_pronunciation") {
    return pattern.evidenceCount >= 2;
  }

  return pattern.evidenceCount >= 2 || pattern.severity >= 2;
};

const buildReason = (pattern: WeakPattern) => {
  const notesReason =
    typeof pattern.notesJson.reason === "string" ? pattern.notesJson.reason : undefined;

  return notesReason || `${pattern.displayText} has been a repeated weak point.`;
};

export const computeSegmentHighlights = (
  segment: SentenceSegment,
  weakPatterns: WeakPattern[],
): HighlightToken[] => {
  const tokens = tokenizeFrench(segment.text);
  const highlights: HighlightToken[] = [];

  for (const token of tokens) {
    const directMatch = weakPatterns.find(
      (pattern) =>
        pattern.patternKey === token.normalized &&
        qualifiesForHighlight(pattern),
    );

    if (directMatch) {
      highlights.push({
        token: token.token,
        normalized: token.normalized,
        severity: directMatch.severity,
        reason: buildReason(directMatch),
      });
      continue;
    }

    const inferredType = inferWeakPatternTypeForToken(token.normalized);
    const categoryMatch = weakPatterns.find(
      (pattern) =>
        pattern.patternType === inferredType &&
        pattern.patternKey !== token.normalized &&
        qualifiesForHighlight(pattern),
    );

    if (categoryMatch) {
      highlights.push({
        token: token.token,
        normalized: token.normalized,
        severity: Math.max(1, categoryMatch.severity - 1),
        reason: buildReason(categoryMatch),
      });
    }
  }

  return dedupeHighlights(highlights);
};

export const buildFocusItems = (weakPatterns: WeakPattern[]) =>
  weakPatterns
    .filter(qualifiesForHighlight)
    .slice(0, 6)
    .map((pattern) => ({
      patternType: pattern.patternType,
      displayText: pattern.displayText,
      severity: pattern.severity,
      reason: buildReason(pattern),
    }));

const dedupeHighlights = (items: HighlightToken[]) => {
  const seen = new Set<string>();
  const deduped: HighlightToken[] = [];

  for (const item of items) {
    if (seen.has(item.normalized)) {
      continue;
    }

    seen.add(item.normalized);
    deduped.push(item);
  }

  return deduped;
};
