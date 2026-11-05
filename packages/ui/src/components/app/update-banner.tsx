import { ChevronDown, Download } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";
import { Button } from "@/components/motion/button/base";
import { useT } from "@/i18n";
import { isDesktop } from "@/lib/desktop";
import { EASE_OUT } from "@/lib/ease";
import { useResolvedDockEdge } from "@/lib/navigation";
import { dismissUpdate, installUpdate, useUpdateState } from "@/lib/updater";
import { cn } from "@/lib/utils";

/**
 * The update notice: one small card in the top-right corner, never modal.
 *
 * It appears when a check found a newer release, shows real download progress, explains a
 * failure in plain words with "Try again", and "Later" hides it until the app is started
 * again (the version is remembered in `sessionStorage`). A browser never renders it.
 */
export function UpdateBanner() {
  const t = useT();
  const reduce = useReducedMotion();
  const desktop = useMemo(() => isDesktop(), []);
  const dockEdge = useResolvedDockEdge();
  const update = useUpdateState();
  const [notesOpen, setNotesOpen] = useState(false);
  const info = update.update;

  const percent = update.total && update.total > 0 ? Math.min(100, Math.round((update.downloaded / update.total) * 100)) : null;
  const downloading = update.phase === "downloading";
  const installing = update.phase === "installing";
  // Keep clear of the navigation bar: top edge sits below it, right edge moves it left.
  const positionClass = dockEdge === "top" ? "top-[126px] right-4" : dockEdge === "right" ? "top-16 left-4" : "top-16 right-4";

  return (
    <AnimatePresence>
      {desktop && info && !update.dismissed ? (
        <motion.section
          key={`update-${info.version}`}
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: reduce ? 0 : -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduce ? 0 : -8 }}
          transition={{ duration: 0.18, ease: EASE_OUT }}
          className={cn(
            "fixed z-40 w-[min(400px,calc(100vw-2rem))] rounded-2xl border border-border bg-card p-4 shadow-[0_12px_36px_rgba(0,0,0,0.28)]",
            positionClass,
          )}
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary-text">
              <Download className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t("updates.available", { version: info.version })}</p>
              {info.date ? <p className="mt-0.5 text-[11px] text-muted-foreground">{t("updates.released", { date: info.date })}</p> : null}
            </div>
          </div>

          {info.notes ? (
            <div className="mt-2">
              <button
                type="button"
                aria-expanded={notesOpen}
                onClick={() => setNotesOpen((open) => !open)}
                className="inline-flex items-center gap-1 rounded-full text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {t("updates.whatsNew")}
                <ChevronDown className={cn("size-3.5 transition-transform", notesOpen && "rotate-180")} aria-hidden="true" />
              </button>
              <AnimatePresence initial={false}>
                {notesOpen ? (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.16, ease: EASE_OUT }}
                    className="overflow-hidden"
                  >
                    <p className="mt-2 max-h-40 overflow-y-auto rounded-xl bg-muted/40 px-3 py-2 text-xs whitespace-pre-line text-muted-foreground">
                      {info.notes}
                    </p>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          ) : null}

          {update.error ? (
            <p role="alert" className="mt-3 text-xs text-destructive">
              {update.error}
            </p>
          ) : null}

          {installing ? (
            <p className="mt-3 text-xs text-muted-foreground">{t("updates.installing")}</p>
          ) : downloading ? (
            <div className="mt-3 flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                {percent === null ? t("updates.downloadingUnknown") : t("updates.downloading", { percent })}
              </p>
              {percent !== null ? (
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percent}
                  className="h-1.5 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-2">
              <Button size="sm" onClick={() => void installUpdate()}>
                {update.error ? t("updates.retry") : t("updates.update")}
              </Button>
              <Button variant="ghost" size="sm" onClick={dismissUpdate}>
                {t("updates.later")}
              </Button>
            </div>
          )}
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}
