#!/usr/bin/env node
import { spawnSync } from "node:child_process";
/**
 * Stage 1 resource preparation for the Basics desktop app.
 *
 * Copies the built CLI (dist/cli.js + ui + packs, preserving the dist/ layout so
 * the server's relative `import.meta.dirname` / `createRequire(import.meta.url)`
 * resolution for uiDir, packsDir and the version keeps working unchanged), plus
 * the production node_modules closure it needs, and downloads the official Node
 * 22 LTS runtime as the Tauri sidecar, verifying its SHA-256.
 *
 * WHY copy node_modules instead of bundling cli.js with esbuild: the CLI resolves
 * the UI dir, packs dir and its own version relative to the real file layout in
 * dist/. Bundling into a single file would collapse that layout and break those
 * resolutions. Copying the unchanged dist/ tree plus the small prod node_modules
 * closure is the simpler option that provably works (all runtime deps are pure JS).
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(here, "..");
const repoRoot = path.resolve(desktopDir, "../..");
const basicsPkg = path.join(repoRoot, "packages/basics");
const nodeMajor = "22";

/** Map a Rust target triple to the Node distribution "platform-arch" folder. */
function nodeDistName(triple) {
  if (triple.startsWith("x86_64-pc-windows")) return "win-x64";
  if (triple.startsWith("aarch64-pc-windows")) return "win-arm64";
  if (triple === "universal-apple-darwin") return "darwin-universal";
  if (triple.startsWith("aarch64-apple-darwin")) return "darwin-arm64";
  if (triple.startsWith("x86_64-apple-darwin")) return "darwin-x64";
  if (triple.startsWith("x86_64-unknown-linux")) return "linux-x64";
  throw new Error(`unsupported target triple: ${triple}`);
}

function currentTriple() {
  const arch = os.arch();
  const platform = process.platform;
  if (platform === "win32") return arch === "arm64" ? "aarch64-pc-windows-msvc" : "x86_64-pc-windows-msvc";
  if (platform === "darwin") return arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
  if (platform === "linux") return arch === "arm64" ? "aarch64-unknown-linux-gnu" : "x86_64-unknown-linux-gnu";
  throw new Error(`unsupported platform: ${platform}`);
}

function args() {
  const argv = process.argv.slice(2);
  const out = { triple: currentTriple() };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--target-triple") out.triple = argv[++i];
    else if (argv[i] === "--node-version") out.nodeVersion = argv[++i];
  }
  return out;
}

const { triple, nodeVersion } = args();
const distName = nodeDistName(triple);

const srcTauriDir = path.join(desktopDir, "src-tauri");
const resourcesDir = path.join(srcTauriDir, "resources");
const basicsResources = path.join(resourcesDir, "basics");
const binariesDir = path.join(srcTauriDir, "binaries");

function ensureBuild() {
  const cli = path.join(basicsPkg, "dist/cli.js");
  if (fs.existsSync(cli)) {
    console.log("basics dist present, skipping root build");
    return;
  }
  console.log("basics dist missing, building root…");
  const res = spawnSync("npm", ["run", "build"], { cwd: repoRoot, stdio: "inherit", shell: true });
  if (res.status !== 0) throw new Error("root npm run build failed");
}

/**
 * Mirror packages/basics into resources/basics: dist/ (cli+server+mcp+ui+packs) plus package.json, which the
 * compiled code reads as "../package.json" (dist/program.js) and "../../package.json" (dist/server, dist/mcp).
 * The app starts resources/basics/dist/cli.js.
 */
function copyDist() {
  fs.rmSync(basicsResources, { recursive: true, force: true });
  fs.mkdirSync(basicsResources, { recursive: true });
  fs.cpSync(path.join(basicsPkg, "dist"), path.join(basicsResources, "dist"), { recursive: true });
  fs.copyFileSync(path.join(basicsPkg, "package.json"), path.join(basicsResources, "package.json"));
  fs.rmSync(path.join(resourcesDir, "package.json"), { force: true });
  console.log("copied basics dist + package.json → resources/basics");
}

/**
 * Collect the production node_modules closure reachable from @marcozvd/basics and
 * @marcozvd/basics-core by walking their dependency graphs, then copy each real
 * package directory into resources/basics/node_modules preserving scoped paths.
 */
function copyNodeModules() {
  const target = path.join(basicsResources, "node_modules");
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });

  const basicsManifest = JSON.parse(fs.readFileSync(path.join(basicsPkg, "package.json"), "utf8"));
  // [package name, directory whose node_modules chain resolves it]
  const pending = Object.keys(basicsManifest.dependencies ?? {}).map((name) => [name, basicsPkg]);
  const copied = new Set();

  const readPkg = (dir) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    } catch {
      return null;
    }
  };

  // Walk node_modules directories upwards like Node does. require.resolve("<pkg>/package.json")
  // fails for packages whose "exports" hide package.json, which silently dropped most of them.
  const findPackageDir = (name, fromDir) => {
    for (let dir = fromDir; ; dir = path.dirname(dir)) {
      const candidate = path.join(dir, "node_modules", name);
      if (fs.existsSync(path.join(candidate, "package.json"))) return fs.realpathSync(candidate);
      if (path.dirname(dir) === dir) return null;
    }
  };

  while (pending.length) {
    const [name, fromDir] = pending.pop();
    const realDir = findPackageDir(name, fromDir);
    if (!realDir) throw new Error(`dependency ${name} is not installed (looked up from ${fromDir})`);
    if (copied.has(name)) continue;
    copied.add(name);

    const pkg = readPkg(realDir);
    for (const dep of Object.keys(pkg?.dependencies ?? {})) pending.push([dep, realDir]);

    const dest = path.join(target, ...name.split("/"));
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    // Workspace packages (symlinked into the repo) ship only what npm would publish.
    if (realDir.startsWith(path.join(repoRoot, "packages"))) {
      fs.mkdirSync(dest, { recursive: true });
      fs.copyFileSync(path.join(realDir, "package.json"), path.join(dest, "package.json"));
      fs.cpSync(path.join(realDir, "dist"), path.join(dest, "dist"), { recursive: true });
    } else {
      fs.cpSync(realDir, dest, { recursive: true });
    }
  }
  console.log(`copied prod node_modules closure → resources/basics/node_modules (${copied.size} pkgs)`);
}

/** Resolve the exact Node 22 version, then download and verify the sidecar binary. */
async function downloadNode() {
  const version = nodeVersion ?? (await latestNodeVersion());
  const binName = `node-${triple}${triple.includes("windows") ? ".exe" : ""}`;
  const dest = path.join(binariesDir, binName);
  if (fs.existsSync(dest)) {
    console.log(`node sidecar already present: ${dest}`);
    return dest;
  }
  fs.mkdirSync(binariesDir, { recursive: true });
  const shasums = await (await fetch(`https://nodejs.org/dist/v${version}/SHASUMS256.txt`)).text();

  if (distName === "darwin-universal") {
    // nodejs.org ships no universal macOS build: fetch both slices and merge them with lipo.
    // `tauri build --target universal-apple-darwin` compiles each architecture first and
    // looks up the per-arch sidecar for each, so keep both slices next to the universal one.
    const arm = path.join(binariesDir, "node-aarch64-apple-darwin");
    const x64 = path.join(binariesDir, "node-x86_64-apple-darwin");
    fs.renameSync(await fetchNodeBinary(version, "darwin-arm64", shasums), arm);
    fs.renameSync(await fetchNodeBinary(version, "darwin-x64", shasums), x64);
    fs.chmodSync(arm, 0o755);
    fs.chmodSync(x64, 0o755);
    const res = spawnSync("lipo", ["-create", arm, x64, "-output", dest], { stdio: "inherit" });
    if (res.status !== 0) throw new Error("lipo failed to create the universal node binary");
  } else {
    const bin = await fetchNodeBinary(version, distName, shasums);
    fs.renameSync(bin, dest);
  }
  fs.chmodSync(dest, 0o755);
  console.log(`node sidecar ready: ${dest}`);
  return dest;
}

/** Download one Node archive, check it against SHASUMS256.txt and return the extracted binary path. */
async function fetchNodeBinary(version, dist, shasums) {
  const isWin = dist.startsWith("win-");
  const base = `node-v${version}-${dist}`;
  const archive = `${base}.${isWin ? "zip" : "tar.gz"}`;
  const line = shasums.split("\n").find((l) => l.trim().endsWith(`  ${archive}`));
  if (!line) throw new Error(`no sha256 for ${archive} in SHASUMS256.txt`);
  const expected = line.trim().split(/\s+/)[0];

  const url = `https://nodejs.org/dist/v${version}/${archive}`;
  console.log(`downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const actual = createHash("sha256").update(buf).digest("hex");
  if (actual !== expected) throw new Error(`sha256 mismatch for ${archive}: expected ${expected}, got ${actual}`);
  console.log(`sha256 verified: ${actual}`);

  const work = fs.mkdtempSync(path.join(os.tmpdir(), "basics-node-"));
  try {
    const archivePath = path.join(work, archive);
    fs.writeFileSync(archivePath, buf);
    const res = isWin
      ? spawnSync(
          "powershell",
          ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${work}' -Force`],
          { stdio: "inherit" },
        )
      : spawnSync("tar", ["-xzf", archivePath, "-C", work], { stdio: "inherit" });
    if (res.status !== 0) throw new Error(`could not extract ${archive}`);
    // Archives keep everything under a top-level `node-vX-<dist>/` folder.
    const inner = isWin ? path.join(work, base, "node.exe") : path.join(work, base, "bin", "node");
    if (!fs.existsSync(inner)) throw new Error(`expected ${path.relative(work, inner)} in ${archive}`);
    const out = path.join(binariesDir, `.node-${dist}${isWin ? ".exe" : ""}`);
    fs.copyFileSync(inner, out);
    return out;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

async function latestNodeVersion() {
  const res = await fetch(`https://nodejs.org/dist/latest-v${nodeMajor}.x/SHASUMS256.txt`);
  const text = await res.text();
  const m = text.match(/node-v(22\d*\.\d+\.\d+)-/);
  if (!m) throw new Error("could not determine latest Node 22 version");
  return m[1];
}

async function main() {
  ensureBuild();
  fs.mkdirSync(resourcesDir, { recursive: true });
  copyDist();
  copyNodeModules();
  await downloadNode();
  console.log("prepare-resources done.");
}

await main().catch((err) => {
  console.error(err);
  process.exit(1);
});
