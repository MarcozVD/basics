import fs from "node:fs";

const int = (value, min) => Number.isSafeInteger(value) && value >= min;
try {
  const jobs = JSON.parse(fs.readFileSync(0, "utf8"));
  if (!Array.isArray(jobs)) throw new Error("Expected an array of jobs");
  const keys = ["id", "priority", "available_at", "duration", "fail_attempts", "max_attempts"];
  const ids = new Set();
  for (const job of jobs) {
    if (
      !job ||
      typeof job !== "object" ||
      Array.isArray(job) ||
      Object.keys(job).length !== keys.length ||
      !keys.every((key) => Object.hasOwn(job, key)) ||
      typeof job.id !== "string" ||
      job.id === "" ||
      ids.has(job.id) ||
      !int(job.priority, Number.MIN_SAFE_INTEGER) ||
      !int(job.available_at, 0) ||
      !int(job.duration, 1) ||
      !int(job.fail_attempts, 0) ||
      !int(job.max_attempts, 1)
    )
      throw new Error("Invalid job");
    ids.add(job.id);
  }
  const pending = jobs.map((job) => ({ ...job, attempts: 0 })),
    events = [],
    final = {};
  let t = 0;
  while (pending.length) {
    let ready = pending.filter((job) => job.available_at <= t);
    if (!ready.length) {
      t = Math.min(...pending.map((job) => job.available_at));
      ready = pending.filter((job) => job.available_at <= t);
    }
    ready.sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const job = ready[0];
    job.attempts++;
    const start = t,
      end = t + job.duration,
      failed = job.attempts <= job.fail_attempts;
    events.push({ job: job.id, attempt: job.attempts, start, end, outcome: failed ? "fail" : "success" });
    t = end;
    if (!failed) final[job.id] = "finished";
    else if (job.attempts >= job.max_attempts) final[job.id] = "failed";
    else {
      job.available_at = t + 10 * job.attempts;
      continue;
    }
    pending.splice(pending.indexOf(job), 1);
  }
  console.log(JSON.stringify({ events, final, end_time: t }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
