import { ArrowLeft } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { useNavigationType } from "react-router";
import { Tooltip } from "@/components/motion/tooltip";
import { useT } from "@/i18n";
import { hasNavigated, isBackNavigation } from "@/lib/page-transition";
import { cn } from "@/lib/utils";

/** The back affordance a detail view hands to its header. */
export interface PageBack {
  /** Destination name, e.g. "Explore". */
  label: string;
  go: () => void;
}

interface PageHeaderProps {
  /** The page's `<h1>`. Omitted by a header that only carries a back control. */
  title?: ReactNode;
  /** A count or short status shown beside the title. */
  meta?: ReactNode;
  /** One line under the title. */
  description?: ReactNode;
  /** Help text behind the `?` button. */
  hint?: ReactNode;
  /** The page's single primary action. */
  action?: ReactNode;
  /** Shown only on a detail view; names the destination it returns to. */
  back?: PageBack | null;
  /** A toolbar-sized title for a page that keeps its own sticky bar (the note editor). */
  compact?: boolean;
  className?: string;
  /** Extra controls that frame the header, such as a filter row. */
  children?: ReactNode;
}

/**
 * The one header every routed page wears: an optional back control, the page title,
 * an optional `?` hint and one primary action. Detail views add `back`; top-level
 * pages never do. Keeping it in one place is what makes the shell read as one app.
 */
export function PageHeader({ title, meta, description, hint, action, back, compact, className, children }: PageHeaderProps) {
  const t = useT();
  const navigationType = useNavigationType();
  const titleRef = useRef<HTMLHeadingElement>(null);

  // A back (or a forward) hands focus to the new page's title, so a keyboard user lands on
  // it instead of the link they left. `preventScroll` keeps the offset for the restoration
  // that runs in the same commit; the first load leaves focus where the browser put it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: focus once per mounted page
  useEffect(() => {
    if (!hasNavigated()) return;
    // A pop carries the back in its navigation type; a deep link's fallback to its parent is a
    // replace, so the shell marks that back explicitly (see `markBackNavigation`).
    if (navigationType !== "POP" && !isBackNavigation()) return;
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <header data-page-header className={cn("flex min-w-0 flex-col gap-3", className)}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          {title || meta || hint || back ? (
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
              {back ? (
                <button
                  type="button"
                  onClick={back.go}
                  aria-label={t("nav.back", { page: back.label })}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <ArrowLeft className="size-3.5" aria-hidden="true" />
                  {back.label}
                </button>
              ) : null}

              {title ? (
                <h1
                  ref={titleRef}
                  data-page-title
                  tabIndex={-1}
                  className={cn(
                    "min-w-0 font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring/60",
                    compact ? "truncate text-sm" : "text-xl",
                  )}
                >
                  {title}
                </h1>
              ) : null}
              {meta}
              {hint ? (
                <Tooltip content={hint} side="top">
                  <button
                    type="button"
                    aria-label={t("nav.hint")}
                    className="grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                  >
                    ?
                  </button>
                </Tooltip>
              ) : null}
            </div>
          ) : null}

          {description ? (
            typeof description === "string" ? (
              <p className="mt-1 max-w-[68ch] text-sm text-muted-foreground">{description}</p>
            ) : (
              <div className="mt-1 flex max-w-[68ch] flex-col gap-1 text-sm text-muted-foreground">{description}</div>
            )
          ) : null}
        </div>

        {action ? <div className="flex min-w-0 flex-wrap items-center gap-2">{action}</div> : null}
      </div>

      {children}
    </header>
  );
}
