import type { Note, TechData } from "./schema.js";
import { tokens } from "./tokens.js";
import { toId } from "./vault.js";

// Only known collisions, shared by IDs, titles and package aliases. Ecosystems
// come from vault metadata, not this vocabulary. Extend when a collision is found.
const ambiguousNames = new Set(["poem", "rocket", "echo", "fiber", "swift", "next"]);
const stackCues = new Set([
  "api",
  "http",
  "rest",
  "framework",
  "server",
  "backend",
  "crate",
  "package",
  "library",
  "language",
  "servidor",
  "paquete",
  "biblioteca",
  "lenguaje",
]);
const languagePrepositions = new Set(["in", "using", "en", "con"]);
// Platform aliases, not language assignments. Vault use_when/tags determine
// which language ecosystems use the platform family (including cross-platform ones).
const platformFamilies = [["apple", "ios", "macos", "xcode"]];

/** Raw name words, without stemming; shared with weighted name matching. */
export function nameParts(names: string): string[] {
  return names
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter(Boolean);
}

export function techNameContext(techs: Note[], positive: string) {
  const words = nameParts(positive);
  const query = new Set(tokens(positive));
  const languageOf = (note: Note) => {
    const data = note.data as TechData;
    return data.kind === "language" ? note.id : data.language && toId(data.language);
  };
  const ecosystemWords = new Map<string, Set<string>>();
  for (const note of techs) {
    const language = languageOf(note);
    if (!language) continue;
    const data = note.data as TechData;
    const vocabulary = ecosystemWords.get(language) ?? new Set<string>();
    for (const word of nameParts([...data.tags, ...data.use_when].join(" "))) vocabulary.add(word);
    ecosystemWords.set(language, vocabulary);
  }
  const platformContext = (language: string) =>
    platformFamilies.some(
      (family) => family.some((word) => words.includes(word)) && family.some((word) => ecosystemWords.get(language)?.has(word)),
    );
  const matches = techs.flatMap((note) => {
    const data = note.data as TechData;
    return [note.id, data.title ?? note.id, ...Object.values(data.packages ?? {}).flat()].flatMap((name) => {
      const parts = nameParts(name);
      return words.flatMap((_, start) => {
        if (!parts.length || !parts.every((part, i) => part === words[start + i])) return [];
        const ambiguous = parts.length === 1 && ambiguousNames.has(parts[0]);
        // At most one intervening word: Echo REST API qualifies; fiber network
        // inventory API does not attach its distant API cue to the word fiber.
        const nearby = [...words.slice(Math.max(0, start - 2), start), ...words.slice(start + parts.length, start + parts.length + 2)];
        const languageContext = data.kind === "language" && (languagePrepositions.has(words[start - 1]) || platformContext(note.id));
        return [{ note, parts, qualified: !ambiguous || languageContext || nearby.some((word) => stackCues.has(word)) }];
      });
    });
  });
  const mentioned = new Set<string>();
  // Keep language aliases such as Golang, while ambiguous Swift needs context.
  for (const note of techs) {
    if (note.data.type !== "tech" || note.data.kind !== "language") continue;
    if ([...tokens(note.id), ...tokens(note.data.title ?? note.id)].some((word) => !ambiguousNames.has(word) && query.has(word)))
      mentioned.add(note.id);
  }
  for (const match of matches.filter((match) => match.qualified)) {
    const language = languageOf(match.note);
    if (language) mentioned.add(language);
  }
  const named = new Set<string>();
  const allowedWords = new Set<string>();
  for (const match of matches) {
    const language = languageOf(match.note);
    if (!match.qualified && (!language || !mentioned.has(language))) continue;
    named.add(match.note.id);
    for (const word of match.parts) allowedWords.add(word);
  }
  const blocked = new Set([...ambiguousNames].filter((word) => !allowedWords.has(word)));
  return { named, mentioned, blocked };
}
