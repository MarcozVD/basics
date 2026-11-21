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

export async function validatePilots(tasks = loadTasks()) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "basics-study-validation-")),
    owner = new CompareDirectories();
  owner.own(base);
  const results = [];
  try {
    const bundles = buildBundles(path.join(base, "bundles"), tasks);
    for (const task of tasks) {
      const reference = path.join(studyRoot, "references", task.id),
        mutations = readJson(path.join(reference, "mutations.json"));
      for (const mutation of [null, ...mutations]) {
        const project = fs.mkdtempSync(path.join(base, "subject-"));
        for (const [name, bytes] of Object.entries(files(reference)))
          if (name !== "mutations.json") fs.writeFileSync(path.join(project, name), bytes);
        if (mutation) {
          const target = path.join(project, mutation.file),
            text = fs.readFileSync(target, "utf8");
          if (text.split(mutation.find).length !== 2) throw new Error("Mutation must match exactly once");
          fs.writeFileSync(target, text.replace(mutation.find, mutation.replace));
        }
        stageAcceptance(
          bundles.find((item) => item.id === task.id),
          project,
        );
        const measured = await new Promise((resolve, reject) => {
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
            reject(new Error("Pilot harness validation timed out"));
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
    }
    return results;
  } finally {
    owner.remove(base);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(json(await validatePilots()));
