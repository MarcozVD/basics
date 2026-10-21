import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Vault } from "@marcozvd/basics-core";
import { test } from "vitest";
import { createApp } from "../src/server/app.js";

test("packs and approve-all routes", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-api-packs-"));
  const configFile = path.join(root, "config.json");
  fs.writeFileSync(configFile, JSON.stringify({ vault: root, language: "es" }));
  const previousConfig = process.env.BASICS_CONFIG;
  process.env.BASICS_CONFIG = configFile;

  try {
    const app = createApp({ root });
    const request = (url: string, init: RequestInit = {}) =>
      app.request(url, { ...init, headers: { host: "localhost", ...(init.headers as Record<string, string> | undefined) } });

    const list = await request("/api/packs");
    assert.equal(list.status, 200);
    const packs = (await list.json()) as { name: string; installed: string | null }[];
    assert.equal(packs.length, 4);
    assert.ok(packs.every((p) => p.installed === null));

    const installRes = await request("/api/packs/core-layers/install", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(installRes.status, 200);
    const install = (await installRes.json()) as {
      installed: string[];
      byPack: Record<string, { installed: string[]; skipped: string[] }>;
    };
    assert.equal(install.installed.length, 5);
    assert.equal(install.byPack["core-layers"].installed.length, 5);
    assert.match(Vault.load(root).get("backend")?.body ?? "", /lógica de negocio/);

    const installedList = (await (await request("/api/packs")).json()) as { name: string; installed: string | null }[];
    assert.equal(installedList.find((p) => p.name === "core-layers")?.installed, "1.0.0");

    const vault = Vault.load(root);
    const backend = vault.get("backend");
    assert.ok(backend);
    vault.writeNote("backend", backend.data, `${backend.body}\nchanged`);

    const updateRes = await request("/api/packs/core-layers/update", { method: "POST" });
    assert.equal(updateRes.status, 200);
    const update = (await updateRes.json()) as { proposed: string[]; unchanged: string[]; upToDate: boolean };
    assert.deepEqual(update.proposed, []);
    assert.equal(update.unchanged.length, 5);
    assert.equal(update.upToDate, true);
    assert.equal(Vault.load(root).listProposals().length, 0);

    const current = Vault.load(root).get("backend");
    assert.ok(current);
    vault.propose("backend", current.data, `${current.body}\nproposed`, {
      proposed_by: "pack:core-layers@1.0.0",
      reason: "test proposal",
    });

    const approveRes = await request("/api/inbox/approve-all", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: "pack:core-layers" }),
    });
    assert.equal(approveRes.status, 200);
    const approve = (await approveRes.json()) as { approved: string[] };
    assert.deepEqual(approve.approved, ["backend"]);
    assert.equal(Vault.load(root).get("backend")?.data.source, "pack:core-layers@1.0.0");
  } finally {
    if (previousConfig === undefined) delete process.env.BASICS_CONFIG;
    else process.env.BASICS_CONFIG = previousConfig;
  }
});
