#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  configPath,
  configSchema,
  expandHome,
  loadConfig,
  NOTE_TYPES,
  type NoteData,
  type NoteType,
  recommend,
  renderContext,
  resolveVaultDir,
  saveConfig,
  search,
  title,
  Vault,
} from "@marcozvd/basics-core";
import { Command } from "commander";

const program = new Command("basics")
  .description("Personal tech-stack vault shared with coding agents")
  .option("-v, --vault <dir>", 'vault directory (default: $BASICS_DIR, config "vault", or ~/basics-vault)');

const load = () => Vault.load(resolveVaultDir(program.opts().vault));

const config = program.command("config").description("read or change the global basics config");
config
  .command("path")
  .description("print the config file path")
  .action(() => console.log(configPath()));
config
  .command("get")
  .description("print the config and the resolved vault directory")
  .action(() => {
    console.log(JSON.stringify(loadConfig(), null, 2));
    console.log(`vault (resolved): ${resolveVaultDir(program.opts().vault)}`);
  });
config
  .command("set <key> <value>")
  .description("set vault <dir>, language <en|es> or embeddings <true|false>")
  .action((key: string, value: string) => {
    const next: Record<string, unknown> = { ...loadConfig() };
    if (key === "vault") next.vault = path.resolve(expandHome(value));
    else if (key === "language") {
      if (value !== "en" && value !== "es") throw new Error("language must be en or es");
      next.language = value;
    } else if (key === "embeddings") {
      if (value !== "true" && value !== "false") throw new Error("embeddings must be true or false");
      next.embeddings = value === "true";
    } else throw new Error(`unknown config key "${key}" (expected vault, language or embeddings)`);
    const parsed = configSchema.parse(next);
    saveConfig(parsed);
    console.log(JSON.stringify(parsed, null, 2));
  });

program
  .command("list")
  .description("list notes, grouped by layer for tech notes")
  .option("-t, --type <type>", `filter by type (${NOTE_TYPES.join("|")})`)
  .action(({ type }) => {
    const v = load();
    if (!type || type === "tech") {
      for (const layer of v.byType("layer")) {
        console.log(
          `${title(layer)}: ${
            v
              .techInLayer(layer.id)
              .map((t) => t.id)
              .join(", ") || "-"
          }`,
        );
      }
      if (type) return;
    }
    for (const t of NOTE_TYPES.filter((t) => t !== "tech" && (!type || t === type))) {
      console.log(
        `[${t}] ${
          v
            .byType(t)
            .map((n) => n.id)
            .join(", ") || "-"
        }`,
      );
    }
  });

program
  .command("validate")
  .description("check frontmatter schemas, duplicate ids and broken links")
  .action(() => {
    const v = load();
    console.log(`${v.notes.size} notes loaded`);
    for (const i of v.issues) console.log(`  ${path.relative(v.root, i.path)}: ${i.message}`);
    if (v.issues.length) process.exitCode = 1;
  });

program.command("search <query...>").action((query: string[]) => {
  for (const h of search(load(), query.join(" "))) console.log(`${h.score}\t${h.type}\t${h.id}`);
});

program
  .command("recommend <description...>")
  .description("shortlist technologies per layer for a project description")
  .action((desc: string[]) => console.log(JSON.stringify(recommend(load(), desc.join(" ")), null, 2)));

program
  .command("new <type> <id>")
  .description("create a note from a template")
  .option("-l, --layer <layer>", "layer for tech notes", "backend")
  .action((type: NoteType, id: string, { layer }) => {
    if (!NOTE_TYPES.includes(type)) throw new Error(`type must be one of ${NOTE_TYPES.join(", ")}`);
    const v = load();
    if (v.get(id)) throw new Error(`note "${id}" already exists`);
    const templates: Record<NoteType, NoteData> = {
      layer: { type: "layer", tags: [], source: "manual" },
      tech: {
        type: "tech",
        kind: "framework",
        layer,
        tags: [],
        source: "manual",
        use_when: ["TODO"],
        avoid_when: ["TODO"],
        performs_best: ["TODO"],
        related: [],
        practices: [],
        checks: [],
      },
      practice: { type: "practice", applies_to: ["TODO"], tags: [], source: "manual" },
      check: { type: "check", kind: "test", applies_to: ["TODO"], tags: [], source: "manual" },
      profile: { type: "profile", use_when: ["TODO"], stack: {}, tags: [], source: "manual" },
      project: { type: "project", status: "active", stack: {}, lessons: [], tags: [], source: "manual" },
    };
    console.log(v.writeNote(id, { ...templates[type], title: id }, `# ${id}\n\nTODO`));
  });

const inbox = program.command("inbox").description("review agent proposals");
inbox.command("list", { isDefault: true }).action(() => {
  const ps = load().listProposals();
  if (!ps.length) return console.log("inbox empty");
  for (const p of ps) console.log(`${p.id}\t${p.meta.action}\t${p.data.type}\tby ${p.meta.proposed_by}: ${p.meta.reason}`);
});
inbox.command("show <id>").action((id: string) => {
  const p = load()
    .listProposals()
    .find((x) => x.id === id);
  if (!p) throw new Error(`no proposal "${id}"`);
  console.log(fs.readFileSync(p.path, "utf8"));
});
inbox.command("approve <id>").action((id: string) => console.log(`approved -> ${load().approve(id)}`));
inbox.command("reject <id>").action((id: string) => {
  load().reject(id);
  console.log(`rejected ${id}`);
});

program
  .command("init-project <dir>")
  .description("write STACK.md (practices + checks) and an AGENTS.md pointer into a project")
  .requiredOption("-s, --stack <ids>", "comma-separated tech ids, e.g. fastapi,react,playwright")
  .action((dir: string, { stack }) => {
    const v = load();
    const ids = String(stack)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "STACK.md"), `${renderContext(v, ids)}\n`);
    const agents = path.join(dir, "AGENTS.md");
    const pointer =
      `## Stack\n\nThis project uses: ${ids.join(", ")}.\n` +
      `Follow the practices in STACK.md and run its checks before finishing a task.\n` +
      `If the basics MCP server is available, use get_stack_context / propose_note to read or extend the stack knowledge.\n`;
    if (!fs.existsSync(agents)) fs.writeFileSync(agents, `# Agent instructions\n\n${pointer}`);
    else if (!fs.readFileSync(agents, "utf8").includes("STACK.md")) fs.appendFileSync(agents, `\n${pointer}`);
    console.log(`wrote ${path.join(dir, "STACK.md")} and ${agents}`);
  });

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
