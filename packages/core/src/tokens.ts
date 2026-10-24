// Fuller ES/EN stopword lists so function words never contribute to a score. Kept to function
// words only: content words that name situations ("base", "web", "api", "local", "estado") stay.
const ENGLISH = `a about above across after again against all along among an and any are around as at be
because been before behind being below beside between beyond both but by can cannot could did do does
doing down during each either except few for from further had has have having he her here hers herself
him himself his how i if in inside into is it its itself just me more most my myself near no nor not now
of off on once only onto or other our ours out over own same she should since so some such than that the
their theirs them themselves then there these they this those through to too toward under until up upon
us very via was we were what when where which while who whom why will with within without would you your
yours yourself yourselves`;

const SPANISH = `a al algo algunos ante antes aunque cada como con contra cual cuales cuando cuanto cuantos de del
desde donde dos e el ella ellas ellos en entonces entre era eran eras eres es esa esas ese eso esos esta
estaba estaban estan estar estas este esto estos fue fueron ha habia hacia han hasta hay la las le les lo los
mas me mediante mi mientras misma mismo mismas mismos muy nada ni ningun ninguna ninguno no nos nosotros
nuestra nuestro o os otra otras otro otros para pero poco por porque que quien se sea segun ser si sin sobre
son su sus tal tales tambien tanto te tiene tienen todo todos tras tu tus u un una uno unos vosotros y ya yo`;

const STOPWORDS = new Set([...ENGLISH.split(/\s+/), ...SPANISH.split(/\s+/)].filter(Boolean));

/**
 * One light stemmer for both languages: a small ordered set of suffix rules, applied repeatedly
 * until none matches. It is deliberately shallow (no dictionaries): it only needs to make
 * inflection variants of the same word meet ("transacciones" ~ "transacción",
 * "concurrentes" ~ "concurrencia", "locales" ~ "localmente" ~ "local", "cifrada" ~ "cifrado",
 * "rendering" ~ "render"). Suffix sets from both languages coexist because a token only ever
 * passes one matching rule per round; final double consonants are collapsed ("transacc" ~ "transac").
 */
const RULES: { re: RegExp; drop: number; min: number }[] = [
  // adverbial / abstract-noun endings
  { re: /(mente)$/, drop: 5, min: 4 },
  { re: /(encias)$/, drop: 6, min: 4 },
  { re: /(encia)$/, drop: 5, min: 4 },
  { re: /(ancias)$/, drop: 6, min: 4 },
  { re: /(ancia)$/, drop: 5, min: 4 },
  { re: /(idades)$/, drop: 6, min: 4 },
  { re: /(idad)$/, drop: 4, min: 4 },
  { re: /(ities)$/, drop: 5, min: 4 },
  { re: /(ity)$/, drop: 3, min: 4 },
  { re: /(ciones)$/, drop: 6, min: 4 },
  { re: /(siones)$/, drop: 6, min: 4 },
  { re: /(cion|sion|tion)$/, drop: 4, min: 4 },
  // participles / adjectives (ES and EN)
  { re: /(entes|antes)$/, drop: 5, min: 4 },
  { re: /(ente|ante)$/, drop: 4, min: 4 },
  { re: /(ados|adas|idos|idas)$/, drop: 4, min: 4 },
  { re: /(ado|ada|ido|ida)$/, drop: 3, min: 4 },
  { re: /(ando|endo)$/, drop: 4, min: 4 },
  { re: /(ing)$/, drop: 3, min: 4 },
  { re: /(ed)$/, drop: 2, min: 4 },
  // plurals, then infinitive/vowel endings
  { re: /(es)$/, drop: 2, min: 4 },
  { re: /(s)$/, drop: 1, min: 3 },
  { re: /(ar|er|ir)$/, drop: 2, min: 4 },
  { re: /(e|o|a)$/, drop: 1, min: 5 },
];

/** Shallow, repeat-until-stable suffix stripping so inflections of a word share one stem. */
export function stem(token: string): string {
  let current = token;
  for (let round = 0; round < 4; round++) {
    let changed = false;
    for (const { re, drop, min } of RULES) {
      if (!re.test(current) || current.length - drop < min) continue;
      // Keep "class"/"access"-style endings intact.
      if (drop === 1 && /(ss|us|is)$/.test(current)) continue;
      current = current.slice(0, -drop);
      changed = true;
      break;
    }
    if (!changed) break;
  }
  // "transacc" (transacción) and "transac" (transacciones) meet.
  return current.replace(/([bcdfglmnprstz])\1$/, "$1");
}

/** Lowercase, strip accents, split on every non-word separator, drop stopwords, then stem. */
export function tokens(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}

/**
 * Inverse document frequency over a text corpus. A token that appears in many documents
 * ("app", "web", "datos") counts less than a rare one ("ssr", "playwright"). Unknown tokens
 * are treated as common-by-default (weight 1) so a query still ranks on words the vault lacks.
 */
export function idf(corpus: string[][]): Map<string, number> {
  const df = new Map<string, number>();
  for (const doc of corpus) {
    for (const token of new Set(doc)) df.set(token, (df.get(token) ?? 0) + 1);
  }
  const total = Math.max(1, corpus.length);
  const weights = new Map<string, number>();
  for (const [token, count] of df) {
    // floor at 0.35 so a very common word never counts for nothing.
    weights.set(token, Math.max(0.35, Math.log(total / count)));
  }
  return weights;
}

/** The first paragraph of a note body: consecutive lines until the first blank line. */
export function firstParagraph(body: string): string {
  const lines: string[] = [];
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      if (lines.length) break;
      continue;
    }
    if (line.startsWith("#")) continue;
    lines.push(line.replace(/^([-*+]|\d+\.)\s+/, "").replace(/^>\s*/, ""));
  }
  return lines.join(" ");
}
