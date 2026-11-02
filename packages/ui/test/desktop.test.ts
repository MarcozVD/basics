import { afterEach, describe, expect, it } from "vitest";
import { isDesktop, isMacos } from "../src/lib/desktop";

// vitest runs in Node here, so `window` stands in for a page: the browser case is an
// object without Tauri's internals, the desktop case one with them.
const scope = globalThis as { window?: unknown };

afterEach(() => {
  delete scope.window;
});

describe("isDesktop", () => {
  it("is false when there is no window (Node, workers)", () => {
    expect(isDesktop()).toBe(false);
  });

  it("is false in a browser: no Tauri internals are injected", () => {
    scope.window = {};
    expect(isDesktop()).toBe(false);
  });

  it("is true inside the desktop app, where Tauri injects its internals", () => {
    scope.window = { __TAURI_INTERNALS__: { invoke: () => {} } };
    expect(isDesktop()).toBe(true);
  });
});

describe("isMacos", () => {
  it("reads the platform from the user agent, not from Tauri", () => {
    scope.window = {};
    expect(isMacos()).toBe(false);
  });
});
