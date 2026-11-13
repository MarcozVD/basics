import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createTwoFilesPatch } from "diff";
import { Vault } from "../../packages/core/dist/index.js";
import { buildDemoVault, repoRoot } from "./build-vault.mjs";
import { snapshotKey } from "./key.mjs";

const snapshot = JSON.parse(fs.readFileSync(new URL("./generated/snapshot.json", import.meta.url), "utf8"));
const read = async (route) => snapshot[await snapshotKey("GET", route)].body;
const notes = await read("/api/notes");
const byId = new Map(notes.map((note) => [note.id, note]));
const scenarios = JSON.parse(fs.readFileSync(new URL("./scenarios.json", import.meta.url), "utf8"));
const choices = [];
// Keep the existing three landing chips until T4 wires the expanded transcript controls.
for (const scenario of scenarios.slice(0, 3)) {
  const answer = [];
  for (const layer of scenario.layers) {
    const candidate = layer.technologies[0];
    answer.push({
      id: candidate.id,
      title: byId.get(candidate.id).title,
      layer: byId.get(layer.id)?.title ?? layer.id,
      reason: candidate.reason.en,
      reasonLabel: "Simulated",
    });
  }
  choices.push({
    id: scenario.id,
    label: scenario.prompt.en,
    type: scenario.id === "nextjs-saas" ? "profile" : scenario.id === "cli-tool" ? "check" : "tech",
    prompt: `> recommend_stack "${scenario.prompt.en}"`,
    path: `/basics/demo/recommend/?preset=${scenario.id}`,
    answer,
  });
}
const proposal = await read("/api/inbox/cli-error-messages");
choices.push({
  id: "agent-proposal",
  label: "Agent proposes a note",
  type: "project",
  prompt: '> propose_note "cli-error-messages"',
  path: "/basics/demo/inbox/cli-error-messages/",
  answer: [
    {
      id: proposal.id,
      title: proposal.data.title,
      layer: `Proposed by ${proposal.meta.proposed_by}`,
      reason: proposal.meta.reason,
      reasonLabel: "Reason",
    },
  ],
});

const demo = buildDemoVault();
const project = path.join(demo.directory, "sample-app");
const junction = path.join(project, "node_modules");
try {
  const vault = Vault.load(demo.root);
  const cli = path.join(repoRoot, "packages/basics/dist/cli.js");
  const env = { ...demo.env, npm_config_cache: path.join(demo.directory, "npm-cache"), npm_config_offline: "true" };
  const run = (args) =>
    execFileSync(process.execPath, [cli, "--vault", demo.root, ...args], { env, cwd: repoRoot, encoding: "utf8", timeout: 60_000 });
  const exportOutput = run(["export", project, "--stack", "nextjs,typescript,postgresql,playwright", "--targets", "agents,claude,cursor"]);
  const tree = (directory, prefix = "") =>
    fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))
      .flatMap((entry, index, entries) => {
        const last = index === entries.length - 1;
        const line = `${prefix}${last ? "└──" : "├──"} ${entry.name}${entry.isDirectory() ? "/" : ""}`;
        return entry.isDirectory() ? [line, ...tree(path.join(directory, entry.name), `${prefix}${last ? "    " : "│   "}`)] : [line];
      });
  const files = `sample-app/\n${tree(project).join("\n")}`;
  const agents = fs.readFileSync(path.join(project, "AGENTS.md"), "utf8").split("\n").slice(0, 20).join("\n");
  const connect = await read("/api/connect/status");
  const connectOutput = run(["connect", "--print"]);
  // Display the command actually run and its section labels, leaving machine-specific config paths out of the page.
  const connectHeadings = connectOutput
    .split(/\r?\n/)
    .filter((line) => /^(JSON|TOML|HTTP|Command|Stdio|stdio|http)/.test(line))
    .join("\n");
  fs.writeFileSync(path.join(project, "package.json"), JSON.stringify({ private: true, type: "module" }));
  fs.writeFileSync(
    path.join(project, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { target: "ES2022", strict: true, noEmit: true, skipLibCheck: true, types: [] },
      include: ["index.ts"],
    }),
  );
  fs.symlinkSync(path.join(repoRoot, "node_modules"), junction, process.platform === "win32" ? "junction" : "dir");
  const check = () =>
    spawnSync(process.execPath, [cli, "--vault", demo.root, "check", project, "--only", "typescript-typecheck", "--trust", "--verbose"], {
      env,
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 60_000,
    });
  fs.writeFileSync(path.join(project, "index.ts"), "export const message: string = 42;\n");
  const failed = check();
  if (failed.status !== 1 || !failed.stdout.includes("TS2322"))
    throw new Error(`Expected a real TypeScript error: ${failed.stdout}\n${failed.stderr}`);
  fs.writeFileSync(path.join(project, "index.ts"), 'export const message: string = "Ready";\n');
  const passed = check();
  if (passed.status !== 0) throw new Error(`Expected typecheck to pass: ${passed.stdout}\n${passed.stderr}`);
  // biome-ignore lint/suspicious/noControlCharactersInRegex: remove ANSI formatting from captured CLI output.
  const ansiColors = /\u001b\[[0-9;]*m/g;
  const cleanOutput = (text) =>
    text
      .replace(ansiColors, "")
      .replace(/\s+DURATION\b/g, "")
      .replaceAll(project, "./sample-app")
      .replace(/\s+\d+(?:\.\d+)?\s*ms\b/g, "")
      .trim();
  const note = vault.get("nextjs");
  const graph = await read("/api/graph");
  const neighborIds = new Set(
    graph.edges
      .filter((edge) => edge.source === note.id || edge.target === note.id)
      .map((edge) => (edge.source === note.id ? edge.target : edge.source)),
  );
  const neighbors = graph.nodes
    .filter((node) => neighborIds.has(node.id))
    .slice(0, 4)
    .map((node, index) => ({
      ...node,
      x: [200, 320, 200, 80][index],
      y: [40, 140, 240, 140][index],
      labelY: [24, 126, 266, 126][index],
      anchor: ["middle", "end", "middle", "start"][index],
    }));
  const content = {
    choices,
    proposal: {
      id: proposal.id,
      title: proposal.data.title,
      agent: proposal.meta.proposed_by,
      reason: proposal.meta.reason,
      diff: createTwoFilesPatch("/dev/null", "practices/cli-error-messages.md", "", proposal.proposedText, "", "", { context: 3 }),
    },
    exported: {
      command: "basics export ./sample-app --stack nextjs,typescript,postgresql,playwright --targets agents,claude,cursor",
      output: exportOutput.trim(),
      tree: files,
      agents,
    },
    note: { id: note.id, title: note.data.title, markdown: fs.readFileSync(note.path, "utf8"), neighbors },
    connect: {
      command: "basics connect --print",
      output: connectHeadings || connectOutput.split(/\r?\n/).slice(0, 2).join("\n"),
      clients: connect.clients.map((client) => client.client),
    },
    checks: {
      command: "basics check ./sample-app --only typescript-typecheck --trust --verbose",
      failed: cleanOutput(failed.stdout),
      passed: cleanOutput(passed.stdout),
    },
  };
  fs.writeFileSync(new URL("./generated/landing.json", import.meta.url), `${JSON.stringify(content)}\n`);
  console.log(
    `Generated landing artifacts from ${notes.length} recorded notes, ${choices.length} chips, CLI export/connect and real failing/passing typechecks.`,
  );
} finally {
  if (fs.existsSync(junction)) fs.unlinkSync(junction);
  demo.cleanup();
}
