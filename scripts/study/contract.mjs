import fs from "node:fs";
import path from "node:path";

export function readContract(project) {
  const file = path.join(project, "study-run.json"),
    stat = fs.lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 65536) throw new Error("Invalid study-run.json file");
  const value = JSON.parse(fs.readFileSync(file, "utf8"));
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== "object" ||
    Object.keys(value).some((key) => !["interface", "build", "command"].includes(key)) ||
    !["cli", "http"].includes(value.interface)
  )
    throw new Error("Invalid study-run.json fields");
  const argv = (command) =>
    Array.isArray(command) &&
    command.length > 0 &&
    command.length <= 128 &&
    command.every((arg) => typeof arg === "string" && !arg.includes("\0")) &&
    command[0].length > 0;
  if (!argv(value.command) || !Array.isArray(value.build ?? []) || (value.build ?? []).length > 8 || !(value.build ?? []).every(argv))
    throw new Error("Commands must be bounded argv arrays");
  return { ...value, build: value.build ?? [] };
}
export function resolveCommand(argv, project, tools) {
  const [name, ...args] = argv;
  if (Object.hasOwn(tools, name)) return { command: tools[name].command, args: [...tools[name].prefix, ...args] };
  if (name === "node") return { command: process.execPath, args };
  if (!name.startsWith("./") && !name.startsWith(".\\")) throw new Error(`Unsupported tool: ${name}`);
  const target = path.resolve(project, name),
    relative = path.relative(fs.realpathSync(project), fs.realpathSync(target));
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || !fs.statSync(target).isFile())
    throw new Error("Executable must stay in project");
  return { command: target, args };
}
