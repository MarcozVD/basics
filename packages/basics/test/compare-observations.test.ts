import assert from "node:assert/strict";
import path from "node:path";
import { test } from "vitest";
import { AgentObservations } from "../src/agent-observations.js";

const project = path.resolve("project");
const study = path.resolve("study");

test("Claude result-only output is unknown; supported empty tools are zero; invalid streams remain unknown", () => {
  const observer = new AgentObservations("claude", project);
  observer.observe({ type: "result", result: "Called get_note twice" });
  assert.equal(observer.calls(), null);
  observer.observe({ type: "assistant", message: { content: [{ type: "text", text: "mcp__basics__get_note" }] } });
  assert.deepEqual(observer.calls(), { total: 0, by_tool: {} });
  observer.observe({ type: "basics.invalid-stream" });
  assert.equal(observer.calls(), null);
});

test("Claude partial and full replay share IDs; unrelated and unknown server tools never count", () => {
  const observer = new AgentObservations("claude", project);
  const block = { type: "tool_use", id: "1", name: "mcp__basics__get_note", input: {} };
  observer.observe({ type: "stream_event", event: { type: "content_block_start", content_block: block } });
  observer.observe({
    type: "assistant",
    message: {
      content: [block, { ...block, id: "2", name: "mcp__other__get_note" }, { ...block, id: "3", name: "mcp__basics__invented_tool" }],
    },
  });
  assert.deepEqual(observer.calls(), { total: 1, by_tool: { get_note: 1 } });
  assert.equal(observer.calls(false), null);
});

test("OpenCode and Codex lifecycle repeats count one failed or attempted call", () => {
  const opencode = new AgentObservations("opencode", project);
  for (const status of ["running", "error", "completed"])
    opencode.observe({ type: "tool_use", part: { type: "tool", callID: "1", tool: "basics_get_note", state: { status } } });
  assert.deepEqual(opencode.calls(), { total: 1, by_tool: { get_note: 1 } });
  const codex = new AgentObservations("codex", project);
  for (const type of ["item.started", "item.updated", "item.completed"])
    codex.observe({ type, item: { id: "1", type: "mcp_tool_call", server: "basics", tool: "search_vault" } });
  codex.observe({ type: "item.completed", item: { id: "2", type: "mcp_tool_call", server: "other", tool: "get_note" } });
  assert.deepEqual(codex.calls(), { total: 1, by_tool: { search_vault: 1 } });
});

test("contamination detects absolute/relative protected reads and shell commands without prefix collisions", () => {
  for (const file of [path.join(study, "hidden.txt"), path.join("..", "study", "hidden.txt")]) {
    const observer = new AgentObservations("claude", project, [study]);
    observer.observe({ type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: file } }] } });
    assert.equal(observer.contamination.length, 1);
  }
  const observer = new AgentObservations("codex", project, [study]);
  observer.observe({ type: "item.completed", item: { type: "command_execution", command: `cat "${study}-other/file"` } });
  assert.equal(observer.contamination.length, 0);
  observer.observe({ type: "item.started", item: { type: "command_execution", command: `cat "${path.join(study, "hidden file")}"` } });
  assert.equal(observer.contamination.length, 1);
});

test("unreported OpenCode streams stay null and ordinary project reads do not contaminate", () => {
  const observer = new AgentObservations("opencode", project, [study]);
  observer.observe({ type: "text", part: { text: "done" } });
  observer.observe({ type: "step_finish", part: { tokens: { input: 2, output: 1 } } });
  assert.equal(observer.calls(), null);
  observer.observe({
    type: "tool_use",
    part: { callID: "read-1", tool: "read", state: { input: { file_path: path.join(project, "file") } } },
  });
  assert.equal(observer.contamination.length, 0);
  assert.deepEqual(observer.calls(), { total: 0, by_tool: {} });
  observer.observe({
    type: "tool_use",
    part: { callID: "read-2", tool: "read", state: { input: { filePath: path.join(study, "hidden") } } },
  });
  assert.equal(observer.contamination.length, 1);
});
