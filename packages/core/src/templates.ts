import path from "node:path";
import { stackContext } from "./query.js";
import type { Note } from "./schema.js";
import type { Vault } from "./vault.js";

export interface CheckTemplate {
  check: string;
  file: string;
  lang: string;
  content: string;
}

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})\s*$/;
const FILE_ATTR = /(?:^|\s)file=(?:"([^"]+)"|'([^']+)'|([^\s{}]+))/;

/** Info string is free-form: `lang`, `file=<path>` and anything else can come in any order. */
function infoAttrs(info: string): { lang: string; file?: string } {
  const match = FILE_ATTR.exec(info.trim());
  const file = match ? (match[1] ?? match[2] ?? match[3]) : undefined;
  const lang =
    info
      .trim()
      .split(/\s+/)
      .map((token) => token.replace(/^\{|\}$/g, ""))
      .find((token) => token && !token.includes("=")) ?? "";
  return { file, lang };
}

/** Relative, forward slashes, no `..` and not absolute; anything else is not a safe project path. */
function safeFile(file: string): string | undefined {
  const value = file.trim();
  if (!value || value === "." || value.startsWith("~") || value.includes("\\")) return undefined;
  if (path.posix.isAbsolute(value) || /^[A-Za-z]:/.test(value)) return undefined;
  if (value.split("/").some((segment) => segment === "" || segment === "..")) return undefined;
  return value;
}

/** Fenced blocks whose info string carries `file=<path>`, in body order. */
export function checkTemplates(note: Note): CheckTemplate[] {
  const lines = note.body.split(/\r?\n/);
  const templates: CheckTemplate[] = [];
  for (let start = 0; start < lines.length; start++) {
    const open = FENCE_OPEN.exec(lines[start]);
    if (!open) continue;
    const marker = open[1][0];
    const info = open[2];
    if (marker === "`" && info.includes("`")) continue;
    let end = start + 1;
    while (end < lines.length) {
      const close = FENCE_CLOSE.exec(lines[end]);
      if (close && close[1][0] === marker && close[1].length >= open[1].length) break;
      end++;
    }
    if (end >= lines.length) break;
    const { file, lang } = infoAttrs(info);
    const safe = file === undefined ? undefined : safeFile(file);
    if (safe) templates.push({ check: note.id, file: safe, lang, content: lines.slice(start + 1, end).join("\n") });
    start = end;
  }
  return templates;
}

/** Templates from every check in the stack context; duplicate file paths keep the first check's version. */
export function stackTemplates(vault: Vault, techIds: string[], opts: { versions?: Record<string, string> } = {}): CheckTemplate[] {
  const seen = new Set<string>();
  const templates: CheckTemplate[] = [];
  for (const check of stackContext(vault, techIds, opts).checks) {
    for (const template of checkTemplates(check)) {
      if (seen.has(template.file)) continue;
      seen.add(template.file);
      templates.push(template);
    }
  }
  return templates;
}
