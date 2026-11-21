import fs from "node:fs";
import path from "node:path";

const badPattern = (pattern) =>
  typeof pattern !== "string" ||
  pattern.includes("\\") ||
  pattern.startsWith("/") ||
  pattern.endsWith("/") ||
  pattern.split("/").some((part) => part === "" || part === "." || part === "..");
try {
  const input = JSON.parse(fs.readFileSync(0, "utf8"));
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    typeof input.root !== "string" ||
    !path.isAbsolute(input.root) ||
    !Array.isArray(input.exclude) ||
    input.exclude.some(badPattern)
  )
    throw new Error("Invalid input");
  if (!fs.statSync(input.root).isDirectory()) throw new Error("Root is not a directory");
  const excluded = (relative, name) =>
    input.exclude.some((pattern) =>
      pattern.includes("/") ? relative === pattern || relative.startsWith(`${pattern}/`) : name === pattern,
    );
  const files = [];
  const walk = (directory, prefix) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name,
        full = path.join(directory, entry.name);
      if (excluded(relative, entry.name) || entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) walk(full, relative);
      else if (entry.isFile()) files.push({ path: relative, size: fs.lstatSync(full).size });
    }
  };
  walk(input.root, "");
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  console.log(JSON.stringify({ files }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
