import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { detectStack, installPack, listPacks, Vault } from "../src/index.js";

const PACKS = path.resolve(import.meta.dirname, "../../../packs");
function fixture(files: Record<string, string>, check: (result: ReturnType<typeof detectStack>) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-native-detect-"));
  try {
    const vault = Vault.load(root);
    for (const pack of listPacks(PACKS)) installPack(vault, PACKS, pack.name);
    for (const [file, body] of Object.entries(files)) fs.writeFileSync(path.join(root, file), body);
    check(detectStack(vault, root));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
test("Cargo registry, renamed, dev, workspace and target dependencies use core vault IDs", () => {
  fixture(
    {
      "Cargo.toml": `[package]\nname="demo"\nversion="1.0.0"\n[dependencies]\naxum="0.8"\ndb={package="sqlx",version="0.8"}\nlocal={path="../local"}\n[dev-dependencies]\nwiremock="0.6"\nproptest="1"\n[workspace.dependencies]\nserde="1"\n[target.'cfg(unix)'.dependencies]\ntokio="1"\n`,
    },
    (result) => {
      assert.deepEqual(
        result.techs.map((t) => t.id),
        ["axum", "sqlx", "wiremock-rs", "proptest", "serde", "tokio", "rust"],
      );
      assert.equal(result.techs[0].version, "0.8.0");
      assert.deepEqual(result.unknown, []);
    },
  );
});
test("Go direct module paths and major suffixes map without guessing foreign modules or indirect dependencies", () => {
  fixture(
    {
      "go.mod": `module example.test/app\ngo 1.24\nrequire (\n github.com/labstack/echo/v4 v4.13.0\n github.com/jackc/pgx/v5 v5.7.0\n example.test/gin v1.0.0\n github.com/gin-gonic/gin v1.10.0 // indirect\n)\nrequire github.com/stretchr/testify v1.10.0\n`,
    },
    (result) => {
      assert.deepEqual(
        result.techs.map((t) => t.id),
        ["echo", "pgx", "testify", "go"],
      );
      assert.equal(result.techs[0].version, "4.13.0");
      assert.deepEqual(result.unknown, [{ ecosystem: "go", name: "example.test/gin", version: "1.0.0" }]);
    },
  );
});
test("pubspec maps SDK, registry and dev dependencies while ignoring local and git identities", () => {
  fixture(
    {
      "pubspec.yaml": `name: demo\ndependencies:\n  flutter:\n    sdk: flutter\n  flutter_riverpod: ^2.6.0\n  drift: ^2.0.0\n  local: {path: ../local}\n  private: {git: https://example.test/repo}\ndev_dependencies:\n  flutter_test: {sdk: flutter}\n  integration_test: {sdk: flutter}\n`,
    },
    (result) => {
      assert.deepEqual(
        result.techs.map((t) => t.id),
        ["flutter", "riverpod", "drift", "flutter-test", "flutter-integration-test", "dart"],
      );
      assert.deepEqual(result.unknown, []);
    },
  );
});

test("legacy ORM paths and native database drivers keep client versions off database notes", () => {
  fixture(
    {
      "Cargo.toml": '[dependencies]\npostgres="0.19"\ntokio-postgres="0.7"\n',
      "go.mod": "require github.com/jinzhu/gorm v1.9.16\nrequire gorm.io/driver/sqlite v1.6.0\n",
    },
    (result) => {
      assert.equal(result.techs.find((t) => t.id === "gorm")?.version, "1.9.16");
      assert.equal(result.techs.find((t) => t.id === "postgresql")?.version, undefined);
      assert.equal(result.techs.find((t) => t.id === "sqlite")?.version, undefined);
      assert.equal(result.techs.filter((t) => t.id === "postgresql").length, 1);
    },
  );
});
test("malformed native manifests fail closed without executing project tools", () => {
  fixture(
    { "Cargo.toml": "invalid = [", "pubspec.yaml": "dependencies: [bad", "go.mod": "module local\nrequire not-a-version\n" },
    (result) => {
      assert.deepEqual(result.files, ["Cargo.toml", "go.mod", "pubspec.yaml"]);
      assert.deepEqual(
        result.techs.map((t) => t.id),
        ["go"],
      );
    },
  );
});
