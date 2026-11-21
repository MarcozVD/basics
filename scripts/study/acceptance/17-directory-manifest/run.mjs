import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCases } from "./harness.mjs";

const fixture = (build) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-manifest-")),
    links = [];
  const put = (relative, content = "") => {
    const file = path.join(root, ...relative.split("/"));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };
  const dir = (relative) => fs.mkdirSync(path.join(root, ...relative.split("/")), { recursive: true });
  const link = (target, relative, type) => {
    const file = path.join(root, ...relative.split("/"));
    try {
      fs.symlinkSync(target, file, type);
    } catch {
      throw Object.assign(new Error("links unavailable"), { skip: true });
    }
    links.push(file);
  };
  const cleanup = () => {
    for (const file of links) fs.unlinkSync(file);
    fs.rmSync(root, { recursive: true, force: true });
  };
  try {
    build({ put, dir, link, root });
  } catch (error) {
    cleanup();
    throw error;
  }
  return { root, cleanup };
};
const snapshot = (root) => {
  const names = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = path.join(directory, entry.name);
      names.push(`${path.relative(root, full)}:${entry.isDirectory() ? "d" : fs.readFileSync(full).toString("base64")}`);
      if (entry.isDirectory()) visit(full);
    }
  };
  visit(root);
  return names;
};
const list = async (cli, root, exclude = []) => {
  const result = await cli(JSON.stringify({ root, exclude }));
  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stdout.endsWith("\n"));
  return JSON.parse(result.stdout).files;
};
const withTree = async (build, check) => {
  const tree = fixture(build);
  try {
    await check(tree.root);
  } finally {
    tree.cleanup();
  }
};
await runCases("cli", [
  [
    "nested files, sizes and plain code-unit ordering",
    ({ cli }) =>
      withTree(
        ({ put, dir }) => {
          put("b.txt", "bb");
          put("a/x.txt", "x");
          put("a-b/x.txt", "xyz");
          put("A.txt", "");
          put("sp ace/é ü.txt", "1234");
          put("z/deep/er/file.bin", Buffer.alloc(256, 7));
          dir("empty/inner");
        },
        async (root) => {
          const files = await list(cli, root);
          assert.deepEqual(files, [
            { path: "A.txt", size: 0 },
            { path: "a-b/x.txt", size: 3 },
            { path: "a/x.txt", size: 1 },
            { path: "b.txt", size: 2 },
            { path: "sp ace/é ü.txt", size: 4 },
            { path: "z/deep/er/file.bin", size: 256 },
          ]);
        },
      ),
  ],
  [
    "sizes are bytes, not characters",
    ({ cli }) =>
      withTree(
        ({ put }) => {
          put("u.txt", "é😀");
          put("b.bin", Buffer.from([0, 255, 128, 0, 10, 13]));
        },
        async (root) => {
          assert.deepEqual(await list(cli, root), [
            { path: "b.bin", size: 6 },
            { path: "u.txt", size: 6 },
          ]);
        },
      ),
  ],
  [
    "name patterns match whole names at any depth",
    ({ cli }) =>
      withTree(
        ({ put }) => {
          put("keep.txt", "k");
          put("logs/a.txt", "1");
          put("log/b.txt", "1");
          put("src/log", "file named log");
          put("src/mylog.txt", "1");
          put("src/sub/log/deep.txt", "1");
          put("a/node_modules/x/y.js", "1");
          put("node_modules/z.js", "1");
        },
        async (root) => {
          const files = await list(cli, root, ["log", "node_modules"]);
          assert.deepEqual(
            files.map((file) => file.path),
            ["keep.txt", "logs/a.txt", "src/mylog.txt"],
          );
        },
      ),
  ],
  [
    "path patterns are anchored at the root",
    ({ cli }) =>
      withTree(
        ({ put }) => {
          put("a/b/c.txt", "1");
          put("a/b.txt", "1");
          put("a/bb/d.txt", "1");
          put("x/a/b/e.txt", "1");
          put("a/keep.txt", "1");
        },
        async (root) => {
          const files = await list(cli, root, ["a/b"]);
          assert.deepEqual(
            files.map((file) => file.path),
            ["a/b.txt", "a/bb/d.txt", "a/keep.txt", "x/a/b/e.txt"],
          );
          const exact = await list(cli, root, ["a/keep.txt", "x/a"]);
          assert.deepEqual(
            exact.map((file) => file.path),
            ["a/b.txt", "a/b/c.txt", "a/bb/d.txt"],
          );
        },
      ),
  ],
  [
    "symbolic links are never listed or followed",
    ({ cli }) =>
      withTree(
        ({ put, link, root }) => {
          put("real/inside.txt", "abc");
          put("top.txt", "1");
          link(path.join(root, "top.txt"), "file-link", "file");
          link(path.join(root, "real"), "dir-link", "dir");
          link(path.join(root, "missing-target"), "dangling", "file");
        },
        async (root) => {
          const files = await list(cli, root);
          assert.deepEqual(
            files.map((file) => file.path),
            ["real/inside.txt", "top.txt"],
          );
        },
      ),
  ],
  [
    "links to outside directories are not traversed",
    ({ cli }) =>
      withTree(
        ({ put, link }) => {
          const outside = fs.mkdtempSync(path.join(os.tmpdir(), "basics-manifest-outside-"));
          fs.writeFileSync(path.join(outside, "secret.txt"), "secret");
          try {
            link(outside, "out", "dir");
          } catch (error) {
            fs.rmSync(outside, { recursive: true, force: true });
            throw error;
          }
          put("in.txt", "1");
          fixture.outside = outside;
        },
        async (root) => {
          try {
            assert.deepEqual(await list(cli, root), [{ path: "in.txt", size: 1 }]);
          } finally {
            fs.rmSync(fixture.outside, { recursive: true, force: true });
          }
        },
      ),
  ],
  [
    "the tree is not modified and an empty root is valid",
    ({ cli }) =>
      withTree(
        ({ put }) => {
          put("a/one.txt", "1");
          put("two.txt", "22");
        },
        async (root) => {
          const before = snapshot(root);
          await list(cli, root, ["a"]);
          assert.deepEqual(snapshot(root), before);
          const empty = fs.mkdtempSync(path.join(os.tmpdir(), "basics-manifest-empty-"));
          try {
            assert.deepEqual(await list(cli, empty), []);
          } finally {
            fs.rmSync(empty, { recursive: true, force: true });
          }
        },
      ),
  ],
  [
    "invalid roots, patterns and input",
    ({ cli }) =>
      withTree(
        ({ put }) => put("file.txt", "1"),
        async (root) => {
          const inputs = [
            { root: path.join(root, "file.txt"), exclude: [] },
            { root: path.join(root, "missing"), exclude: [] },
            { root: "relative/dir", exclude: [] },
            { root, exclude: [""] },
            { root, exclude: ["/a"] },
            { root, exclude: ["a/"] },
            { root, exclude: ["a\\b"] },
            { root, exclude: ["../x"] },
            { root, exclude: ["a//b"] },
            { root, exclude: ["."] },
            { root, exclude: ["a/./b"] },
            { root, exclude: [1] },
            { root, exclude: "a" },
            { exclude: [] },
          ];
          for (const input of inputs) {
            const result = await cli(JSON.stringify(input));
            assert.notEqual(result.code, 0, JSON.stringify(input));
            assert.equal(result.stdout, "");
            assert.ok(result.stderr.trim());
          }
          const broken = await cli("{");
          assert.notEqual(broken.code, 0);
          assert.equal(broken.stdout, "");
        },
      ),
  ],
]);
