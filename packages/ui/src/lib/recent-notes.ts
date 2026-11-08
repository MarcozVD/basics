const KEY = "basics-recent-notes";
const LIMIT = 5;

export interface RecentItem {
  /** Note or project id. */
  id: string;
  /** When the user last opened it on this device, ISO string. */
  opened: string;
}

/**
 * Last notes and projects opened on this device, most recent first.
 *
 * Entries written by older builds were plain id strings; they still read, with the
 * current time standing in for the missing timestamp so they stay usable once.
 */
export function readRecentItems(): RecentItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    const now = new Date().toISOString();
    const seen = new Set<string>();
    const items: RecentItem[] = [];
    for (const value of parsed) {
      const item =
        typeof value === "string"
          ? { id: value, opened: now }
          : value && typeof value === "object" && typeof (value as RecentItem).id === "string"
            ? {
                id: (value as RecentItem).id,
                opened: typeof (value as RecentItem).opened === "string" ? (value as RecentItem).opened : now,
              }
            : null;
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
      if (items.length === LIMIT) break;
    }
    return items;
  } catch {
    return [];
  }
}

/** Record that a note or project was opened on this device. Never throws. */
export function rememberRecentItem(id: string): void {
  try {
    const next = [{ id, opened: new Date().toISOString() }, ...readRecentItems().filter((value) => value.id !== id)];
    localStorage.setItem(KEY, JSON.stringify(next.slice(0, LIMIT)));
  } catch {
    // Storage can be unavailable in private or restricted contexts.
  }
}
