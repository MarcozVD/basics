#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { cancel, intro, isCancel, multiselect, outro, select, text } from "@clack/prompts";
import {
  configPath,
  configSchema,
  expandHome,
  installPack,
  listPacks,
  loadConfig,
  NOTE_TYPES,
  type NoteData,
  type NoteType,
  recommend,
  renderContext,
  resolveVaultDir,
  saveConfig,
  search,
  TYPE_DIRS,
  title,
  Vault,
} from "@marcozvd/basics-core";
import { Command } from "commander";
import { packsDir } from "./packs-dir.js";

const program = new Command("basics")
  .description("Personal tech-stack vault shared with coding agents")
  .option("-v, --vault <dir>", 'vault directory (default: $BASICS_DIR, config "vault", or ~/basics-vault)');

const load = () => Vault.load(resolveVaultDir(program.opts().vault));

function parseLang(value: string | undefined, fallback: "en" | "es"): "en" | "es" {
  if (value === undefined) return fallback;
  if (value !== "en" && value !== "es") throw new Error("language must be en or es");
  return value;
}

function parsePackList(value: string | undefined, available: string[]): string[] {
  if (value === undefined) return available;
  if (value.trim().toLowerCase() === "none") return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function printTable(rows: string[][]): void {
  const widths = rows[0].map((_, i) => Math.max(...rows.map((row) => row[i].length)));
  for (const row of rows) console.log(row.map((cell, i) => (i === row.length - 1 ? cell : cell.padEnd(widths[i]))).join("  "));
}

function cancelInit(): never {
  cancel("Init cancelled");
  process.exit(1);
}

function assertInitTarget(dir: string): void {
  if (!fs.existsSync(dir)) return;
  if (fs.readdirSync(dir).length === 0) return;
  const looksLikeVault = Object.values(TYPE_DIRS).some((typeDir) => fs.existsSync(path.join(dir, typeDir)));
  if (!looksLikeVault) throw new Error(`refusing to init ${dir}: directory is not empty and is not a basics vault`);
}

interface InitOptions {
  lang?: string;
  packs?: string;
  yes?: boolean;
}

async function init(dir: string | undefined, opts: InitOptions): Promise<void> {
  const cfg = loadConfig();
  const interactive = !opts.yes && process.stdin.isTTY === true;
  const available = listPacks(packsDir());
  let vaultDir = dir ? path.resolve(expandHome(dir)) : resolveVaultDir(program.opts().vault);
  let language = parseLang(opts.lang, cfg.language);

  if (interactive) {
    intro("basics init");
    const answer = await text({ message: "Vault directory", initialValue: vaultDir, defaultValue: vaultDir });
    if (isCancel(answer)) return cancelInit();
    vaultDir = path.resolve(expandHome(answer.trim() || vaultDir));
  }
  assertInitTarget(vaultDir);

  if (interactive) {
    const answer = await select<"en" | "es">({
      message: "Vault language",
      options: [
        { value: "en", label: "English" },
        { value: "es", label: "Español" },
      ],
      initialValue: language,
    });
    if (isCancel(answer)) return cancelInit();
    language = answer;
  }

  let selected = parsePackList(
    opts.packs,
    available.map((p) => p.name),
  );
  if (interactive && opts.packs === undefined) {
    const answer = await multiselect<string>({
      message: "Packs to install",
      options: available.map((p) => ({ value: p.name, label: p.name, hint: p.description[language] || p.description.en })),
      initialValues: available.map((p) => p.name),
    });
    if (isCancel(answer)) return cancelInit();
    selected = answer;
  }
  for (const name of selected) {
    if (!available.some((p) => p.name === name)) throw new Error(`unknown pack "${name}"`);
  }

  for (const typeDir of Object.values(TYPE_DIRS)) fs.mkdirSync(path.join(vaultDir, typeDir), { recursive: true });
  fs.mkdirSync(path.join(vaultDir, "inbox"), { recursive: true });

  const vault = Vault.load(vaultDir);
  for (const name of selected) {
    const result = installPack(vault, packsDir(), name, { lang: language });
    console.log(`${name}: ${result.installed.length} installed, ${result.skipped.length} skipped`);
  }

  saveConfig(configSchema.parse({ ...cfg, vault: vaultDir, language }));
  console.log(`Vault: ${vaultDir}`);
  console.log("Next steps:");
  console.log("  basics ui");
  console.log("  claude mcp add --transport http basics http://127.0.0.1:4747/mcp");
  if (interactive) outro("Done");
}

function openBrowser(url: string): void {
  const command = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(command, args, { detached: true, stdio: "ignore" })
      .on("error", () => {})
      .unref();
  } catch {
    // Opening the browser is best effort.
  }
}

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
  .command("init [dir]")
  .description("create a vault and install note packs")
  .option("--lang <lang>", "note language (en|es)")
  .option("--packs <names>", "comma-separated pack names, or none")
  .option("--yes", "accept defaults and install all packs")
  .action((dir: string | undefined, opts: InitOptions) => init(dir, opts));

const pack = program.command("pack").description("manage official note packs");
pack
  .command("list")
  .description("list packs and installed versions")
  .action(() => {
    const cfg = loadConfig();
    const root = resolveVaultDir(program.opts().vault);
    const vault = fs.existsSync(root) ? Vault.load(root) : undefined;
    const packs = listPacks(packsDir(), vault);
    if (!packs.length) return console.log("no packs found");
    printTable([
      ["NAME", "VERSION", "INSTALLED", "NOTES", "DESCRIPTION"],
      ...packs.map((p) => [
        p.name,
        p.version,
        p.installed ?? "—",
        String(p.notes),
        p.description[cfg.language] || p.description.en || Object.values(p.description)[0] || "",
      ]),
    ]);
  });
pack
  .command("install <names...>")
  .description("install packs and their requirements")
  .option("--lang <lang>", "note language (en|es)")
  .action((names: string[], { lang }: { lang?: string }) => {
    const language = parseLang(lang, loadConfig().language);
    const vault = load();
    for (const name of names) {
      const result = installPack(vault, packsDir(), name, { lang: language });
      console.log(`${name}: ${result.installed.length} installed, ${result.skipped.length} skipped`);
    }
  });
pack
  .command("update [name]")
  .description("update installed packs")
  .action(() => {
    console.log("not implemented yet");
    process.exit(1);
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
  .command("ui")
  .description("start the local web UI and HTTP API")
  .option("-p, --port <n>", "port to listen on", "4747")
  .option("--no-open", "do not open the browser")
  .action(async ({ port, open }: { port: string; open: boolean }) => {
    const root = resolveVaultDir(program.opts().vault);
    Vault.load(root);
    const { startServer } = await import("./server/index.js");
    const server = await startServer({ root, port: Number(port) });
    console.log(`Basics UI: ${server.url}  (vault: ${root})`);
    console.log(`MCP over HTTP: ${server.url}/mcp`);
    if (open) openBrowser(server.url);
    const stop = () => {
      void server.close().finally(() => process.exit(0));
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
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
