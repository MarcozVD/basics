import { motion, useReducedMotion } from "motion/react";
import type { HTMLAttributes, ReactNode } from "react";
import { EASE_OUT } from "@/lib/ease";
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

const REVEAL_STAGGER_MS = 30;
/** Only the first four blocks stagger; later blocks join the last step instead of trailing. */
const REVEAL_MAX_INDEX = 3;
const REVEAL_MS = 220;
const REVEAL_REDUCED_MS = 100;
const REVEAL_OFFSET = 6;

interface RevealProps {
  children: ReactNode;
  /** Position among the page's top-level blocks. Capped at the fourth. */
  index?: number;
  className?: string;
}

/**
 * Entrance for a page's top-level blocks: 6px up plus opacity, 30ms between
 * blocks, once per route visit. Lists that already animate their own rows should
 * not be wrapped in this — that would play two entrances on the same pixels.
 *
 * Reduced motion keeps the opacity hand-off but drops the offset and the stagger.
 */
export function Reveal({ children, index = 0, className }: RevealProps) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: REVEAL_OFFSET }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: (reduce ? REVEAL_REDUCED_MS : REVEAL_MS) / 1000,
        ease: EASE_OUT,
        delay: reduce ? 0 : Math.min(index, REVEAL_MAX_INDEX) * (REVEAL_STAGGER_MS / 1000),
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
