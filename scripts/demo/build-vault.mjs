import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { serializeNote, Vault } from "../../packages/core/dist/index.js";

export const repoRoot = path.resolve(import.meta.dirname, "../..");
export const demoDate = "2026-11-12T12:00:00.000Z";

/** Create only a fresh temp vault. Never resolve the user's configured vault or agent settings. */
export function buildDemoVault() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "basics-demo-"));
  const root = path.join(directory, "vault");
  const home = path.join(directory, "home");
  const config = path.join(directory, "config.json");
  fs.mkdirSync(path.join(home, "AppData", "Roaming"), { recursive: true });
  fs.writeFileSync(config, JSON.stringify({ language: "en", embeddings: false }));
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    APPDATA: path.join(home, "AppData", "Roaming"),
    XDG_CONFIG_HOME: path.join(home, ".config"),
    BASICS_CONFIG: config,
    BASICS_DIR: root,
    BASICS_CACHE: path.join(directory, "cache"),
    BASICS_CONNECT_NODE: "",
    BASICS_CONNECT_SERVER: "",
    BASICS_CONNECT_SKILL: "",
    BASICS_CONNECT_NO_CLI: "1",
  };
  const cleanup = () => fs.rmSync(directory, { recursive: true, force: true });
  try {
    execFileSync(
      process.execPath,
      [
        path.join(repoRoot, "packages/basics/dist/cli.js"),
        "init",
        root,
        "--yes",
        "--lang",
        "en",
        "--packs",
        "core-layers,web-typescript,python-api,profiles",
      ],
      { env, cwd: repoRoot, stdio: "pipe", timeout: 60_000 },
    );
    const vault = Vault.load(root);
    // Normalize installed notes before proposing updates so base_hash matches the recorded note.
    for (const note of vault.notes.values()) {
      fs.writeFileSync(note.path, serializeNote({ ...note.data, updated: demoDate.slice(0, 10) }, note.body));
    }
    vault.reload();
    const proposals = [
      {
        id: "react-components",
        agent: "claude-code",
        reason:
          "The SaaS dashboard needs keyboard access in its reusable form components. Record the review checklist before implementation.",
        addition: "\n- Test reusable forms with Tab, Enter and Escape before shipping the dashboard.",
      },
      {
        id: "sql-migrations",
        agent: "codex",
        reason: "The Python API adds a required column to existing accounts. Document the safe backfill sequence for the deployment.",
        addition: "\n- Add required columns as nullable, backfill existing rows, then enforce the constraint in a separate migration.",
      },
    ];
    const pending = [];
    for (const { id, agent, reason, addition } of proposals) {
      const note = vault.get(id);
      if (!note) throw new Error(`Demo pack note missing: ${id}`);
      pending.push(vault.propose(id, note.data, note.body + addition, { proposed_by: agent, reason }));
    }
    pending.push(
      vault.propose(
        "cli-error-messages",
        {
          type: "practice",
          title: "Actionable CLI errors",
          applies_to: ["typescript"],
        },
        "Return a nonzero exit code when a command fails.\nExplain what failed and show one command that can fix it.\nKeep diagnostics on stderr so stdout stays usable in scripts.\nTest failure paths with [[vitest]] and keep [[typescript]] types strict.",
        {
          proposed_by: "opencode",
          reason: "The CLI tool preset needs predictable failures for shell scripts and useful recovery instructions for people.",
        },
      ),
    );
    // Vault.propose is the same validated core path used by propose_note. Only its clock stamp changes here.
    for (const proposal of pending) {
      fs.writeFileSync(
        proposal.path,
        serializeNote({ ...proposal.data, proposal: { ...proposal.meta, created: demoDate } }, proposal.body),
      );
    }
    fs.writeFileSync(
      path.join(root, ".basics", "activity.jsonl"),
      `${pending
        .map((proposal) =>
          JSON.stringify({
            ts: demoDate,
            agent: proposal.meta.proposed_by,
            tool: "propose_note",
            noteIds: [proposal.id],
            detail: proposal.meta.reason.slice(0, 120),
          }),
        )
        .join("\n")}\n`,
    );
    return { directory, root, env, cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const demo = buildDemoVault();
  console.log(`Demo vault: ${demo.root}\nTemporary directory (remove after inspection): ${demo.directory}`);
}
