import path from "node:path";
import type { VaultEvent } from "@marcozvd/basics-core";
import { watch } from "chokidar";

const ACTIVITY_FILE = ".basics/activity.jsonl";

/** Watches the vault and broadcasts debounced changes to SSE subscribers. */
export class EventHub {
  private watcher?: ReturnType<typeof watch>;
  private readyPromise: Promise<void> = Promise.resolve();
  private timer?: NodeJS.Timeout;
  private readonly pending = new Set<string>();
  private readonly subscribers = new Set<(event: VaultEvent) => void>();
  private readonly changeListeners = new Set<() => void>();

  constructor(private readonly root: string) {}

  start(): void {
    if (this.watcher) return;
    this.watcher = watch(this.root, {
      ignoreInitial: true,
      ignored: (p) => p.endsWith(".tmp") || this.ignoredBasics(p),
    });
    this.readyPromise = new Promise<void>((resolve) => {
      this.watcher?.once("ready", () => resolve());
    });
    for (const event of ["add", "change", "unlink"] as const) {
      this.watcher.on(event, (file: string) => this.collect(file));
    }
  }

  /** Resolves once the watcher has scanned the vault: changes after this point are seen. */
  ready(): Promise<void> {
    return this.readyPromise;
  }

  subscribe(fn: (event: VaultEvent) => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  /**
   * Called as soon as a note file changes, without the debounce the broadcast waits for: the vault
   * cache must not serve the old notes to a request that arrives while the change is still settling.
   */
  onChange(fn: () => void): () => void {
    this.changeListeners.add(fn);
    return () => this.changeListeners.delete(fn);
  }

  /** Broadcast an event produced outside the file watcher, such as embedding progress. */
  publish(event: VaultEvent): void {
    this.emit(event);
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
    const rel = this.relative(file);
    this.pending.add(rel);
    // A note changed: tell the cache right away. The broadcast below is debounced, but a request
    // that lands between the write and the flush must still see the new files.
    if (rel !== ACTIVITY_FILE) for (const fn of this.changeListeners) fn();
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
