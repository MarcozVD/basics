import { type ChildProcess, execFile, spawnSync } from "node:child_process";
import path from "node:path";
import type { ShutdownDiagnostics } from "@marcozvd/basics-core/compare";
import { shutdownPosixGroup } from "./agent-posix-tree.js";

interface WindowsProcess {
  ProcessId: number;
  ParentProcessId: number;
  Created: string;
}
const windowsPowerShell = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
/** Fixed command, no interpolated paths or shell. Creation time guards against PID reuse. */
function windowsProcesses(): Promise<WindowsProcess[]> {
  return new Promise((resolve, reject) => {
    execFile(
      windowsPowerShell,
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $null -ne $_.CreationDate } | Select-Object ProcessId,ParentProcessId,@{Name='Created';Expression={$_.CreationDate.ToUniversalTime().Ticks.ToString()}} | ConvertTo-Json -Compress",
      ],
      { windowsHide: true, timeout: 5000, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => {
        if (error) return reject(error);
        try {
          const parsed = JSON.parse(stdout);
          const rows = Array.isArray(parsed) ? parsed : [parsed];
          if (rows.some((row) => !Number.isInteger(row.ProcessId) || !Number.isInteger(row.ParentProcessId) || !/^\d+$/.test(row.Created)))
            throw new Error("Invalid process snapshot");
          resolve(rows);
        } catch (error) {
          reject(error);
        }
      },
    );
  });
}

/** Track while alive and recheck after exit; filesystem visibility is unrelated. */
export class AgentProcessTree {
  diagnostics?: ShutdownDiagnostics;
  private readonly descendants = new Map<number, string>();
  private pending: Promise<WindowsProcess[]> | undefined;
  private readonly timer: ReturnType<typeof setInterval> | undefined;
  private rootCreation: string | undefined;
  constructor(private readonly child: ChildProcess) {
    if (process.platform === "win32" && child.pid) {
      void this.capture().catch(() => {});
      this.timer = setInterval(() => {
        void this.capture().catch(() => {});
      }, 150);
    }
  }

  private capture(): Promise<WindowsProcess[]> {
    if (this.pending) return this.pending;
    this.pending = windowsProcesses()
      .then((rows) => {
        const root = rows.find((row) => row.ProcessId === this.child.pid);
        if (!this.rootCreation && root && this.child.exitCode === null && this.child.signalCode === null) this.rootCreation = root.Created;
        const parents = new Set(
          [...this.descendants.keys()].filter((pid) => {
            const current = rows.find((row) => row.ProcessId === pid);
            return !current || current.Created === this.descendants.get(pid);
          }),
        );
        if (!root || !this.rootCreation || root.Created === this.rootCreation) parents.add(this.child.pid!);
        let changed = true;
        while (changed) {
          changed = false;
          for (const row of rows) {
            if (row.ProcessId === this.child.pid || !parents.has(row.ParentProcessId) || parents.has(row.ProcessId)) continue;
            const parentCreated = row.ParentProcessId === this.child.pid ? this.rootCreation : this.descendants.get(row.ParentProcessId);
            if (parentCreated && BigInt(row.Created) < BigInt(parentCreated)) continue;
            this.descendants.set(row.ProcessId, row.Created);
            parents.add(row.ProcessId);
            changed = true;
          }
        }
        return rows;
      })
      .finally(() => {
        this.pending = undefined;
      });
    return this.pending;
  }

  async shutdown(): Promise<boolean> {
    clearInterval(this.timer);
    if (!this.child.pid) return true;
    if (process.platform !== "win32") {
      const result = await shutdownPosixGroup(this.child.pid);
      this.diagnostics = result.diagnostics;
      return result.confirmed;
    }
    try {
      if (this.pending) await this.pending;
      const deadline = Date.now() + 5000;
      do {
        const rows = await this.capture();
        const survivors = rows.filter(
          (row) =>
            (row.ProcessId === this.child.pid &&
              this.child.exitCode === null &&
              this.child.signalCode === null &&
              (!this.rootCreation || row.Created === this.rootCreation)) ||
            this.descendants.get(row.ProcessId) === row.Created,
        );
        if (!survivors.length) return true;
        this.diagnostics = {
          reason: "Windows process-tree members remain",
          processes: survivors.slice(0, 32).map((row) => ({ pid: row.ProcessId, state: "running" })),
        };
        for (const row of survivors) {
          // Snapshot immediately precedes kill; only tracked identities are selected.
          spawnSync(
            path.join(process.env.SystemRoot ?? "C:\\Windows", "System32/taskkill.exe"),
            ["/pid", String(row.ProcessId), "/T", "/F"],
            { shell: false, windowsHide: true, stdio: "ignore", timeout: 2000 },
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      } while (Date.now() < deadline);
    } catch {
      this.diagnostics = { reason: "Windows process snapshot unavailable", processes: [{ pid: this.child.pid, state: "unknown" }] };
      // Snapshot access can be denied (notably in the Codex sandbox). Still stop
      // the owned root/tree; lack of proof must never leave our agent running.
      spawnSync(path.join(process.env.SystemRoot ?? "C:\\Windows", "System32/taskkill.exe"), ["/pid", String(this.child.pid), "/T", "/F"], {
        shell: false,
        windowsHide: true,
        stdio: "ignore",
        timeout: 2000,
      });
      this.child.kill();
      await waitForAgentExit(this.child);
    }
    return false;
  }
}

export async function waitForAgentExit(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(done, 2000);
    function done() {
      clearTimeout(timer);
      child.removeListener("exit", done);
      resolve();
    }
    child.once("exit", done);
  });
}
