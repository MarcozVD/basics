import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared side gutters so the top bar and every page content edge stay aligned.
 * The values live as one token (`--spacing-gutter` in `index.css`): 24px below
 * 768, 32px from 768, 40px from 1024 and 48px from 1440. The top bar uses the
 * same class so both edges line up at every width.
 */
export const PAGE_GUTTERS = "px-page-gutter";

/**
 * Vertical rhythm shared by the routed pages: the page title block and the
 * sections below it sit 32px apart (`--spacing-section`), which reads as one
 * deliberate cadence instead of a stretched web page.
 */
export const PAGE_SECTIONS = "flex flex-col gap-page-section";

interface PageProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/**
 * Full-width page frame. The panel's `<main>` is the scroll container; the wrapper
 * grows to fill it (`flex-1`) and is a column, so a page that fills the panel can
 * use `flex-1 min-h-0` on its own root instead of a viewport calculation.
 */
export function Page({ children, className, ...props }: PageProps) {
  return (
    <div {...props} className={cn("flex w-full min-w-0 flex-1 flex-col pt-4 pb-8", PAGE_GUTTERS, className)}>
      {children}
    </div>
  );
}
