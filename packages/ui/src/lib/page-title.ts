import { useEffect } from "react";
import { useT } from "@/i18n";

/**
 * The document title for a routed page: "<page> · Basics".
 *
 * Every route names itself in the tab, so a browser window, a screen reader's page list and
 * a stack of two Basics windows read differently. Pass the page's own heading (a note title
 * for the editor, "Inbox (2)" while proposals wait); `null` falls back to the app name alone
 * for a page that has no stable name yet.
 */
export function useDocumentTitle(title: string | null | undefined): void {
  const t = useT();
  const app = t("app.name");
  useEffect(() => {
    document.title = title ? `${title} · ${app}` : app;
  }, [title, app]);
}
