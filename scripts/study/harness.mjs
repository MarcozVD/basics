import { spawn } from "node:child_process";
import net from "node:net";
import { AgentProcessTree, waitForAgentExit } from "./agent-process-tree.js";
import { readContract, resolveCommand } from "./contract.mjs";

export async function runCases(expectedInterface, cases) {
  let passed = 0,
    failed = 0;
  const project = process.cwd(),
    active = new Map();
  const tools = JSON.parse(process.env.BASICS_STUDY_TOOLCHAINS ?? "{}");
  const stop = async (child) => {
    const tree = active.get(child);
    if (!tree) return;
    await tree.shutdown();
    await waitForAgentExit(child);
    active.delete(child);
    if (child.exitCode === null && child.signalCode === null) throw new Error("Subject process did not stop");
  };
  const launch = (argv, extra = {}) => {
    const resolved = resolveCommand(argv, project, tools);
    const child = spawn(resolved.command, resolved.args, {
      cwd: project,
      env: { ...process.env, ...extra },
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });
    active.set(child, new AgentProcessTree(child));
    return child;
  };
  const execute = (argv, input = "") =>
    new Promise((resolve, reject) => {
      const child = launch(argv);
      let stdout = "",
        stderr = "",
        done = false;
      const timer = setTimeout(() => void finish(new Error("Subject command timed out")), 15000);
      async function finish(error, code) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try {
          await stop(child);
          if (error) reject(error);
          else resolve({ stdout, stderr, code });
        } catch (failure) {
          reject(failure);
        }
      }
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (data) => {
        stdout += data;
        if (stdout.length > 1024 * 1024) void finish(new Error("Subject stdout too large"));
      });
      child.stderr.on("data", (data) => {
        stderr = (stderr + data).slice(-8000);
      });
      child.on("error", (error) => void finish(error));
      child.on("close", (code) => void finish(undefined, code));
      child.stdin.on("error", () => {});
      child.stdin.end(input);
    });
  try {
    const contract = readContract(project);
    if (contract.interface !== expectedInterface) throw new Error("Wrong subject interface");
    for (const command of contract.build) {
      const built = await execute(command);
      if (built.code !== 0) throw new Error(`Build failed: ${built.stderr}`);
    }
    const cli = (input) => execute(contract.command, input);
    const http = async () => {
      const probe = net.createServer();
      await new Promise((resolve, reject) => {
        probe.once("error", reject);
        probe.listen(0, "127.0.0.1", resolve);
      });
      const port = probe.address().port;
      await new Promise((resolve) => probe.close(resolve));
      if (port < 4810 || port === 4747) throw new Error("Unsafe subject port");
      const child = launch(contract.command, { PORT: String(port) });
      child.stdin.end();
      let failure = "";
      child.on("error", (error) => {
        failure = error.message;
      });
      child.stdout.on("data", () => {});
      child.stderr.on("data", (data) => {
        failure = (failure + data).slice(-4000);
      });
      const deadline = Date.now() + 10000;
      while (true) {
        if (child.exitCode !== null || child.signalCode !== null || Date.now() >= deadline)
          throw new Error(`HTTP startup failed: ${failure}`);
        const ready = await new Promise((resolve) => {
          const socket = net.connect(port, "127.0.0.1");
          socket.on("connect", () => {
            socket.destroy();
            resolve(true);
          });
          socket.on("error", () => {
            socket.destroy();
            resolve(false);
          });
        });
        if (ready) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      return {
        request: (url, init) => fetch(`http://127.0.0.1:${port}${url}`, { ...init, signal: AbortSignal.timeout(3000) }),
        close: () => stop(child),
      };
    };
    for (const [name, check] of cases) {
      try {
        await check({ cli, http });
        passed++;
      } catch (error) {
        if (error?.skip === true) continue;
        failed++;
        console.error(`${name}: ${String(error.message).slice(0, 1000)}`);
      } finally {
        for (const child of [...active.keys()]) await stop(child);
      }
    }
  } catch (error) {
    failed++;
    console.error(String(error.message).slice(0, 1000));
  } finally {
    for (const child of [...active.keys()]) {
      try {
        await stop(child);
      } catch (error) {
        failed++;
        console.error(error.message);
      }
    }
  }
  console.log(JSON.stringify({ passed, failed }));
  process.exitCode = failed ? 1 : 0;
}
