import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { buildGraph, type GraphData, type NoteData, Vault } from "../src/index.js";

function tempVault(): Vault {
  return Vault.load(fs.mkdtempSync(path.join(os.tmpdir(), "basics-graph-")));
}

const techData = (layer: string | string[]): NoteData => ({
  type: "tech",
  kind: "framework",
  layer,
  use_when: [],
  avoid_when: [],
  performs_best: [],
  related: [],
  practices: [],
  checks: [],
  tags: [],
  source: "manual",
});

const layerData: NoteData = { type: "layer", tags: [], source: "manual" };

const practiceData = (applies_to: string[]): NoteData => ({
  type: "practice",
  applies_to,
  tags: [],
  source: "manual",
});

/** Two layers, two techs (one per layer, one spanning both) and a practice across layers. */
function layeredVault(): Vault {
  const vault = tempVault();
  vault.writeNote("backend", layerData, "");
  vault.writeNote("data", layerData, "");
  vault.writeNote("dual", techData(["backend", "data"]), "");
  vault.writeNote("postgresql", techData("data"), "");
  vault.writeNote("cross", practiceData(["dual", "postgresql"]), "");
  vault.writeNote("same", practiceData(["postgresql"]), "");
  vault.writeNote("project", { type: "project", stack: {}, lessons: [], status: "active", tags: [], source: "manual" }, "");
  return vault;
}

function group(data: GraphData, id: string): string | undefined {
  return data.nodes.find((node) => node.id === id)?.group;
}

test("tech with two layers gets its first layer as group", () => {
  const data = buildGraph(layeredVault());
  assert.equal(group(data, "dual"), "backend");
  assert.equal(group(data, "postgresql"), "data");
});

test("practice applying to techs in two layers has no group", () => {
  const data = buildGraph(layeredVault());
  assert.equal(group(data, "cross"), undefined);
});

test("practice applying to techs in one layer inherits that layer", () => {
  const data = buildGraph(layeredVault());
  assert.equal(group(data, "same"), "data");
});

test("layers and projects stay outside the boxes", () => {
  const data = buildGraph(layeredVault());
  assert.equal(group(data, "backend"), undefined);
  assert.equal(group(data, "data"), undefined);
  assert.equal(group(data, "project"), undefined);
});
