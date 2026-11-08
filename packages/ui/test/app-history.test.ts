import { NavigationType } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  canGoBack,
  canGoForward,
  recordCurrentLocation,
  recordNavigation,
  recordPop,
  resetAppHistory,
  saveScroll,
  scrollFor,
} from "../src/lib/app-history";

// Vitest runs in Node: `window` is a small stand-in for the bits the mirror reads, so these
// tests exercise the real store, persistence and browser indexes without a browser.
interface FakeBrowser {
  history: { state: unknown };
  location: { pathname: string; search: string };
  sessionStorage: { getItem(key: string): string | null; setItem(key: string, value: string): void };
}

interface StoredEntry {
  key: string;
  pathname: string;
  search: string;
  scroll: number;
  idx?: number;
}

interface StoredHistory {
  entries: StoredEntry[];
  index: number;
}

const STORAGE_KEY = "basics:app-history";
const scope = globalThis as { window?: unknown };
let saved: Map<string, string>;
let fake: FakeBrowser;

beforeEach(() => {
  saved = new Map();
  fake = {
    history: { state: null },
    location: { pathname: "/", search: "" },
    sessionStorage: {
      getItem: (key) => saved.get(key) ?? null,
      setItem: (key, value) => {
        saved.set(key, value);
      },
    },
  };
  scope.window = fake;
  resetAppHistory();
});

afterEach(() => {
  delete scope.window;
});

function stored(): StoredHistory {
  const raw = saved.get(STORAGE_KEY);
  if (!raw) throw new Error("nothing persisted");
  return JSON.parse(raw) as StoredHistory;
}

function keys(): string[] {
  return stored().entries.map((entry) => entry.key);
}

/** One router navigation: set the browser index (or omit it, as an older session does), then record. */
function navigate(key: string, idx: number | undefined, navigationType: NavigationType, pathname = `/${key}`, search = ""): void {
  fake.history.state = idx === undefined ? null : { idx };
  recordNavigation(key, pathname, search, navigationType);
}

describe("recordNavigation", () => {
  it("records a push at the end and a replace in place", () => {
    navigate("a", 0, NavigationType.Push, "/a", "?x=1");
    navigate("b", 1, NavigationType.Push, "/b", "?x=2");

    expect(keys()).toEqual(["a", "b"]);
    expect(stored().index).toBe(1);
    expect(canGoBack()).toBe(true);
    expect(canGoForward()).toBe(false);

    navigate("b", 1, NavigationType.Replace, "/b", "?x=3");

    expect(keys()).toEqual(["a", "b"]);
    expect(stored().entries[1]?.search).toBe("?x=3");
    expect(canGoBack()).toBe(true);
    expect(canGoForward()).toBe(false);
  });

  it("records a pop to a known entry without dropping the forward stack", () => {
    navigate("a", 0, NavigationType.Push);
    navigate("b", 1, NavigationType.Push);
    navigate("c", 2, NavigationType.Push);

    navigate("b", 1, NavigationType.Pop);

    expect(keys()).toEqual(["a", "b", "c"]);
    expect(stored().index).toBe(1);
    expect(canGoBack()).toBe(true);
    expect(canGoForward()).toBe(true);
  });

  it("inserts a pop to an unknown key at its browser index and keeps the forward stack", () => {
    // Two pushes outran React: the router is at index 2 and this mirror never saw index 1.
    navigate("a", 0, NavigationType.Push);
    navigate("c", 2, NavigationType.Push);

    // Back lands on the entry the router never rendered; it belongs between a and c.
    navigate("b", 1, NavigationType.Pop);

    expect(keys()).toEqual(["a", "b", "c"]);
    expect(stored().index).toBe(1);
    expect(canGoForward()).toBe(true);
  });

  it("drops the forward stack when a push follows a back", () => {
    navigate("a", 0, NavigationType.Push);
    navigate("b", 1, NavigationType.Push);
    navigate("c", 2, NavigationType.Push);
    navigate("b", 1, NavigationType.Pop);

    navigate("d", 2, NavigationType.Push);

    expect(keys()).toEqual(["a", "b", "d"]);
    expect(stored().index).toBe(2);
    expect(canGoForward()).toBe(false);
  });

  it("falls back to cursor order for entries without a browser index", () => {
    navigate("a", undefined, NavigationType.Push);
    navigate("b", undefined, NavigationType.Push);

    // An unknown key on a pop inserts at the cursor and keeps the entry after it.
    navigate("x", undefined, NavigationType.Pop);

    expect(keys()).toEqual(["a", "x", "b"]);
    expect(stored().index).toBe(1);
    expect(canGoForward()).toBe(true);

    // A replace without an index rewrites the entry the cursor sits on and keeps the forward stack.
    navigate("y", undefined, NavigationType.Replace);

    expect(keys()).toEqual(["a", "y", "b"]);
    expect(stored().index).toBe(1);
    expect(canGoForward()).toBe(true);

    // A push without an index drops everything ahead of the cursor.
    navigate("z", undefined, NavigationType.Push);

    expect(keys()).toEqual(["a", "y", "z"]);
    expect(stored().index).toBe(2);
    expect(canGoForward()).toBe(false);
  });

  it("trims the oldest entries past MAX_ENTRIES and keeps the cursor valid", () => {
    navigate("first", 0, NavigationType.Push);
    saveScroll("first", 42);

    for (let idx = 1; idx <= 100; idx += 1) navigate(`k${idx}`, idx, NavigationType.Push);

    expect(stored().entries).toHaveLength(100);
    expect(keys()[0]).toBe("k1");
    expect(scrollFor("first")).toBe(0);
    expect(stored().index).toBe(99);
    expect(canGoBack()).toBe(true);
    expect(canGoForward()).toBe(false);

    // One more push trims again and still leaves the cursor inside the stack.
    navigate("k101", 101, NavigationType.Push);

    expect(stored().entries).toHaveLength(100);
    expect(stored().index).toBe(99);
    expect(canGoForward()).toBe(false);
  });
});

describe("recordCurrentLocation", () => {
  it("records the entry the browser is on before a history move", () => {
    fake.history.state = { key: "deep", idx: 3 };
    fake.location = { pathname: "/inbox", search: "?p=fastapi" };

    recordCurrentLocation();

    expect(stored().entries).toEqual([{ key: "deep", pathname: "/inbox", search: "?p=fastapi", scroll: 0, idx: 3 }]);
    expect(stored().index).toBe(0);
  });

  it("does nothing when the browser state has no key", () => {
    fake.history.state = null;
    recordCurrentLocation();

    fake.history.state = { idx: 2 };
    recordCurrentLocation();

    expect(stored().entries).toEqual([]);
  });
});

describe("recordPop", () => {
  it("ignores a missing key", () => {
    navigate("a", 0, NavigationType.Push);

    recordPop(null, "/x", "");
    recordPop(undefined, "/y", "");

    expect(keys()).toEqual(["a"]);
  });

  it("records a real pop", () => {
    navigate("a", 0, NavigationType.Push);
    fake.history.state = { idx: 1 };

    recordPop("b", "/b", "?q=1");

    expect(keys()).toEqual(["a", "b"]);
    expect(stored().index).toBe(1);
  });
});
