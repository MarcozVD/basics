const KEY = "basics-recent-notes";
const LIMIT = 5;

/** Last notes opened in the editor, most recent first. Never throws. */
export function readRecentNotes(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string").slice(0, LIMIT);
  } catch {
    return [];
  }
}

export function rememberRecentNote(id: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([id, ...readRecentNotes().filter((value) => value !== id)].slice(0, LIMIT)));
  } catch {
    // Storage can be unavailable in private or restricted contexts.
  }
}
