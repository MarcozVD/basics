import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Shared side gutters so the top bar and every page content edge stay aligned. */
export const PAGE_GUTTERS = "px-5 md:px-6 min-[1440px]:px-8";

interface PageProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/**
 * Full-width page frame. `<main>` in the layout already reserves the floating
 * Dock's space, so the wrapper only adds the page's own bottom rhythm.
 */
export function Page({ children, className, ...props }: PageProps) {
  return (
    <div {...props} className={cn("w-full min-w-0 pt-4 pb-8", PAGE_GUTTERS, className)}>
      {children}
    </div>
  );
}
