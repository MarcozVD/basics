import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { recommend, saveHistoryConfig, Vault } from "@marcozvd/basics-core";
import { test, vi } from "vitest";
import { buildProgram } from "../src/program.js";

test("CLI score breakdown prints positive and negative history, and omits zero history", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-cli-history-"));
  fs.cpSync(path.resolve(import.meta.dirname, "../../core/test/fixtures/history-vault"), root, { recursive: true });
  const config = path.join(root, "cli-config.json");
  fs.writeFileSync(config, JSON.stringify({ embeddings: false }));
  vi.stubEnv("BASICS_CONFIG", config);
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const run = async () => {
    log.mockClear();
    await buildProgram().parseAsync(["--vault", root, "recommend", "service"], { from: "user" });
    return log.mock.calls.map((args) => args.join(" ")).join("\n");
  };
  try {
    const expected = recommend(Vault.load(root), "service").layers.backend;
    const output = await run();
    for (const candidate of expected) {
      assert.ok(candidate.score_breakdown.history);
      const line = output.split("\n").find((value) => value.trimStart().startsWith(`${candidate.id} `));
      assert.ok(line);
      assert.match(line, new RegExp(`\\s${candidate.score}\\s+kw=`));
      assert.ok(line.endsWith(` history=${candidate.score_breakdown.history}`));
    }
    assert.match(output, /history=-\d+/);
    assert.match(output, /history=\d+/);
    saveHistoryConfig(root, { enabled: false });
    assert.doesNotMatch(await run(), /history=/);
  } finally {
    log.mockRestore();
    vi.unstubAllEnvs();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
