import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { installPack, listPacks, Vault } from "../../packages/core/dist/index.js";
import { buildDataset, compareText, MANIFESTS, ordered, readmeIntro, rejection, repositoryCase, SEED, STACKS } from "./github-data.mjs";

const run = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));
const queries = {
  "web-typescript": ["topic:nextjs", "topic:react language:TypeScript", "topic:typescript topic:dashboard"],
  "python-api": ["topic:fastapi", "topic:python-api", "fastapi in:readme language:Python"],
  "rust-api": ["topic:axum", "topic:actix-web", "topic:rust topic:api"],
  "go-api": ["topic:gin", "topic:go-api", "topic:echo language:Go"],
  mobile: ["topic:flutter", "topic:react-native", "topic:mobile-app language:Dart"],
  "data-ml": ["topic:data-analysis language:Python", "topic:machine-learning language:Python", "topic:scikit-learn"],
};
// Preserve raw values needed for replay, not unrelated 100k-entry repository trees.
function cachedResponse(endpoint, data) {
  if (endpoint.startsWith("search/"))
    return { incomplete_results: data.incomplete_results, items: data.items?.map(({ full_name }) => ({ full_name })) };
  if (endpoint.includes("/git/trees/"))
    return {
      truncated: data.truncated,
      tree: data.tree?.filter((f) => MANIFESTS.has(path.posix.basename(f.path)) || /^readme(?:\.md|\.rst|\.txt)?$/i.test(f.path)),
    };
  if (endpoint.includes("/commits/")) return { sha: data.sha };
  if (/^repos\/[^/]+\/[^/]+$/.test(endpoint))
    return Object.fromEntries(
      [
        "id",
        "name",
        "full_name",
        "html_url",
        "description",
        "visibility",
        "private",
        "fork",
        "archived",
        "disabled",
        "is_template",
        "size",
        "stargazers_count",
        "default_branch",
      ].map((key) => [key, data[key]]),
    );
  return data;
}
export async function mine(options, transport) {
  const { rawFile, outFile, target = 150, seed = SEED, offline = false, pages = 2 } = options;
  const raw = fs.existsSync(rawFile)
    ? JSON.parse(fs.readFileSync(rawFile, "utf8"))
    : { schema_version: 1, seed, api_cache: {}, repositories: [] };
  if (raw.schema_version !== 1 || raw.seed !== seed || !Array.isArray(raw.repositories)) throw new Error("Raw dump schema/seed mismatch");
  raw.api_cache ??= {};
  for (const [endpoint, data] of Object.entries(raw.api_cache)) raw.api_cache[endpoint] = cachedResponse(endpoint, data);
  const save = () => {
    fs.mkdirSync(path.dirname(rawFile), { recursive: true });
    fs.writeFileSync(`${rawFile}.tmp`, `${JSON.stringify(raw, null, 2)}\n`);
    fs.renameSync(`${rawFile}.tmp`, rawFile);
  };
  let lastSearch = 0;
  const api = async (endpoint) => {
    if (Object.hasOwn(raw.api_cache, endpoint)) return raw.api_cache[endpoint];
    if (offline) throw new Error(`Offline dump missing endpoint: ${endpoint}`);
    if (endpoint.startsWith("search/") && !transport) {
      const delay = Math.max(0, 2100 - (Date.now() - lastSearch));
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      lastSearch = Date.now();
    }
    const data = transport
      ? await transport(endpoint)
      : JSON.parse(
          (
            await run("gh", ["api", "--method", "GET", "-H", "Accept: application/vnd.github+json", endpoint], {
              cwd: root,
              maxBuffer: 32 * 1024 * 1024,
              timeout: 60000,
            })
          ).stdout,
        );
    raw.api_cache[endpoint] = cachedResponse(endpoint, data);
    return raw.api_cache[endpoint];
  };
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "basics-github-vault-"));
  const packsDir = path.join(root, "packs");
  try {
    const vault = Vault.load(scratch);
    for (const pack of listPacks(packsDir)) installPack(vault, packsDir, pack.name, { lang: "en" });
    if (!offline) {
      const existing = new Set(raw.repositories.map((r) => `${r.stack}:${r.metadata.full_name}`));
      for (const stack of STACKS) {
        const quota = Math.floor(target / STACKS.length) + Number(STACKS.indexOf(stack) < target % STACKS.length);
        let dataset = buildDataset(raw, vault, packsDir, target);
        let count = dataset.cases.filter((c) => c.stack === stack).length;
        for (const query of queries[stack]) {
          if (count >= quota) break;
          for (let page = 1; page <= pages && count < quota; page++) {
            const response = await api(
              `search/repositories?q=${encodeURIComponent(`${query} is:public fork:false archived:false size:>=100 stars:>=5`)}&sort=stars&order=desc&per_page=100&page=${page}`,
            );
            if (response.incomplete_results) throw new Error(`Incomplete GitHub search; retry/cache a complete response: ${query}`);
            for (const candidate of ordered(response.items ?? [], seed, (r) => r.full_name)) {
              if (count >= quota) break;
              if (existing.has(`${stack}:${candidate.full_name}`)) continue;
              if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(candidate.full_name)) continue;
              const meta = await api(`repos/${candidate.full_name}`);
              if (rejection(meta)) {
                raw.repositories.push({ stack, metadata: meta, manifests: [] });
                existing.add(`${stack}:${candidate.full_name}`);
                save();
                continue;
              }
              const commit = await api(`repos/${meta.full_name}/commits/${encodeURIComponent(meta.default_branch)}`);
              const sha = commit.sha;
              if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("Invalid commit SHA from API");
              const tree = await api(`repos/${meta.full_name}/git/trees/${sha}?recursive=1`);
              if (tree.truncated) {
                process.stderr.write(`skip ${meta.full_name}: truncated tree\n`);
                continue;
              }
              const files = (tree.tree ?? [])
                .filter(
                  (f) =>
                    f.type === "blob" &&
                    f.size <= 262144 &&
                    f.path.split("/").length <= 5 &&
                    MANIFESTS.has(path.posix.basename(f.path)) &&
                    !/(?:^|\/)(?:node_modules|vendor|\.venv|target|fixtures|tests?|examples?|docs)(?:\/|$)/i.test(f.path),
                )
                .sort((a, b) => a.path.split("/").length - b.path.split("/").length || compareText(a.path, b.path));
              if (files.length > 24) {
                process.stderr.write(`skip ${meta.full_name}: more than 24 manifests\n`);
                continue;
              }
              const record = { stack, metadata: meta, commit_sha: sha, manifests: [] };
              for (const file of files) {
                const blob = await api(`repos/${meta.full_name}/git/blobs/${file.sha}`);
                if (blob.encoding !== "base64") throw new Error("Unsupported Git blob encoding");
                record.manifests.push({ path: file.path, sha: file.sha, content: Buffer.from(blob.content, "base64").toString("utf8") });
              }
              const readme = (tree.tree ?? []).find(
                (f) => f.type === "blob" && /^readme(?:\.md|\.rst|\.txt)?$/i.test(f.path) && f.size <= 262144,
              );
              if (readme) {
                const blob = await api(`repos/${meta.full_name}/git/blobs/${readme.sha}`);
                record.readme = {
                  path: readme.path,
                  sha: readme.sha,
                  intro: readmeIntro(Buffer.from(blob.content, "base64").toString("utf8")),
                };
              }
              raw.repositories.push(record);
              existing.add(`${stack}:${candidate.full_name}`);
              save();
              const check = repositoryCase(record, vault, packsDir);
              if (check.value) {
                dataset = buildDataset(raw, vault, packsDir, target);
                count = dataset.cases.filter((c) => c.stack === stack).length;
                process.stderr.write(`${stack} ${count}/${quota}: ${meta.full_name}\n`);
              }
            }
          }
        }
        if (count < quota)
          throw new Error(
            `Only ${count}/${quota} ${stack} cases accepted; increase --pages or revise sampling queries, not rankings. Raw cache saved.`,
          );
      }
    }
    const dataset = buildDataset(raw, vault, packsDir, target);
    if (dataset.cases.length !== target)
      throw new Error(`Only ${dataset.cases.length}/${target} cases in dump; refusing to publish an undersized set`);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    const bytes = `${JSON.stringify(dataset, null, 2)}\n`;
    if (fs.existsSync(outFile) && fs.readFileSync(outFile, "utf8") !== bytes)
      throw new Error("Output differs from an existing frozen dataset; use --out with a new path for review. Existing output preserved.");
    fs.writeFileSync(`${outFile}.tmp`, bytes);
    fs.renameSync(`${outFile}.tmp`, outFile);
    return dataset;
  } finally {
    if (!offline) save();
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = (flag, fallback) => {
    const index = args.indexOf(flag);
    return index < 0 ? fallback : args[index + 1];
  };
  if (args.includes("--help")) {
    console.log(
      "node scripts/eval/mine-github.mjs [--raw <cache.json>] [--out <dataset.json>] [--target 150] [--seed <seed>] [--pages 2] [--offline]\nOnline uses authenticated gh api; offline reads only the cached raw dump. Build first. No repository code is executed.",
    );
  } else {
    try {
      const target = Number(value("--target", 150)),
        pages = Number(value("--pages", 2));
      if (!Number.isInteger(target) || target < 6 || !Number.isInteger(pages) || pages < 1 || pages > 10)
        throw new Error("Invalid target/pages");
      const dataset = await mine({
        rawFile: path.resolve(value("--raw", "scripts/demo/generated/t3/github-raw.json")),
        outFile: path.resolve(value("--out", "scripts/eval/github-repos.json")),
        target,
        pages,
        seed: value("--seed", SEED),
        offline: args.includes("--offline"),
      });
      console.log(
        `Wrote ${dataset.cases.length} cases: ${dataset.cases.filter((c) => c.split === "tune").length} tune / ${dataset.cases.filter((c) => c.split === "held-out").length} held-out.`,
      );
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
