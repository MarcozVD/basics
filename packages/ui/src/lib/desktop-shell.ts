import { useEffect } from "react";
import { isMacos } from "./desktop";

/**
 * Browser habits that a desktop window must not have.
 *
 * The app renders the same bundle as `basics ui` on the server, so everything here is
 * installed only when `isDesktop()` is true (see `Layout`): in a browser Ctrl+F still
 * opens the find bar, F5 reloads, right-click shows the native menu and zoom works.
 *
 * Cancelling a key here does not always stop the browser from acting on it — WebView2
 * handles some accelerators itself — so the Rust side also turns off WebView2's browser
 * accelerator keys and zoom hotkeys (see `apps/desktop/src-tauri/src/lib.rs`).
 */

export interface DesktopKeyEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  target?: EventTarget | null;
}

/** What the desktop does with a key: open its own search, swallow it, or leave it alone. */
export type DesktopKeyAction = "search" | "block" | null;

/** Fired when Ctrl/Cmd+F asks for the app's search; the palette listens for it. */
export const PALETTE_SEARCH_EVENT = "basics:open-palette";

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** Keys that mean "something browser-ish" only with Ctrl (Windows/Linux) or Cmd (macOS). */
const BLOCKED_WITH_PRIMARY = new Set(["p", "r", "g", "u", "j", "h", "s", "+", "=", "-", "_", "0"]);

/** Function keys Chromium reserves: find next, reload, caret browsing. */
const BLOCKED_FUNCTION_KEYS = new Set(["F3", "F5", "F7"]);

/** Structural view of a DOM node, so this file (and its tests) need no jsdom. */
interface ElementLike {
  tagName?: unknown;
  isContentEditable?: unknown;
  closest?: (selector: string) => unknown;
}

function asElement(target: EventTarget | null | undefined): ElementLike | null {
  return typeof target === "object" && target !== null ? (target as ElementLike) : null;
}

function matches(node: ElementLike, selector: string): boolean {
  if (typeof node.closest !== "function") return false;
  try {
    return node.closest(selector) != null;
  } catch {
    return false;
  }
}

/** True for fields where a keypress types text: inputs, textareas, selects, contenteditable, CodeMirror. */
export function isEditableTarget(target: EventTarget | null | undefined): boolean {
  const node = asElement(target);
  if (!node) return false;
  if (typeof node.tagName === "string" && EDITABLE_TAGS.has(node.tagName.toUpperCase())) return true;
  if (node.isContentEditable === true) return true;
  return matches(node, ".cm-editor");
}

/** True only inside the CodeMirror editor, which keeps its own Ctrl/Cmd+S. */
function isEditorTarget(target: EventTarget | null | undefined): boolean {
  const node = asElement(target);
  return node !== null && matches(node, ".cm-editor");
}

/**
 * Decides one keydown for the desktop app.
 *
 * `search`: Ctrl/Cmd+F — open the palette's search instead of the find bar.
 * `block`: a browser action the window should not have (print, reload, source, zoom, history…).
 * `null`: leave the key alone — text keys (Ctrl+C/V/X/A/Z), the app's own shortcuts (⌘K),
 * typing in a field, and Option+Arrow caret movement on macOS.
 */
export function desktopKeyAction(event: DesktopKeyEvent, options: { macos?: boolean } = {}): DesktopKeyAction {
  const key = event.key;
  if (!key) return null;

  const primary = event.ctrlKey || event.metaKey;
  const editable = isEditableTarget(event.target);

  // macOS text fields use Ctrl (not Cmd) for caret movement: Ctrl+F/P/N/B/K are typing keys there.
  if (options.macos && event.ctrlKey && !event.metaKey && editable) return null;

  if (BLOCKED_FUNCTION_KEYS.has(key)) return "block";

  if (event.altKey && !primary && (key === "ArrowLeft" || key === "ArrowRight")) {
    // Browser history in a page, word-wise caret movement in a field (Option+Arrow on macOS).
    return editable ? null : "block";
  }

  // Every remaining rule needs the primary modifier and no Alt (AltGr types characters).
  if (!primary || event.altKey) return null;

  const lower = key.length === 1 ? key.toLowerCase() : key;
  if (lower === "f" && !event.shiftKey) return "search";
  if (!BLOCKED_WITH_PRIMARY.has(lower)) return null;
  // The editor saves the note itself; swallowing the key here would break that.
  if (lower === "s" && isEditorTarget(event.target)) return null;
  return "block";
}

/**
 * Installs the desktop-only browser-behaviour filters: keydown (capture, before any page
 * handler), Ctrl/Cmd+wheel zoom, the native context menu (kept in editable fields, where
 * copy/paste lives) and dragging links or images out of the window.
 */
export function useDesktopShell(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const macos = isMacos();

    const onKeyDown = (event: KeyboardEvent) => {
      const action = desktopKeyAction(event, { macos });
      if (!action) return;
      // Stops the browser default (find bar, print, reload, zoom, history)…
      event.preventDefault();
      // …and the page's own handlers, which would otherwise react twice (Explore's Ctrl+F).
      // Ctrl+S is the exception: the editor listens on window and must still save.
      if (!(action === "block" && event.key.toLowerCase() === "s")) event.stopImmediatePropagation();
      if (action === "search") {
        window.dispatchEvent(new CustomEvent(PALETTE_SEARCH_EVENT, { detail: { mode: "search" } }));
      }
    };

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) event.preventDefault();
    };

    const onContextMenu = (event: MouseEvent) => {
      // Editable fields keep the native menu: cut/copy/paste/spellcheck come from it.
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
    };

    const onDragStart = (event: DragEvent) => {
      const node = asElement(event.target);
      if (node && matches(node, "a, img")) event.preventDefault();
    };

    window.addEventListener("keydown", onKeyDown, true);
    // Non-passive: cancelable wheel events are the only way to stop Ctrl+wheel zoom.
    window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    window.addEventListener("contextmenu", onContextMenu, true);
    window.addEventListener("dragstart", onDragStart, true);

    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("wheel", onWheel, true);
      window.removeEventListener("contextmenu", onContextMenu, true);
      window.removeEventListener("dragstart", onDragStart, true);
    };
  }, [enabled]);
}
