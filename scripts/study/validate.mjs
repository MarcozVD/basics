import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { acceptanceResult, stageAcceptance } from "../../packages/basics/dist/compare-acceptance.js";
import { CompareDirectories } from "../../packages/basics/dist/compare-files.js";
import { buildBundles } from "./build-bundles.mjs";
import { files, json, readJson, studyRoot } from "./common.mjs";
import { loadTasks } from "./spec.mjs";

function measure(project) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [".basics-acceptance/run.mjs"], {
      cwd: project,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Harness validation timed out"));
    }, 120000);
    child.stdout.on("data", (data) => {
      stdout += data;
    });
    child.stderr.on("data", (data) => {
      stderr = (stderr + data).slice(-8000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ...acceptanceResult(stdout, code === 0 ? "pass" : "fail", 0), stderr });
    });
  });
}
/** Run every task's hidden harness against its reference (must pass) and each mutation (must fail). */
export async function validateTasks(tasks = loadTasks(), { concurrency = 4 } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "basics-study-validation-")),
    owner = new CompareDirectories();
  owner.own(base);
  try {
    const bundles = buildBundles(path.join(base, "bundles"), tasks);
    const validateTask = async (task) => {
      const reference = path.join(studyRoot, "references", task.id),
        mutations = readJson(path.join(reference, "mutations.json")),
        results = [];
      if (mutations.length < 2) throw new Error(`${task.id}: at least two mutations are required`);
      for (const mutation of [null, ...mutations]) {
        const project = fs.mkdtempSync(path.join(base, "subject-"));
        for (const [name, bytes] of Object.entries(files(reference)))
          if (name !== "mutations.json") fs.writeFileSync(path.join(project, name), bytes);
        if (mutation) {
          const target = path.join(project, mutation.file),
            text = fs.readFileSync(target, "utf8");
          if (text.split(mutation.find).length !== 2) throw new Error(`${task.id}/${mutation.name}: mutation must match exactly once`);
          fs.writeFileSync(
            target,
            text.replace(mutation.find, () => mutation.replace),
          );
        }
        stageAcceptance(
          bundles.find((item) => item.id === task.id),
          project,
        );
        const measured = await measure(project);
        if ((!mutation && measured.status !== "pass") || (mutation && measured.status !== "fail"))
          throw new Error(`${task.id}/${mutation?.name ?? "reference"}: ${json(measured)}`);
        results.push({
          task: task.id,
          variant: mutation?.name ?? "reference",
          status: measured.status,
          passed: measured.passed,
          failed: measured.failed,
        });
      }
      return results;
    };
    const output = [];
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
        while (next < tasks.length) {
          const index = next++;
          output[index] = await validateTask(tasks[index]);
        }
      }),
    );
    return output.flat();
  } finally {
    owner.remove(base);
  }
}
export const validatePilots = validateTasks;
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ids = process.argv.slice(2),
    all = loadTasks(),
    selected = ids.length ? all.filter((task) => ids.some((id) => task.id.startsWith(id))) : all;
  if (!selected.length) throw new Error("No matching study tasks");
  console.log(json(await validateTasks(selected)));
}
