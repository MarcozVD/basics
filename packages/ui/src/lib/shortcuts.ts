import { useEffect } from "react";
import { useIntentNavigate } from "@/lib/intent-navigate";

/** Routes reachable with the two-key `g` sequences. */
export const SHORTCUT_ROUTES: Record<string, string> = {
  h: "/",
  e: "/explore",
  p: "/projects",
  g: "/graph",
  i: "/inbox",
  r: "/recommend",
  k: "/skills",
};

const SEQUENCE_WINDOW = 1000;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return target.closest(".cm-editor") !== null;
}

/** `g` + key navigation, ignored while typing and with modifiers held, plus the settings chord. */
export function useGlobalShortcuts() {
  const navigate = useIntentNavigate();

  useEffect(() => {
    let armedAt = 0;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      // The platform's settings chord (Cmd+, / Ctrl+,) works even while a field has focus.
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key === ",") {
        event.preventDefault();
        navigate("/settings");
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      const key = event.key.toLowerCase();
      if (Date.now() - armedAt <= SEQUENCE_WINDOW && key in SHORTCUT_ROUTES) {
        event.preventDefault();
        armedAt = 0;
        navigate(SHORTCUT_ROUTES[key]);
        return;
      }
      armedAt = key === "g" ? Date.now() : 0;
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);
}
