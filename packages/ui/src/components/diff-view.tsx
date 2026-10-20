import { cn } from "cn";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { alignDiff, type DiffLine, type DiffRow } from "@/lib/align-diff";

type Tone = "add" | "remove" | undefined;

const toneClass: Record<Exclude<Tone, undefined>, string> = {
  add: "bg-emerald-500/10 dark:bg-emerald-500/15",
  remove: "bg-red-500/10 dark:bg-red-500/15",
};

const gutterClass: Record<Exclude<Tone, undefined>, string> = {
  add: "text-emerald-600 dark:text-emerald-400",
  remove: "text-red-600 dark:text-red-400",
};

function SideCell({ line, tone }: { line: DiffLine | null; tone: Tone }) {
  return (
    <div
      className={cn(
        "flex min-h-5 gap-2 border-b border-border/40 px-2 py-0.5 leading-5",
        tone ? toneClass[tone] : line ? undefined : "bg-muted/40",
      )}
    >
      <span
        className={cn("w-10 shrink-0 select-none text-right text-[11px] tabular-nums text-muted-foreground", tone && gutterClass[tone])}
      >
        {line?.lineNumber ?? ""}
      </span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{line?.text ?? "\u00a0"}</span>
    </div>
  );
}

export function DiffView({ before, after }: { before: string | null; after: string }) {
  const t = useT();
  const [unified, setUnified] = useState(false);
  const rows = alignDiff(before, after);

  if (before === null) {
    return (
      <div className="flex min-h-0 flex-col overflow-hidden rounded-md border">
        <div className="shrink-0 border-b bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground">{t("diff.newNote")}</div>
        <div className="min-h-0 flex-1 overflow-auto font-mono text-[13px]">
          {rows.map((row) => (
            <UnifiedLine key={`add-${row.right?.lineNumber ?? "empty"}`} line={row.right} mark="+" tone="add" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border">
      <div className="flex shrink-0 items-center justify-end gap-1 border-b bg-muted/20 p-1.5">
        <Button size="xs" variant={unified ? "ghost" : "secondary"} aria-pressed={!unified} onClick={() => setUnified(false)}>
          {t("diff.sideBySide")}
        </Button>
        <Button size="xs" variant={unified ? "secondary" : "ghost"} aria-pressed={unified} onClick={() => setUnified(true)}>
          {t("diff.unified")}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto font-mono text-[13px]">
        {unified ? (
          <UnifiedRows rows={rows} />
        ) : (
          <>
            <div className="sticky top-0 z-10 grid grid-cols-2 border-b bg-background text-xs font-medium text-muted-foreground">
              <div className="border-r px-3 py-1.5">{t("diff.current")}</div>
              <div className="px-3 py-1.5">{t("diff.proposed")}</div>
            </div>
            {rows.map((row) => (
              <div key={`${row.kind}-${row.left?.lineNumber ?? "x"}-${row.right?.lineNumber ?? "x"}`} className="grid grid-cols-2">
                <SideCell line={row.left} tone={row.kind === "remove" || row.kind === "change" ? "remove" : undefined} />
                <SideCell line={row.right} tone={row.kind === "add" || row.kind === "change" ? "add" : undefined} />
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function UnifiedLine({ line, mark, tone }: { line: DiffLine | null; mark: " " | "+" | "-"; tone: Tone }) {
  if (!line) return null;
  return (
    <div className={cn("flex gap-2 border-b border-border/40 px-2 py-0.5 leading-5", tone && toneClass[tone])}>
      <span className={cn("w-3 shrink-0 select-none text-center", tone && gutterClass[tone])}>{mark}</span>
      <span className="w-10 shrink-0 select-none text-right text-[11px] tabular-nums text-muted-foreground">{line.lineNumber}</span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{line.text}</span>
    </div>
  );
}

function UnifiedRows({ rows }: { rows: DiffRow[] }) {
  return (
    <>
      {rows.flatMap((row) => {
        if (row.kind === "equal") {
          return [<UnifiedLine key={`equal-${row.right.lineNumber}`} line={row.right} mark=" " tone={undefined} />];
        }
        if (row.kind === "remove") {
          return [<UnifiedLine key={`remove-${row.left.lineNumber}`} line={row.left} mark="-" tone="remove" />];
        }
        if (row.kind === "add") {
          return [<UnifiedLine key={`add-${row.right.lineNumber}`} line={row.right} mark="+" tone="add" />];
        }
        return [
          <UnifiedLine key={`change-${row.left.lineNumber}-left`} line={row.left} mark="-" tone="remove" />,
          <UnifiedLine key={`change-${row.right.lineNumber}-right`} line={row.right} mark="+" tone="add" />,
        ];
      })}
    </>
  );
}
