import path from "node:path";
import type { AgentId, McpToolCalls } from "@marcozvd/basics-core";
import { toolDefinitions } from "./mcp/tools.js";

const basicsTools = new Set(toolDefinitions().map((tool) => tool.name));

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** Observations only: missing events and indirect shell reads cannot prove isolation. */
export class AgentObservations {
  private reported = false;
  private invalid = false;
  private readonly ids = new Set<string>();
  private readonly counts: Record<string, number> = {};
  readonly contamination: string[] = [];
  constructor(
    private readonly agent: AgentId,
    private readonly project: string,
    private readonly protectedPaths: string[] = [],
  ) {}

  observe(event: Record<string, unknown>): void {
    if (event.type === "basics.invalid-stream") {
      this.invalid = true;
      return;
    }
    if (this.agent === "claude") {
      const blocks = record(event.message).content;
      if (event.type === "assistant" && Array.isArray(blocks)) {
        this.reported = true;
        for (const block of blocks) this.tool(record(block));
      }
      const partial = record(event.event);
      if (event.type === "stream_event" && partial.type === "content_block_start") {
        this.reported = true;
        this.tool(record(partial.content_block));
      }
    } else if (this.agent === "opencode" && event.type === "tool_use") {
      const part = record(event.part);
      this.reported = true;
      this.tool({ id: part.callID ?? part.id, name: part.tool, input: record(part.state).input });
    } else if (this.agent === "codex" && /^item\.(started|updated|completed)$/.test(String(event.type))) {
      const item = record(event.item);
      this.reported = true;
      if (item.type === "mcp_tool_call" && item.server === "basics") this.count(item.id, item.tool);
      if (item.type === "command_execution") this.scan(item.command, item.cwd);
      if (item.type === "file_read") this.scan(item.path, item.cwd);
    }
  }

  calls(complete = true): McpToolCalls | null {
    return this.reported && !this.invalid && complete
      ? { total: Object.values(this.counts).reduce((sum, n) => sum + n, 0), by_tool: { ...this.counts } }
      : null;
  }

  private count(id: unknown, name: unknown): void {
    if (typeof name === "string" && basicsTools.has(name) && (typeof id !== "string" || !id)) this.invalid = true;
    if (typeof id !== "string" || !id || typeof name !== "string" || !basicsTools.has(name) || this.ids.has(id)) return;
    this.ids.add(id);
    this.counts[name] = (this.counts[name] ?? 0) + 1;
  }

  private tool(block: Record<string, unknown>): void {
    const name = String(block.name ?? "");
    const prefix = this.agent === "claude" ? "mcp__basics__" : "basics_";
    if (name.startsWith(prefix)) this.count(block.id, name.slice(prefix.length));
    if (/^(Read|read|read_file|Bash|bash|shell|shell_command)$/i.test(name)) {
      const input = record(block.input);
      for (const field of ["file_path", "filePath", "path", "file", "command", "cmd"]) this.scan(input[field], input.cwd ?? input.workdir);
    }
  }

  private scan(value: unknown, cwd: unknown): void {
    if (typeof value !== "string") return;
    const working = typeof cwd === "string" ? path.resolve(this.project, cwd) : this.project;
    // Keep quoted paths with spaces and inspect shell arguments separately. Also scan
    // full text for absolute protected paths (redirection and embedded script strings).
    const candidates = [value, ...Array.from(value.matchAll(/"([^"\r\n]+)"|'([^'\r\n]+)'|([^\s"';&|<>]+)/g), (m) => m[1] ?? m[2] ?? m[3])];
    const normalize = (p: string) => {
      const resolved = path.resolve(p).replaceAll("\\", "/").replace(/\/$/, "");
      return process.platform === "win32" ? resolved.toLowerCase() : resolved;
    };
    const project = normalize(this.project);
    const inside = (base: string, candidate: string) => candidate === base || candidate.startsWith(`${base}/`);
    for (const target of this.protectedPaths) {
      const protectedPath = normalize(target);
      if (inside(project, protectedPath)) continue;
      const text = process.platform === "win32" ? value.replaceAll("\\", "/").toLowerCase() : value;
      const externalText = text.replaceAll(project, "<project>");
      const absoluteMention =
        externalText.includes(protectedPath) &&
        new RegExp(`${protectedPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:/|[\\s"';&|<>)]|$)`).test(externalText);
      if (
        absoluteMention ||
        candidates.some((candidate) => {
          const resolved = normalize(path.resolve(working, candidate));
          return !inside(project, resolved) && inside(protectedPath, resolved);
        })
      ) {
        if (!this.contamination.length)
          this.contamination.push("Agent event referenced study or acceptance files outside the project; excluded from analysis.");
      }
    }
  }
}
