const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const mode = process.env.FAKE_COMPARE_MODE;
if (mode === "sleep") {
  setInterval(() => {}, 1000);
} else {
  const initial = fs.readdirSync(process.cwd());
  const withBasics = fs.existsSync("STACK.md");
  fs.writeFileSync("argv.json", JSON.stringify({ args, initial, withBasics, cwd: process.cwd(), home: process.env.HOME }));
  fs.writeFileSync("package.json", JSON.stringify({ dependencies: { react: "19.0.0" } }));
  fs.writeFileSync("verify.cjs", `process.exit(${withBasics ? 0 : 1});\n`);
  if (mode === "check-tree")
    fs.writeFileSync(
      "verify.cjs",
      `const child = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {stdio:'inherit'}); require('node:fs').writeFileSync('check-pid', String(process.pid)); require('node:fs').writeFileSync('child-pid', String(child.pid)); setInterval(() => {}, 1000);`,
    );
  if (mode === "tools") {
    const venv = process.env.FAKE_COMPARE_VENV || ".venv";
    const scripts = path.join(venv, process.platform === "win32" ? "Scripts" : "bin");
    const writeTool = (dir, name) => {
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, name + (process.platform === "win32" ? ".cmd" : ""));
      fs.writeFileSync(file, process.platform === "win32" ? "@echo off\r\nexit /b 0\r\n" : "#!/bin/sh\nexit 0\n");
      if (process.platform !== "win32") fs.chmodSync(file, 0o755);
    };
    for (const name of ["ruff", "mypy", "pytest"]) writeTool(scripts, name);
    writeTool("node_modules/.bin", "local-project-check");
  }
  if (mode === "link")
    fs.symlinkSync(process.env.FAKE_COMPARE_OUTSIDE, path.join(process.cwd(), "escape"), process.platform === "win32" ? "junction" : "dir");
  if (mode === "internal-link") {
    fs.mkdirSync("node_modules/real", { recursive: true });
    fs.writeFileSync("node_modules/real/index.js", "");
    fs.symlinkSync(
      path.resolve("node_modules/real"),
      path.resolve("node_modules/linked"),
      process.platform === "win32" ? "junction" : "dir",
    );
  }
  const emit = (event) => {
    // A large ignored field forces JSON lines across stdout chunks in parser tests.
    if (mode === "mcp-events") event.fixturePadding = "x".repeat(80_000);
    process.stdout.write(`${JSON.stringify(event)}\n`);
  };
  if (mode === "mcp-events" || mode === "contamination") {
    const outside = path.resolve(__dirname, "../study/secret.txt");
    const tool = mode === "contamination" ? "Read" : "mcp__basics__get_note";
    if (args[0] === "-p") {
      const block = {
        type: "tool_use",
        id: "call-1",
        name: tool,
        input: mode === "contamination" ? { file_path: outside } : { id: "react" },
      };
      emit({
        type: "assistant",
        message: {
          model: args.includes("--model") ? args[args.indexOf("--model") + 1] : "fixture-model",
          content: [block, block, { type: "tool_use", id: "other", name: "Read", input: { file_path: "package.json" } }],
        },
      });
    } else if (args[0] === "exec") {
      const item =
        mode === "contamination"
          ? { id: "call-1", type: "command_execution", command: `cat "${outside}"` }
          : { id: "call-1", type: "mcp_tool_call", server: "basics", tool: "get_note", status: "failed" };
      emit({ type: "item.started", item });
      emit({ type: "item.completed", item });
    } else {
      const part = {
        id: "part-1",
        type: "tool",
        callID: "call-1",
        model: {
          providerID: "tokenharbor1",
          modelID: args.includes("-m") ? args[args.indexOf("-m") + 1].split("/").at(-1) : "fixture-model",
        },
        tool: mode === "contamination" ? "read" : "basics_get_note",
        state: { status: "error", input: mode === "contamination" ? { file_path: outside } : { id: "react" } },
      };
      emit({ type: "tool_use", part });
      emit({ type: "tool_use", part });
    }
  }
  if (mode === "grandchild") {
    const childScript = `const child=require('node:child_process').spawn(process.execPath,['-e','setTimeout(()=>{},3000)'],{stdio:'ignore'});require('node:fs').writeFileSync('grandchild-pid',String(child.pid));setTimeout(()=>{},2500);`;
    const child = require("node:child_process").spawn(process.execPath, ["-e", childScript], { stdio: "ignore" });
    fs.writeFileSync("child-pid", String(child.pid));
    setTimeout(() => process.exit(0), 1200);
  }
  if (args[0] === "-p")
    emit({
      type: "result",
      result: "Generated files",
      ...(mode === "no-tokens"
        ? {}
        : {
            usage: {
              input_tokens: 12,
              output_tokens: 5,
              ...(mode === "cache-tokens" ? { cache_read_input_tokens: 100, cache_creation_input_tokens: 20 } : {}),
            },
          }),
    });
  else if (args[0] === "exec") {
    emit({ type: "item.completed", item: { type: "agent_message", text: "Generated files" } });
    for (let i = 0; i < (mode === "cache-tokens" ? 2 : 1); i++)
      emit({
        type: "turn.completed",
        usage: {
          input_tokens: mode === "cache-tokens" ? 112 : mode === "fully-cached" ? 100 : 12,
          output_tokens: 5,
          ...(mode === "cache-tokens" ? { cached_input_tokens: 100, cache_write_input_tokens: 20 } : {}),
          ...(mode === "fully-cached" ? { cached_input_tokens: 100 } : {}),
        },
      });
  } else {
    emit({ type: "text", part: { text: "Generated files" } });
    for (let i = 0; i < (mode === "cache-tokens" ? 2 : 1); i++)
      emit({
        type: "step_finish",
        part: { tokens: { input: 12, output: 5, ...(mode === "cache-tokens" ? { cache: { read: 100, write: 20 } } : {}) } },
      });
  }
  if (mode === "fail-path") console.error(`Could not start "${process.execPath}" from "/private/agent tools/claude"`);
  if (mode === "fail" || mode === "fail-path") process.exitCode = 3;
}
