import { Copy, Minus, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n";
import { closeWindow, minimizeWindow, toggleMaximizeWindow, watchMaximized } from "@/lib/desktop";
import { cn } from "@/lib/utils";

// 46px wide and the full header tall, flush to the window edge: the hit area of a
// native Windows caption button, so the pointer never has to aim.
const CONTROL =
  "group grid h-full w-[46px] place-items-center text-muted-foreground transition-colors duration-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

/** Minimize, Maximize/Restore and Close for the app's own title bar (desktop only). */
export function WindowControls() {
  const { t } = useI18n();
  const [maximized, setMaximized] = useState(false);

  // Maximize state comes from the window itself: double-clicking the header, snapping
  // and the keyboard all change it without going through these buttons.
  useEffect(() => watchMaximized(setMaximized), []);

  return (
    <div data-testid="window-controls" className="flex h-full items-stretch">
      <button
        type="button"
        aria-label={t("window.minimize")}
        title={t("window.minimize")}
        onClick={() => void minimizeWindow()}
        className={cn(CONTROL, "hover:bg-muted hover:text-foreground")}
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={t(maximized ? "window.restore" : "window.maximize")}
        title={t(maximized ? "window.restore" : "window.maximize")}
        onClick={() => void toggleMaximizeWindow()}
        className={cn(CONTROL, "hover:bg-muted hover:text-foreground")}
      >
        {maximized ? <Copy className="size-3.5 -scale-x-100" aria-hidden="true" /> : <Square className="size-3.5" aria-hidden="true" />}
      </button>
      <button
        type="button"
        aria-label={t("window.close")}
        title={t("window.close")}
        onClick={() => void closeWindow()}
        className={cn(CONTROL, "hover:bg-destructive hover:text-white")}
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
