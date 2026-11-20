import { execFile } from "node:child_process";
import type { ShutdownDiagnostics } from "@marcozvd/basics-core/compare";

interface PosixProcess {
  pid: number;
  pgid: number;
  state: string;
}
export function parsePosixProcesses(stdout: string): PosixProcess[] {
  const lines = stdout.trim().split(/\r?\n/);
  return lines.map((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+([A-Za-z?][A-Za-z0-9?+<>=-]{0,15})\s*$/.exec(line);
    if (!match) throw new Error("Invalid process snapshot");
    const pid = Number(match[1]),
      pgid = Number(match[2]);
    if (!Number.isSafeInteger(pid) || !Number.isSafeInteger(pgid)) throw new Error("Invalid process identity");
    return { pid, pgid, state: match[3] };
  });
}

function processSnapshot(): Promise<string> {
  return new Promise((resolve, reject) => {
    // BSD/macOS and Linux support these fields. Avoid -g, whose selection
    // semantics differ between ps implementations, and never invoke a shell.
    execFile(
      "/bin/ps",
      ["-A", "-o", "pid=", "-o", "pgid=", "-o", "stat="],
      { encoding: "utf8", timeout: 1000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, LC_ALL: "C" } },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
  });
}

/** Only exit-capable members block shutdown. Zombie bookkeeping cannot read tests. */
export async function shutdownPosixGroup(
  pgid: number,
  options: { signal?: typeof process.kill; snapshot?: () => Promise<string>; timeoutMs?: number } = {},
): Promise<{ confirmed: boolean; diagnostics?: ShutdownDiagnostics }> {
  const signal = options.signal ?? process.kill;
  const snapshot = options.snapshot ?? processSnapshot;
  const deadline = Date.now() + (options.timeoutMs ?? 2000);
  let signalError: string | undefined;
  let processes: PosixProcess[] = [];
  const errorCode = (error: unknown) => {
    const code = (error as NodeJS.ErrnoException)?.code;
    return typeof code === "string" && /^[A-Z0-9_]+$/.test(code) ? code : "UNKNOWN";
  };
  try {
    signal(-pgid, "SIGKILL");
  } catch (error) {
    signalError = errorCode(error);
  }
  do {
    try {
      signal(-pgid, 0);
    } catch (error) {
      const code = errorCode(error);
      if (code === "ESRCH") return { confirmed: true };
      signalError = code;
      // Darwin may report EPERM for an extant group with no eligible live
      // members. Neither success nor EPERM distinguishes zombies from live code.
    }
    try {
      processes = parsePosixProcesses(await snapshot()).filter((row) => row.pgid === pgid);
    } catch (error) {
      return {
        confirmed: false,
        diagnostics: {
          reason: "POSIX process snapshot unavailable",
          signal_error: signalError,
          snapshot_error: errorCode(error),
          processes: [],
        },
      };
    }
    if (processes.every((row) => row.state.startsWith("Z"))) return { confirmed: true };
    if (Date.now() >= deadline) break;
    try {
      signal(-pgid, "SIGKILL");
    } catch (error) {
      signalError = errorCode(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  } while (Date.now() < deadline);
  return {
    confirmed: false,
    diagnostics: {
      reason: "Live POSIX process-group members remain",
      signal_error: signalError,
      processes: processes.filter((row) => !row.state.startsWith("Z")).slice(0, 32),
    },
  };
}
