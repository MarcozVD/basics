import fs from "node:fs";
import path from "node:path";
import { Vault, VaultNotFoundError } from "./vault.js";

/** A cheap description of the vault's note files, used to notice edits made outside the app. */
export interface VaultSignature {
  /** Number of `.md` files, inbox excluded (the inbox is read from disk on every call). */
  files: number;
  /** Total size in bytes, so an edit that keeps the file count still shows up. */
  bytes: number;
  /** Newest file mtime in milliseconds; the main signal. */
  newestMtimeMs: number;
  /** Hash of the sorted relative paths: a rename keeps size and mtime, but not the name. */
  pathsHash: number;
}

const INBOX_DIR = "inbox";

function noteFiles(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full !== path.join(dir, INBOX_DIR)) noteFiles(full, out);
      continue;
    }
    if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

/** FNV-1a over the sorted relative paths: cheap, and enough to notice a rename. */
function hashPaths(paths: string[]): number {
  let hash = 0x811c9dc5;
  for (const entry of paths.sort()) {
    for (let i = 0; i < entry.length; i++) {
      hash ^= entry.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    // Separator, so ["ab", "c"] and ["a", "bc"] do not hash the same.
    hash ^= 0x2f;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Walk the note files and stat each one; a missing root reads as an empty vault. */
export function vaultSignature(root: string): VaultSignature {
  const files = noteFiles(root);
  return aggregate(
    root,
    files,
    files.map((file) => {
      try {
        return fs.statSync(file);
      } catch {
        // Deleted between readdir and stat: the next check sees the final state.
        return undefined;
      }
    }),
  );
}

/**
 * The same signature with the stats in flight at once: on Windows a serial stat costs ~0.1 ms per
 * file (840 notes ~ 88 ms), while all of them together take ~20 ms. Tool calls use this one.
 */
export async function vaultSignatureAsync(root: string): Promise<VaultSignature> {
  const files = noteFiles(root);
  const stats = await Promise.all(files.map((file) => fs.promises.stat(file).catch(() => undefined)));
  return aggregate(root, files, stats);
}

function aggregate(root: string, files: string[], stats: (fs.Stats | undefined)[]): VaultSignature {
  const paths: string[] = [];
  let bytes = 0;
  let newestMtimeMs = 0;
  for (const [index, file] of files.entries()) {
    const stat = stats[index];
    if (!stat) continue;
    paths.push(path.relative(root, file).replace(/\\/g, "/"));
    bytes += stat.size;
    if (stat.mtimeMs > newestMtimeMs) newestMtimeMs = stat.mtimeMs;
  }
  return { files: paths.length, bytes, newestMtimeMs, pathsHash: hashPaths(paths) };
}

function sameSignature(a: VaultSignature | undefined, b: VaultSignature | undefined): boolean {
  return (
    a !== undefined &&
    b !== undefined &&
    a.files === b.files &&
    a.bytes === b.bytes &&
    a.pathsHash === b.pathsHash &&
    Math.round(a.newestMtimeMs) === Math.round(b.newestMtimeMs)
  );
}

export interface VaultCacheOptions {
  /**
   * Re-check the note files on every `get()` (count, total size, newest mtime), so a note edited by
   * an editor or a `git pull` shows up in the next call without a watcher. Costs one directory walk
   * per call, far below a full reload. Pass `false` where a file watcher drives `invalidate()`
   * instead, as the UI server does.
   *
   * @default true
   */
  verify?: boolean;
  /** Derived values kept per vault generation; the oldest is dropped past this. @default 64 */
  memoLimit?: number;
}

interface MemoEntry {
  generation: number;
  value: unknown;
}

/**
 * One in-memory `Vault` per root, loaded lazily and reused across requests and tool calls.
 *
 * Today every request parsed the whole vault from disk (~2.5 s on an 860-note vault). The cache
 * keeps that vault until it is known to be stale: either `invalidate()` (a watcher event or a
 * write made by the app itself) or, with `verify`, a changed file signature. A reload that throws
 * keeps the last good vault, so a file being written never wipes the catalog mid-request.
 */
export class VaultCache {
  private current?: Vault;
  private signature?: VaultSignature;
  private generation = 0;
  private fresh = false;
  /** `ensureFresh` just compared the files with disk: the calls that follow it can skip the check. */
  private verified = false;
  private readonly memoEntries = new Map<string, MemoEntry>();
  private readonly verify: boolean;
  private readonly memoLimit: number;

  constructor(
    readonly root: string,
    opts: VaultCacheOptions = {},
  ) {
    this.verify = opts.verify ?? true;
    this.memoLimit = Math.max(1, opts.memoLimit ?? 64);
  }

  /** Bumped on every reload: a value memoized for an older generation is rebuilt. */
  get version(): number {
    return this.generation;
  }

  /** The cached vault, reloaded when it is known to be stale. */
  get(): Vault {
    if (this.current && this.fresh) {
      // `ensureFresh` already compared the files with disk just before this call, so the (slower,
      // serial) check here would repeat it. Only `ensureFresh` sets that flag: leaving it set after
      // a check made here would hide later edits for the rest of the process.
      if (!this.verify || this.verified) return this.current;
      const signature = vaultSignature(this.root);
      if (sameSignature(signature, this.signature)) return this.current;
      return this.reload(signature);
    }
    return this.reload(this.verify ? vaultSignature(this.root) : undefined);
  }

  /**
   * Async variant of the staleness check `get()` makes, with the stats in flight at once (~6x
   * faster on Windows). Call it at the start of a request or tool call, then use `get()` freely.
   */
  async ensureFresh(): Promise<void> {
    const signature = await vaultSignatureAsync(this.root);
    if (!this.current || !this.fresh || !sameSignature(signature, this.signature)) this.reload(signature);
    // Either way the vault now matches disk, so the `get()` calls in this request/tool call skip
    // their own (slower, serial) check.
    this.verified = true;
  }

  /**
   * Mark the vault stale: the next `get()` reloads it from disk and derived values are rebuilt.
   * The server calls this from its watcher and right after every write it makes itself.
   */
  invalidate(): void {
    this.fresh = false;
    this.verified = false;
  }

  /** A value derived from the current vault (a graph, a note list, ...), cached per generation. */
  memo<T>(key: string, build: (vault: Vault) => T): T {
    const vault = this.get();
    const generation = this.generation;
    const hit = this.memoEntries.get(key);
    if (hit && hit.generation === generation) return hit.value as T;
    const value = build(vault);
    if (this.memoEntries.size >= this.memoLimit) {
      const oldest = this.memoEntries.keys().next().value;
      if (oldest !== undefined) this.memoEntries.delete(oldest);
    }
    this.memoEntries.set(key, { generation, value });
    return value;
  }

  /** Drop the cached vault and every derived value; the next call reloads from disk. */
  clear(): void {
    this.current = undefined;
    this.signature = undefined;
    this.fresh = false;
    this.verified = false;
    this.memoEntries.clear();
  }

  private reload(signature: VaultSignature | undefined): Vault {
    try {
      const vault = Vault.load(this.root);
      this.current = vault;
      this.signature = signature ?? (this.verify ? vaultSignature(this.root) : undefined);
      this.fresh = true;
      this.generation += 1;
      this.memoEntries.clear();
      return vault;
    } catch (error) {
      // A half-written vault (or a root that is briefly gone) must not replace the last good
      // one: keep it and retry on the next call. A vault that is really gone still reports
      // `VaultNotFoundError` as before, and the first load has nothing to fall back to.
      if (!this.current || error instanceof VaultNotFoundError) throw error;
      this.fresh = false;
      this.verified = false;
      return this.current;
    }
  }
}
