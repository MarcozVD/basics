import assert from "node:assert/strict";
import { test } from "vitest";
import { loadTasks } from "../../../scripts/study/spec.mjs";
import { validateTasks } from "../../../scripts/study/validate.mjs";

// Takes about 6 minutes: run with `npm run study:validate`, or set BASICS_STUDY_VALIDATE=1 for this test.
test.skipIf(!process.env.BASICS_STUDY_VALIDATE)(
  "every hidden harness accepts its reference and rejects two targeted mutations",
  async () => {
    const tasks = loadTasks();
    assert.equal(tasks.length, 20);
    const results = await validateTasks(tasks, { concurrency: 3 });
    assert.equal(results.length, 60);
    assert.equal(results.filter((row) => row.variant === "reference" && row.status === "pass").length, 20);
    assert.equal(results.filter((row) => row.variant !== "reference" && row.status === "fail").length, 40);
  },
  900000,
);
