import fs from "node:fs";
import path from "node:path";
import { atomicWrite } from "./fsutil.js";

export interface ActivityEvent {
  ts: string;
  agent: string;
  tool: string;
  noteIds: string[];
  detail?: string;
}

const MAX_BYTES = 512 * 1024;
const KEEP_LINES = 1000;
const DEFAULT_LIMIT = 50;
const MAX_DETAIL = 120;

export function activityPath(root: string): string {
  return path.join(root, ".basics", "activity.jsonl");
}

export function appendActivity(root: string, ev: Omit<ActivityEvent, "ts">): void {
  const file = activityPath(root);
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const gitignore = path.join(dir, ".gitignore");
  if (!fs.existsSync(gitignore)) fs.writeFileSync(gitignore, "*\n");

  const event: ActivityEvent = {
    ts: new Date().toISOString(),
    ...ev,
    detail: ev.detail?.slice(0, MAX_DETAIL),
  };
  fs.appendFileSync(file, `${JSON.stringify(event)}\n`);

  if (fs.statSync(file).size > MAX_BYTES) {
    const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
    atomicWrite(file, `${lines.slice(-KEEP_LINES).join("\n")}\n`);
  }
}

export function readActivity(root: string, opts: { limit?: number; noteId?: string; agent?: string } = {}): ActivityEvent[] {
  const file = activityPath(root);
  if (!fs.existsSync(file)) return [];

  const events: ActivityEvent[] = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as Partial<ActivityEvent>;
      if (typeof parsed.ts !== "string" || typeof parsed.agent !== "string" || typeof parsed.tool !== "string") continue;
      if (!Array.isArray(parsed.noteIds)) continue;
      events.push(parsed as ActivityEvent);
    } catch {
      // Ignore malformed lines so a partial write never breaks the feed.
    }
  }

  const filtered = events.filter((ev) => (!opts.noteId || ev.noteIds.includes(opts.noteId)) && (!opts.agent || ev.agent === opts.agent));
  return filtered.reverse().slice(0, opts.limit ?? DEFAULT_LIMIT);
}
