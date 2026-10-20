import { diffLines } from "diff";

export interface DiffLine {
  lineNumber: number;
  text: string;
}

export type DiffRow =
  | { kind: "equal"; left: DiffLine; right: DiffLine }
  | { kind: "change"; left: DiffLine; right: DiffLine }
  | { kind: "remove"; left: DiffLine; right: null }
  | { kind: "add"; left: null; right: DiffLine };

function splitLines(value: string): string[] {
  if (value === "") return [];
  const trimmed = value.endsWith("\n") ? value.slice(0, -1) : value;
  return trimmed.split("\n");
}

function pushUnchanged(rows: DiffRow[], lines: string[], left: { value: number }, right: { value: number }) {
  for (const text of lines) {
    rows.push({
      kind: "equal",
      left: { lineNumber: ++left.value, text },
      right: { lineNumber: ++right.value, text },
    });
  }
}

export type DiffSegment = { kind: "rows"; rows: DiffRow[] } | { kind: "fold"; count: number; key: number; rows: DiffRow[] };

/**
 * Fold unchanged runs longer than `threshold` lines into one segment.
 * Only equal rows are folded; changed rows always stay visible.
 */
export function foldDiff(rows: DiffRow[], threshold = 6): DiffSegment[] {
  const segments: DiffSegment[] = [];
  let run: DiffRow[] = [];

  const flush = () => {
    if (run.length > threshold) {
      const first = run[0];
      segments.push({ kind: "fold", count: run.length, key: first?.left?.lineNumber ?? first?.right?.lineNumber ?? 0, rows: run });
    } else if (run.length > 0) {
      segments.push({ kind: "rows", rows: run });
    }
    run = [];
  };

  for (const row of rows) {
    if (row.kind === "equal") {
      run.push(row);
      continue;
    }
    flush();
    segments.push({ kind: "rows", rows: [row] });
  }
  flush();

  return segments;
}

export function alignDiff(before: string | null, after: string): DiffRow[] {
  const rows: DiffRow[] = [];
  const changes = diffLines(before ?? "", after);
  const left = { value: 0 };
  const right = { value: 0 };

  for (let index = 0; index < changes.length; index++) {
    const change = changes[index];
    if (!change) continue;

    if (!change.added && !change.removed) {
      pushUnchanged(rows, splitLines(change.value), left, right);
      continue;
    }

    if (change.removed) {
      const removed = splitLines(change.value);
      const next = changes[index + 1];
      if (next?.added) {
        const added = splitLines(next.value);
        const count = Math.max(removed.length, added.length);
        for (let line = 0; line < count; line++) {
          const leftLine = line < removed.length ? { lineNumber: ++left.value, text: removed[line] } : null;
          const rightLine = line < added.length ? { lineNumber: ++right.value, text: added[line] } : null;
          if (leftLine && rightLine) {
            rows.push({ kind: "change", left: leftLine, right: rightLine });
          } else if (leftLine) {
            rows.push({ kind: "remove", left: leftLine, right: null });
          } else if (rightLine) {
            rows.push({ kind: "add", left: null, right: rightLine });
          }
        }
        index++;
      } else {
        for (const text of removed) {
          rows.push({ kind: "remove", left: { lineNumber: ++left.value, text }, right: null });
        }
      }
      continue;
    }

    for (const text of splitLines(change.value)) {
      rows.push({ kind: "add", left: null, right: { lineNumber: ++right.value, text } });
    }
  }

  return rows;
}
