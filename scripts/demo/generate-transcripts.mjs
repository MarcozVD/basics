/**
 * Generated scripts/demo/transcripts.json format (tracked; regenerate, do not edit):
 * { version: 1, entries: [{ id, kind, label: { en, es }, command: { en, es },
 *   answerLines: { en: string[], es: string[] }, path: string | null, simulated }] }
 * Commands exclude the visual `>` prompt. Each answer string is one display line.
 * Order: scenarios.json order, agent-proposal, basics-connect, basics-check.
 * Scenario reasons are handwritten simulations; names/practices/checks come from the
 * generated public-packs vault. Proposal content is that vault's actual inbox data.
 * Connect lists the real supported clients/snippet formats, not registration results.
 * Check lines are actual `--list` stdout, not executed checks or invented pass/fail.
 * No clocks, durations, absolute paths, detected-client state or platform shell syntax
 * enter the output. LF + two-space JSON formatting is the canonical byte representation.
 * VitePress imports through site/.vitepress/theme/landing/transcripts.ts.
 * Requires the built CLI/core; docs:prepare and demo:build build them first.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CONNECT_CLIENTS, connectSnippets } from "../../packages/basics/dist/connect.js";
import { Vault } from "../../packages/core/dist/index.js";
import { buildDemoVault, repoRoot } from "./build-vault.mjs";

const output = new URL("./transcripts.json", import.meta.url);
const localized = (en, es = en) => ({ en, es });
export const serializeTranscripts = (value) => `${JSON.stringify(value, null, 2)}\n`;

/** Rebuild from a fresh isolated demo vault, never from ignored build artifacts or user config. */
export function generateTranscripts() {
  const scenarios = JSON.parse(fs.readFileSync(new URL("./scenarios.json", import.meta.url), "utf8"));
  const demo = buildDemoVault();
  try {
    const vault = Vault.load(demo.root);
    const requireNote = (id, type) => {
      const note = vault.get(id);
      if (!note || note.data.type !== type) throw new Error(`Transcript source requires ${type} note: ${id}`);
      return note;
    };
    const names = (ids, type) => ids.map((id) => requireNote(id, type).data.title || id).join(", ");
    const entries = scenarios.map((scenario) => {
      const answerLines = { en: [], es: [] };
      for (const language of ["en", "es"]) {
        for (const layer of scenario.layers) {
          const title = requireNote(layer.id, "layer").data.title || layer.id;
          for (const tech of layer.technologies) {
            const note = requireNote(tech.id, "tech");
            answerLines[language].push(`${title}: ${note.data.title || tech.id} - ${tech.reason[language]}`);
          }
        }
        answerLines[language].push(`${language === "en" ? "Practices" : "Prácticas"}: ${names(scenario.practices, "practice")}`);
        answerLines[language].push(`Checks: ${names(scenario.checks, "check")}`);
      }
      return {
        id: scenario.id,
        kind: "scenario",
        label: scenario.prompt,
        command: localized(
          `recommend_stack ${JSON.stringify(scenario.prompt.en)}`,
          `recommend_stack ${JSON.stringify(scenario.prompt.es)}`,
        ),
        answerLines,
        path: `/basics/demo/embed/recommend/?scenario=${encodeURIComponent(scenario.id)}`,
        simulated: true,
      };
    });
    const proposal = vault.getProposal("cli-error-messages");
    if (!proposal) throw new Error("Transcript source requires cli-error-messages proposal");
    entries.push({
      id: "agent-proposal",
      kind: "proposal",
      label: localized("Agent proposes a note", "El agente propone una nota"),
      command: localized(`propose_note ${JSON.stringify(proposal.id)}`),
      answerLines: localized(
        [
          `${proposal.data.title || proposal.id} (${proposal.id})`,
          `Proposed by: ${proposal.meta.proposed_by}`,
          `Reason: ${proposal.meta.reason}`,
          "Pending your approval in the Inbox.",
        ],
        [
          `${proposal.data.title || proposal.id} (${proposal.id})`,
          `Propuesto por: ${proposal.meta.proposed_by}`,
          `Motivo: ${proposal.meta.reason}`,
          "Pendiente de tu aprobación en la bandeja.",
        ],
      ),
      path: `/basics/demo/embed/proposal/?id=${encodeURIComponent(proposal.id)}`,
      simulated: false,
    });
    // Only the format names are used; snippets' machine-dependent paths/quoting stay out.
    const formats = Object.keys(connectSnippets(demo.root)).join(", ");
    entries.push({
      id: "basics-connect",
      kind: "connect",
      label: localized("Connect your agent", "Conecta tu agente"),
      command: localized("basics connect --print"),
      answerLines: localized(
        [`Supported clients: ${CONNECT_CLIENTS.join(", ")}`, `Snippet formats: ${formats}`],
        [`Clientes compatibles: ${CONNECT_CLIENTS.join(", ")}`, `Formatos de configuración: ${formats}`],
      ),
      path: null,
      simulated: false,
    });
    const project = path.join(demo.directory, "sample-app");
    const run = (args) =>
      execFileSync(process.execPath, [path.join(repoRoot, "packages/basics/dist/cli.js"), "--vault", demo.root, ...args], {
        env: { ...demo.env, NO_COLOR: "1", FORCE_COLOR: "0" },
        cwd: repoRoot,
        encoding: "utf8",
        timeout: 60_000,
      });
    run(["export", project, "--stack", "typescript", "--targets", "agents"]);
    const checkLines = run(["check", project, "--only", "typescript-typecheck", "--list"])
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trimEnd());
    if (!checkLines.some((line) => line.includes(requireNote("typescript-typecheck", "check").data.command)))
      throw new Error("Check transcript is missing the vault's typecheck command");
    entries.push({
      id: "basics-check",
      kind: "check",
      label: localized("List your stack checks", "Lista los checks de tu stack"),
      command: localized("basics check ./sample-app --only typescript-typecheck --list"),
      answerLines: localized(checkLines, [...checkLines]),
      path: null,
      simulated: false,
    });
    return { version: 1, entries };
  } finally {
    demo.cleanup();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const transcripts = generateTranscripts();
  fs.writeFileSync(output, serializeTranscripts(transcripts));
  console.log(`Generated ${transcripts.entries.length} transcripts from scenarios and the isolated public-packs vault.`);
}
