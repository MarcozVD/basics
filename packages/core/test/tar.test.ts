import assert from "node:assert/strict";
import zlib from "node:zlib";
import { test } from "vitest";
import { PackDownloadError, parseTar, parseTarGz } from "../src/index.js";
import { buildTar, buildTarGz } from "./tar-builder.js";

const LIMITS = { maxFileBytes: 256 * 1024, maxEntries: 1000, maxUnpackedBytes: 10 * 1024 * 1024 };

test("parseTarGz returns regular files and strips the top-level directory", () => {
  const entries = parseTarGz(
    buildTarGz([
      { path: "repo", type: "dir" },
      { path: "repo/pack.json", data: "{}" },
    ]),
    LIMITS,
  );
  assert.deepEqual(entries, [{ path: "pack.json", data: Buffer.from("{}") }]);
});

test("parseTar (uncompressed) keeps the leading dir and reads file contents", () => {
  const entries = parseTar(
    buildTar([
      { path: "a.txt", data: "hello" },
      { path: "dir", type: "dir" },
      { path: "dir/b.txt", data: "world" },
    ]),
    LIMITS,
  );
  assert.deepEqual(
    entries.map((e) => [e.path, e.data.toString()]),
    [
      ["a.txt", "hello"],
      ["dir/b.txt", "world"],
    ],
  );
});

test("pax and GNU long names are honored", () => {
  const name = "very/long/path/with/many/segments/that/exceeds/the/hundred/byte/name/field/easily/deep-into-a-directory/note.md";
  const pax = parseTar(
    buildTar([
      { type: "pax", paxPath: name },
      { path: "placeholder", data: "x" },
    ]),
    LIMITS,
  );
  assert.equal(pax[0].path, name);

  const gnu = parseTar(
    buildTar([
      { type: "longname", longName: name },
      { path: "placeholder", data: "x" },
    ]),
    LIMITS,
  );
  assert.equal(gnu[0].path, name);
});

test("symlinks and hard links are rejected", () => {
  assert.throws(() => parseTar(buildTar([{ path: "link", type: "symlink", linkname: "/etc/passwd" }]), LIMITS), PackDownloadError);
  assert.throws(() => parseTar(buildTar([{ path: "link", type: "hardlink", linkname: "other" }]), LIMITS), PackDownloadError);
});

test(".. segments and absolute paths are rejected", () => {
  assert.throws(() => parseTar(buildTar([{ path: "../escape.md", data: "x" }]), LIMITS), PackDownloadError);
  assert.throws(() => parseTar(buildTar([{ path: "/abs.md", data: "x" }]), LIMITS), PackDownloadError);
  assert.throws(
    () =>
      parseTar(
        buildTar([
          { type: "pax", paxPath: "../../evil.md" },
          { path: "a", data: "x" },
        ]),
        LIMITS,
      ),
    PackDownloadError,
  );
});

test("oversized files are rejected", () => {
  const big = Buffer.alloc(LIMITS.maxFileBytes + 1, 97);
  assert.throws(() => parseTar(buildTar([{ path: "big.md", data: big }]), LIMITS), PackDownloadError);
});

test("an archive with too many entries is rejected", () => {
  const entries = Array.from({ length: LIMITS.maxEntries + 1 }, (_, i) => ({ path: `f${i}.md`, data: "x" }));
  assert.throws(() => parseTar(buildTar(entries), LIMITS), PackDownloadError);
});

test("an archive that unpacks too big is rejected", () => {
  const small = Buffer.alloc(1024 * 1024, 97);
  const entries = Array.from({ length: 11 }, () => ({ path: "chunk.bin", data: small }));
  assert.throws(() => parseTar(buildTar(entries), LIMITS), PackDownloadError);
});

test("parseTarGz stops a gzip bomb before inflating it fully", () => {
  const bomb = zlib.gzipSync(Buffer.alloc(64 * 1024 * 1024));
  assert.throws(() => parseTarGz(bomb, LIMITS), /unpacks to more than/);
});

test("parseTarGz rejects bytes that are not gzip", () => {
  assert.throws(() => parseTarGz(Buffer.from("not a tarball"), LIMITS), PackDownloadError);
});
