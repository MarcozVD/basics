import path from "node:path";
import type { VaultEvent } from "@marcozvd/basics-core";
import { watch } from "chokidar";

const ACTIVITY_FILE = ".basics/activity.jsonl";

/** Watches the vault and broadcasts debounced changes to SSE subscribers. */
export class EventHub {
  private watcher?: ReturnType<typeof watch>;
  private timer?: NodeJS.Timeout;
  private readonly pending = new Set<string>();
  private readonly subscribers = new Set<(event: VaultEvent) => void>();

  constructor(private readonly root: string) {}

  start(): void {
    if (this.watcher) return;
    this.watcher = watch(this.root, {
      ignoreInitial: true,
      ignored: (p) => p.endsWith(".tmp") || this.ignoredBasics(p),
    });
    for (const event of ["add", "change", "unlink"] as const) {
      this.watcher.on(event, (file: string) => this.collect(file));
    }
  }

  subscribe(fn: (event: VaultEvent) => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  async close(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.pending.clear();
    await this.watcher?.close();
    this.watcher = undefined;
    this.subscribers.clear();
  }

  /** Keep watching the `.basics` folder itself, but only its activity log is interesting. */
  private ignoredBasics(file: string): boolean {
    const rel = this.relative(file);
    if (rel === ".basics") return false;
    return rel.startsWith(".basics/") && rel !== ACTIVITY_FILE;
  }

  private relative(file: string): string {
    return path.relative(this.root, file).replace(/\\/g, "/");
  }

  private collect(file: string): void {
    this.pending.add(this.relative(file));
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 150);
  }

  private flush(): void {
    this.timer = undefined;
    const paths = [...this.pending];
    this.pending.clear();
    if (!paths.length) return;
    const activity = paths.includes(ACTIVITY_FILE);
    const vaultPaths = paths.filter((p) => p !== ACTIVITY_FILE);
    if (vaultPaths.length) this.emit({ type: "vault", paths: vaultPaths });
    if (activity) this.emit({ type: "activity" });
  }

  private emit(event: VaultEvent): void {
    for (const fn of this.subscribers) fn(event);
  }
}
