import { useEffect } from "react";
import { useNavigate } from "react-router";

/** Routes reachable with the two-key `g` sequences. */
export const SHORTCUT_ROUTES: Record<string, string> = {
  h: "/",
  e: "/explore",
  p: "/projects",
  g: "/graph",
  i: "/inbox",
  r: "/recommend",
};

const SEQUENCE_WINDOW = 1000;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return target.closest(".cm-editor") !== null;
}

/** `g` + key navigation, ignored while typing and with modifiers held. */
export function useGlobalShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    let armedAt = 0;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
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
