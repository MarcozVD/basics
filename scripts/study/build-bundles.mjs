import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { files, fresh, hash, json, repoRoot, studyRoot, writeJson } from "./common.mjs";
import { loadTasks } from "./spec.mjs";

export function buildBundles(output, tasks = loadTasks()) {
  fresh(output);
  const shared = {
    "package.json": json({ type: "module" }),
    "harness.mjs": fs.readFileSync(path.join(studyRoot, "harness.mjs"), "utf8"),
    "contract.mjs": fs.readFileSync(path.join(studyRoot, "contract.mjs"), "utf8"),
  };
  for (const name of ["agent-process-tree.js", "agent-posix-tree.js"])
    shared[name] = fs.readFileSync(path.join(repoRoot, "packages/basics/dist", name), "utf8");
  return tasks.map((task) => {
    const entries = Object.entries(files(path.join(studyRoot, "acceptance", task.id)));
    const payload = { ...shared };
    for (const [name, content] of entries) {
      if (Object.hasOwn(payload, name)) throw new Error("Acceptance path collides with harness");
      payload[name] = content.toString("utf8");
    }
    if (
      !Object.hasOwn(payload, "run.mjs") ||
      Object.keys(payload).length > 1000 ||
      Buffer.byteLength(json({ files: payload })) > 10 * 1024 * 1024
    )
      throw new Error("Invalid acceptance bundle");
    const bundle = path.join(output, `${task.id}.json`);
    writeJson(bundle, { files: payload });
    return {
      id: task.id,
      hash: hash(fs.readFileSync(bundle)),
      bundle,
      command: `"${process.execPath.replaceAll("\\", "/")}" .basics-acceptance/run.mjs`,
    };
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(json(buildBundles(path.resolve(process.argv[2] ?? "study-bundles"))));
