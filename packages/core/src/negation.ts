// Negation cues, Spanish and English. Matched longest first so "no need for" wins over "no".
const CUES = [
  "sin necesidad de",
  "nada de",
  "no necesito",
  "no quiero",
  "no hace falta",
  "evitar",
  "sin",
  "no",
  "no need for",
  "don't need",
  "do not need",
  "without",
  "avoid",
  "not",
];
const CUES_BY_LENGTH = [...new Set(CUES)].sort((a, b) => b.length - a.length);
const CUE_RE = new RegExp(`\\b(${CUES_BY_LENGTH.map(escapeRegExp).join("|")})\\b`, "gi");
const CONJUNCTION_RE = /\b(pero|but|and|y)\b/gi;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Lowercase and strip accents one code point at a time, so offsets stay aligned with the source. */
function fold(text: string): string {
  return [...text]
    .map((ch) => ch.normalize("NFD")[0])
    .join("")
    .toLowerCase();
}

/** The cue a clause starts with, if any. */
function cueAtStart(text: string): string | undefined {
  const folded = fold(text.trimStart());
  return CUES_BY_LENGTH.find((cue) => {
    if (!folded.startsWith(cue)) return false;
    const next = folded.charAt(cue.length);
    return !next || !/[a-z0-9]/.test(next);
  });
}

/** Split at every negation cue, keeping the cue with the clause it starts. */
function splitAtCues(text: string): string[] {
  const folded = fold(text);
  const out: string[] = [];
  let last = 0;
  CUE_RE.lastIndex = 0;
  for (const match of folded.matchAll(CUE_RE)) {
    if (match.index === undefined || match.index === last) continue;
    out.push(text.slice(last, match.index));
    last = match.index;
  }
  out.push(text.slice(last));
  return out.filter((part) => part.trim().length > 0);
}

/** Split at "pero/but/y/and" only when the preceding span was negated. */
function splitAtConjunctions(clause: string): string[] {
  if (!cueAtStart(clause)) return [clause];
  const folded = fold(clause);
  const out: string[] = [];
  let start = 0;
  CONJUNCTION_RE.lastIndex = 0;
  for (const match of folded.matchAll(CONJUNCTION_RE)) {
    if (match.index === undefined) continue;
    if (!cueAtStart(clause.slice(start, match.index))) continue;
    out.push(clause.slice(start, match.index));
    start = match.index + match[0].length;
  }
  out.push(clause.slice(start));
  return out;
}

/**
 * Separate what the user wants from what they explicitly do not want.
 * Clauses split at `,` `;` `.`, at negation cues, and at conjunctions after a negated span.
 */
export function splitNegations(description: string): { positive: string; negated: string[] } {
  const positive: string[] = [];
  const negated: string[] = [];
  for (const sentence of description.split(/[.;,]+/)) {
    for (const chunk of splitAtCues(sentence)) {
      for (const clause of splitAtConjunctions(chunk)) {
        const text = clause.trim();
        if (!text) continue;
        const cue = cueAtStart(text);
        if (!cue) {
          positive.push(text);
          continue;
        }
        const rest = text.slice(cue.length).trim();
        if (rest) negated.push(rest);
      }
    }
  }
  const clean = (text: string) =>
    text
      .replace(/^(pero|but|y|and)\s+/i, "")
      .replace(/\s+(pero|but|y|and)$/i, "")
      .trim();
  return { positive: positive.map(clean).filter(Boolean).join(". "), negated };
}

/**
 * Split a single note phrase at its first negation cue: "API pura sin interfaz" ->
 * { positive: "api pura", negated: "interfaz" }. Text is accent-folded and lowercased.
 */
export function phraseParts(phrase: string): { positive: string; negated?: string } {
  const folded = fold(phrase);
  CUE_RE.lastIndex = 0;
  const match = CUE_RE.exec(folded);
  CUE_RE.lastIndex = 0;
  if (!match) return { positive: folded };
  const negated = folded.slice(match.index + match[0].length).trim();
  return { positive: folded.slice(0, match.index).trim(), negated: negated || undefined };
}
