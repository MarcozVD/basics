import path from "node:path";
import type { VaultEvent } from "@marcozvd/basics-core";
import { watch } from "chokidar";

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
      ignored: (p) => p.endsWith(".tmp") || /[\\/]\.basics([\\/]|$)/.test(p),
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

  private collect(file: string): void {
    this.pending.add(path.relative(this.root, file).replace(/\\/g, "/"));
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 150);
  }

  private flush(): void {
    this.timer = undefined;
    const paths = [...this.pending];
    this.pending.clear();
    if (!paths.length) return;
    const event: VaultEvent = { type: "vault", paths };
    for (const fn of this.subscribers) fn(event);
  }
}
