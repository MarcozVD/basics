import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const studyRoot = fileURLToPath(new URL("./", import.meta.url));
export const repoRoot = path.resolve(studyRoot, "../..");
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}
export const json = (value) => `${JSON.stringify(canonical(value), null, 2)}\n`;
export const hash = (value) =>
  createHash("sha256")
    .update(typeof value === "string" || Buffer.isBuffer(value) ? value : json(value))
    .digest("hex");
export function files(root) {
  const result = {};
  function visit(directory) {
    for (const name of fs.readdirSync(directory).sort()) {
      const file = path.join(directory, name),
        stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) throw new Error("Study fixtures cannot contain symbolic links or junctions");
      if (stat.isDirectory()) visit(file);
      else if (stat.isFile()) result[path.relative(root, file).split(path.sep).join("/")] = fs.readFileSync(file);
      else throw new Error("Study fixtures must contain regular files only");
    }
  }
  visit(root);
  return result;
}
export const treeHash = (root) => hash(Object.entries(files(root)).map(([name, content]) => [name, hash(content)]));
export function readJson(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16 * 1024 * 1024) throw new Error("Expected bounded regular JSON file");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
export function inside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
export function fresh(root) {
  fs.mkdirSync(root);
  return root;
}
export function rng(seed) {
  let state = parseInt(hash(String(seed)).slice(0, 8), 16);
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function writeJson(file, value) {
  fs.writeFileSync(file, json(value), { flag: "wx" });
}
export function append(file, event) {
  const fd = fs.openSync(file, "a");
  try {
    fs.writeSync(fd, `${JSON.stringify(event)}\n`);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
