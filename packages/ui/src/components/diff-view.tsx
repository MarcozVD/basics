import { ChevronDown } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { useT } from "@/i18n";
import { alignDiff, type DiffLine, type DiffRow, type DiffSegment, foldDiff } from "@/lib/align-diff";
import { cn } from "@/lib/utils";

type Tone = "add" | "remove" | undefined;

const toneClass: Record<Exclude<Tone, undefined>, string> = {
  add: "bg-emerald-500/10 dark:bg-emerald-400/10",
  remove: "bg-red-500/10 dark:bg-red-400/10",
};

const gutterClass: Record<Exclude<Tone, undefined>, string> = {
  add: "text-emerald-700 dark:text-emerald-300",
  remove: "text-red-700 dark:text-red-300",
};

function SideCell({ line, tone }: { line: DiffLine | null; tone: Tone }) {
  return (
    <div
      className={cn(
        "flex min-h-5 gap-2 border-b border-border/40 px-2 py-0.5 font-mono text-[12.5px] leading-5",
        tone ? toneClass[tone] : line ? undefined : "bg-muted/30",
      )}
    >
      <span className={cn("w-9 shrink-0 select-none text-right text-[11px] tabular-nums text-muted-foreground", tone && gutterClass[tone])}>
        {line?.lineNumber ?? ""}
      </span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{line?.text ?? "\u00a0"}</span>
    </div>
  );
}

function UnifiedLine({ line, mark, tone }: { line: DiffLine | null; mark: " " | "+" | "−"; tone: Tone }) {
  return (
    <div
      className={cn("flex min-h-5 gap-2 border-b border-border/40 px-2 py-0.5 font-mono text-[12.5px] leading-5", tone && toneClass[tone])}
    >
      <span className={cn("w-3 shrink-0 select-none text-center", tone && gutterClass[tone])}>{mark}</span>
      <span className="w-9 shrink-0 select-none text-right text-[11px] tabular-nums text-muted-foreground">{line?.lineNumber ?? ""}</span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{line?.text ?? "\u00a0"}</span>
    </div>
  );
}

function FoldButton({ count, expanded, onToggle }: { count: number; expanded: boolean; onToggle: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="flex w-full items-center justify-center gap-1.5 border-y border-border/50 bg-muted/30 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
    >
      <motion.span animate={{ rotate: expanded ? 180 : 0 }} aria-hidden="true">
        <ChevronDown className="size-3" />
      </motion.span>
      {t("diff.unchanged", { count })}
    </button>
  );
}

function SplitRows({
  segments,
  expanded,
  onToggle,
}: {
  segments: DiffSegment[];
  expanded: ReadonlySet<number>;
  onToggle: (key: number) => void;
}) {
  return (
    <>
      {segments.flatMap((segment) => {
        if (segment.kind === "fold") {
          if (!expanded.has(segment.key)) {
            return [
              <div key={`fold-${segment.key}`} className="col-span-2">
                <FoldButton count={segment.count} expanded={false} onToggle={() => onToggle(segment.key)} />
              </div>,
            ];
          }
          return segment.rows.map((row) => (
            <SplitRow key={`fold-${segment.key}-${row.left?.lineNumber ?? row.right?.lineNumber ?? "x"}`} row={row} />
          ));
        }
        return segment.rows.map((row) => (
          <SplitRow key={`${row.kind}-${row.left?.lineNumber ?? "x"}-${row.right?.lineNumber ?? "x"}`} row={row} />
        ));
      })}
    </>
  );
}

function SplitRow({ row }: { row: DiffRow }) {
  const leftTone: Tone = row.kind === "remove" || row.kind === "change" ? "remove" : undefined;
  const rightTone: Tone = row.kind === "add" || row.kind === "change" ? "add" : undefined;
  return (
    <div className="grid grid-cols-2 border-b border-border/30 last:border-b-0">
      <div className="border-r border-border/40">
        <SideCell line={row.left} tone={leftTone} />
      </div>
      <SideCell line={row.right} tone={rightTone} />
    </div>
  );
}

function UnifiedRows({
  segments,
  expanded,
  onToggle,
}: {
  segments: DiffSegment[];
  expanded: ReadonlySet<number>;
  onToggle: (key: number) => void;
}) {
  return (
    <>
      {segments.flatMap((segment) => {
        if (segment.kind === "fold") {
          if (!expanded.has(segment.key)) {
            return [
              <div key={`fold-${segment.key}`}>
                <FoldButton count={segment.count} expanded={false} onToggle={() => onToggle(segment.key)} />
              </div>,
            ];
          }
          return segment.rows.map((row) => (
            <UnifiedLine
              key={`fold-${segment.key}-${row.right?.lineNumber ?? row.left?.lineNumber ?? "x"}`}
              line={row.right}
              mark=" "
              tone={undefined}
            />
          ));
        }
        return segment.rows.flatMap((row) => {
          if (row.kind === "equal") {
            return [<UnifiedLine key={`equal-${row.right.lineNumber}`} line={row.right} mark=" " tone={undefined} />];
          }
          if (row.kind === "remove") {
            return [<UnifiedLine key={`remove-${row.left.lineNumber}`} line={row.left} mark="−" tone="remove" />];
          }
          if (row.kind === "add") {
            return [<UnifiedLine key={`add-${row.right.lineNumber}`} line={row.right} mark="+" tone="add" />];
          }
          return [
            <UnifiedLine key={`change-${row.left.lineNumber}-left`} line={row.left} mark="−" tone="remove" />,
            <UnifiedLine key={`change-${row.right.lineNumber}-right`} line={row.right} mark="+" tone="add" />,
          ];
        });
      })}
    </>
  );
}

export function DiffView({ before, after, file }: { before: string | null; after: string; file?: string }) {
  const t = useT();
  const [unified, setUnified] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  const rows = useMemo(() => alignDiff(before, after), [before, after]);
  const segments = useMemo(() => foldDiff(rows), [rows]);
  const additions = rows.filter((row) => row.kind === "add" || row.kind === "change").length;
  const deletions = rows.filter((row) => row.kind === "remove" || row.kind === "change").length;

  const toggle = (key: number) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-muted/25 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-mono text-[11px] text-muted-foreground">{file ?? t("diff.proposed")}</span>
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-emerald-700 dark:text-emerald-300">+{additions}</span>
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-red-700 dark:text-red-300">−{deletions}</span>
        </div>
        <Tabs value={unified ? "unified" : "split"} onValueChange={(value) => setUnified(value === "unified")} variant="segment">
          <TabsList>
            <TabsTrigger value="split" className="px-2.5 py-1 text-[11px]">
              {t("diff.sideBySide")}
            </TabsTrigger>
            <TabsTrigger value="unified" className="px-2.5 py-1 text-[11px]">
              {t("diff.unified")}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <section aria-label={t("diff.proposed")} className="min-h-0 flex-1 overflow-auto font-mono text-[12.5px]">
        {unified ? (
          <UnifiedRows segments={segments} expanded={expanded} onToggle={toggle} />
        ) : (
          <>
            <div className="sticky top-0 z-10 grid grid-cols-2 border-b border-border bg-muted/40 text-[11px] font-medium text-muted-foreground">
              <div className="border-r border-border/60 px-3 py-1.5">{t("diff.current")}</div>
              <div className="px-3 py-1.5">{t("diff.proposed")}</div>
            </div>
            <SplitRows segments={segments} expanded={expanded} onToggle={toggle} />
          </>
        )}
      </section>
    </div>
  );
}
