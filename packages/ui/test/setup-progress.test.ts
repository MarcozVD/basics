import { afterEach, describe, expect, it, vi } from "vitest";
import { readSetupFlag, setupProgress, setupStorageKey, writeSetupFlag } from "../src/lib/setup-progress";

afterEach(() => vi.unstubAllGlobals());

describe("first-run progress", () => {
  it("keeps missing API data unknown", () => {
    expect(setupProgress({ vaultLoaded: false })).toEqual([false, undefined, undefined, undefined]);
  });

  it("does not infer installation or approval from ordinary notes or detected clients", () => {
    expect(
      setupProgress({
        vaultLoaded: true,
        packs: [{ installed: null }],
        clients: [{ connected: false }],
        notes: [{ source: "manual" }, { source: "pack:core-layers@1.0.0" }],
      }),
    ).toEqual([true, false, false, false]);
  });

  it("completes only from installed packs, connected clients and approved agent notes", () => {
    expect(
      setupProgress({
        vaultLoaded: true,
        packs: [{ installed: "1.0.0" }],
        clients: [{ connected: true }],
        notes: [{ source: "agent:codex" }],
      }),
    ).toEqual([true, true, true, true]);
  });

  it("retains proof of a successful approval when its note is later removed", () => {
    expect(setupProgress({ vaultLoaded: true, notes: [], approvedBefore: true })[3]).toBe(true);
  });
});

describe("setup persistence", () => {
  it("scopes dismissal and approval proof independently to each vault", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    writeSetupFlag("vault-one", "dismissed");
    expect(readSetupFlag("vault-one", "dismissed")).toBe(true);
    expect(readSetupFlag("vault-two", "dismissed")).toBe(false);
    expect(readSetupFlag("vault-one", "approved")).toBe(false);
    writeSetupFlag("vault-one", "approved");
    expect(readSetupFlag("vault-one", "approved")).toBe(true);
    expect(setupStorageKey("vault-one", "dismissed")).not.toBe(setupStorageKey("vault-two", "dismissed"));
  });

  it("tolerates unavailable storage", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("disabled");
      },
      setItem: () => {
        throw new Error("disabled");
      },
    });
    expect(readSetupFlag("vault", "dismissed")).toBe(false);
    expect(() => writeSetupFlag("vault", "dismissed")).not.toThrow();
  });
});
