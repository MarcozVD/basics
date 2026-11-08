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

/** Lines kept around each hunk before an unchanged run collapses. */
export const DIFF_CONTEXT = 3;

/** A top-level YAML key (`use_when:`), the block start a changed line belongs to. */
const FRONTMATTER_KEY = /^[A-Za-z_][A-Za-z0-9_-]*:(\s|$)/;

function lineText(row: DiffRow): string | undefined {
  return row.right?.text ?? row.left?.text;
}

/** Index of the closing `---` of the note frontmatter, or -1 when the diff has none. */
function frontmatterEnd(rows: DiffRow[]): number {
  if (rows[0]?.right?.text !== "---" && rows[0]?.left?.text !== "---") return -1;
  for (let index = 1; index < rows.length; index++) {
    const text = lineText(rows[index]);
    if (text === "---") return index;
  }
  return -1;
}

/**
 * Fold unchanged runs into one expandable segment, keeping `context` lines around
 * every hunk. A changed frontmatter line also keeps the block's key line visible,
 * even when more than `context` unchanged lines separate it from the hunk.
 */
export function foldDiff(rows: DiffRow[], context = DIFF_CONTEXT): DiffSegment[] {
  if (rows.length === 0) return [];

  const visible = rows.map((row) => row.kind !== "equal");

  for (let index = 0; index < rows.length; index++) {
    if (rows[index].kind === "equal") continue;
    for (let offset = 1; offset <= context; offset++) {
      if (index - offset >= 0) visible[index - offset] = true;
      if (index + offset < rows.length) visible[index + offset] = true;
    }
  }

  const end = frontmatterEnd(rows);
  for (let index = 1; index <= end; index++) {
    if (rows[index].kind === "equal") continue;
    for (let keyIndex = index - 1; keyIndex > 0; keyIndex--) {
      if (rows[keyIndex].kind !== "equal") continue;
      const text = lineText(rows[keyIndex]);
      if (text === undefined || !FRONTMATTER_KEY.test(text)) continue;
      visible[keyIndex] = true;
      break;
    }
  }

  const segments: DiffSegment[] = [];
  let hidden: DiffRow[] = [];

  const flush = () => {
    if (hidden.length === 0) return;
    const first = hidden[0];
    segments.push({
      kind: "fold",
      count: hidden.length,
      key: first.left?.lineNumber ?? first.right?.lineNumber ?? 0,
      rows: hidden,
    });
    hidden = [];
  };

  for (let index = 0; index < rows.length; index++) {
    if (!visible[index]) {
      hidden.push(rows[index]);
      continue;
    }
    flush();
    const last = segments[segments.length - 1];
    if (last?.kind === "rows") last.rows.push(rows[index]);
    else segments.push({ kind: "rows", rows: [rows[index]] });
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
