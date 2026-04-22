const ABBREVIATIONS = new Set([
  "m.",
  "mme.",
  "mlle.",
  "dr.",
  "pr.",
  "st.",
  "ste.",
  "etc.",
  "cf.",
  "vs.",
  "janv.",
  "févr.",
  "avr.",
  "juil.",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
]);

export const normalizeWhitespace = (text: string) =>
  text.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

export const normalizeSentenceText = (text: string) =>
  normalizeWhitespace(text).replace(/\s+([,.])/g, "$1").trim();

const isDecimalPoint = (text: string, index: number) =>
  /\d/.test(text[index - 1] ?? "") && /\d/.test(text[index + 1] ?? "");

const tokenBefore = (value: string) =>
  value
    .trim()
    .split(/\s+/)
    .slice(-1)[0]
    ?.toLowerCase() ?? "";

const endsWithAbbreviation = (segment: string) => {
  const token = tokenBefore(segment);
  return ABBREVIATIONS.has(token);
};

const continuesDialogueTag = (text: string, punctuationIndex: number) => {
  const nextChunk = text.slice(punctuationIndex + 1);
  return /^\s*(?:[»"')\]]\s*)?[a-zàâäçéèêëîïôöùûüÿ]/u.test(nextChunk);
};

export const splitFrenchSentences = (input: string) => {
  const text = normalizeWhitespace(input);

  if (!text) {
    return [];
  }

  const sentences: string[] = [];
  let buffer = "";

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    buffer += char;

    if (!".!?…".includes(char)) {
      continue;
    }

    if (char === "." && (isDecimalPoint(text, index) || endsWithAbbreviation(buffer))) {
      continue;
    }

    const nextChunk = text.slice(index + 1);
    const nextVisible = nextChunk.match(/[^\s"»)\]]/)?.[0] ?? "";

    if ("!?…".includes(char) && continuesDialogueTag(text, index)) {
      continue;
    }

    const shouldBreak =
      !nextVisible ||
      /[A-ZÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸ«"(\[]/.test(nextVisible) ||
      char !== ".";

    if (!shouldBreak) {
      continue;
    }

    const sentence = normalizeSentenceText(buffer);
    if (sentence) {
      sentences.push(sentence);
    }
    buffer = "";
  }

  const tail = normalizeSentenceText(buffer);
  if (tail) {
    sentences.push(tail);
  }

  return sentences;
};

export const tokenizeFrench = (text: string) => {
  const matches = text.match(/[\p{L}\p{M}][\p{L}\p{M}'’-]*/gu) ?? [];
  return matches.map((token) => ({
    token,
    normalized: token.toLowerCase(),
  }));
};

export const autoSplitSegment = (text: string) => {
  const sentences = splitFrenchSentences(text);
  return sentences.length > 1 ? sentences : [normalizeSentenceText(text)];
};

export const joinSegmentsText = (segments: Array<{ text: string }>) =>
  segments
    .map((segment) => normalizeSentenceText(segment.text))
    .filter(Boolean)
    .join(" ");

export const inferWeakPatternTypeForToken = (token: string) => {
  const normalized = token.toLowerCase();

  if (/(ain|ein|in|im|en|em|on|om|un|um)/.test(normalized)) {
    return "nasal_vowel" as const;
  }

  if (/(eau|eu|œu|ou|u|û|ù|oi|ai|ei|é|è|ê)/.test(normalized)) {
    return "vowel_quality" as const;
  }

  if (/[bcdfghjklmnpqrstvwxz]e?s?$/.test(normalized)) {
    return "silent_letter" as const;
  }

  return "word_pronunciation" as const;
};
