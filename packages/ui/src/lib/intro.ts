import { useCallback, useState } from "react";

/**
 * Page introductions (owner decision Q9 A).
 *
 * A page's description sits under the title until the page has data or the user dismisses
 * it; after that it lives behind the `?` in `PageHeader`. The dismissal is local to the
 * device and remembered per page, so the choice survives a reload.
 */

const KEY = "basics:intro-dismissed";

function read(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value): value is string => typeof value === "string"));
  } catch {
    return new Set();
  }
}

function write(pages: Set<string>): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...pages]));
  } catch {
    // Storage can be unavailable in private or restricted contexts.
  }
}

export interface IntroDisclosure {
  /** True while the description should sit under the title. */
  showIntro: boolean;
  /** Hide the description and remember the choice for this page. */
  dismiss: () => void;
}

/**
 * `hasData` should already be true while the data is still loading if the page normally has
 * content: deciding from `undefined` would show the intro and then pull it away on the first
 * query result, which reads as a layout jump.
 */
export function useIntro(page: string, hasData: boolean): IntroDisclosure {
  const [dismissed, setDismissed] = useState(() => read().has(page));
  const dismiss = useCallback(() => {
    const pages = read();
    pages.add(page);
    write(pages);
    setDismissed(true);
  }, [page]);
  return { showIntro: !hasData && !dismissed, dismiss };
}
