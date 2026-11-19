import fs from "node:fs";
import path from "node:path";
import { sha256 } from "@marcozvd/basics-core";

/** Ownership is per command invocation, never inferred from a filename prefix. */
export class CompareDirectories {
  private readonly owned = new Set<string>();
  own(dir: string): void {
    this.owned.add(path.resolve(dir));
  }
  remove(dir: string): void {
    const root = path.resolve(dir);
    if (!this.owned.has(root)) throw new Error("refusing to remove a directory this compare command did not create");
    for (const ancestor of this.owned) {
      if (ancestor !== root && root.startsWith(`${ancestor}${path.sep}`) && isLink(ancestor))
        throw new Error("refusing cleanup through a replaced owned ancestor");
    }
    if (!fs.existsSync(root) && !isLink(root)) return;
    // Unlink every symlink/junction without traversing its target, including a replaced root.
    const scrub = (current: string): void => {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) {
        fs.unlinkSync(current);
        return;
      }
      if (stat.isDirectory()) for (const name of fs.readdirSync(current)) scrub(path.join(current, name));
    };
    scrub(root);
    if (fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    this.owned.delete(root);
  }
}
function isLink(file: string): boolean {
  try {
    return fs.lstatSync(file).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Inspect link targets without descending into links; ordinary dependency links may stay inside the owned run. */
export function assertNoExternalOutputLinks(root: string): void {
  if (fs.lstatSync(root).isSymbolicLink()) throw new Error("output directory was replaced with a symlink or junction");
  // macOS commonly aliases /var to /private/var; either spelling identifies this owned root.
  const canonical = fs.realpathSync(root);
  const inside = (base: string, target: string) => {
    const relative = path.relative(base, target);
    return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  };
  const visit = (dir: string): void => {
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name),
        stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) {
        const target = path.resolve(path.dirname(file), fs.readlinkSync(file));
        if (!inside(root, target) && !inside(canonical, target))
          throw new Error(`output contains an external symlink or junction: ${path.relative(root, file)}`);
        continue;
      }
      // Runtime environments may link to system interpreters. They are not source
      // inputs; cleanup still sweeps every link there without following targets.
      if (stat.isDirectory() && !excludedDirectory(name)) visit(file);
    }
  };
  visit(root);
}

const EXCLUDED = new Set([
  "node_modules",
  ".git",
  ".venv",
  "venv",
  "__pycache__",
  "target",
  ".basics",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
  "dist",
  "build",
  ".next",
  "coverage",
]);
function excludedDirectory(name: string): boolean {
  return EXCLUDED.has(name) || name.endsWith(".egg-info");
}
export interface FileSnapshot {
  files: Record<string, string>;
  excluded: string[];
  truncated: boolean;
}
export function snapshotFiles(root: string): FileSnapshot {
  const result: FileSnapshot = { files: {}, excluded: [], truncated: false };
  const walk = (dir: string): void => {
    for (const name of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, name),
        stat = fs.lstatSync(file),
        rel = path.relative(root, file).split(path.sep).join("/");
      if (stat.isSymbolicLink()) {
        result.excluded.push(rel);
        continue;
      }
      if (name.endsWith(".egg-info")) {
        result.excluded.push(rel);
        continue;
      }
      if (stat.isDirectory()) {
        if (excludedDirectory(name)) result.excluded.push(rel);
        else walk(file);
      } else if (stat.isFile()) {
        if (Object.keys(result.files).length >= 10_000 || stat.size > 10 * 1024 * 1024) {
          result.truncated = true;
          continue;
        }
        result.files[rel] = sha256(fs.readFileSync(file).toString("base64"));
      }
    }
  };
  walk(root);
  return result;
}
export function fileChanges(before: FileSnapshot, after: FileSnapshot) {
  return {
    added: Object.keys(after.files).filter((file) => !(file in before.files)),
    changed: Object.keys(after.files).filter((file) => file in before.files && before.files[file] !== after.files[file]),
    deleted: Object.keys(before.files).filter((file) => !(file in after.files)),
    excluded: after.excluded,
    truncated: before.truncated || after.truncated,
  };
}
