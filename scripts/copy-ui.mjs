import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const source = path.join(root, "packages/ui/dist");
const target = path.join(root, "packages/basics/dist/ui");

fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });
