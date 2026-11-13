import { describe, expect, it } from "vitest";
import { snapshotKey } from "../../../scripts/demo/key.mjs";

describe("demo snapshot request keys", () => {
  it("normalizes method, origin, query order and nested JSON object order", async () => {
    const first = await snapshotKey("post", "/api/recommend?b=2&a=1", { layers: ["backend", "data"], options: { z: 1, a: 2 } });
    const second = await snapshotKey(
      "POST",
      "https://example.com/api/recommend?a=1&b=2#ignored",
      '{"options":{"a":2,"z":1},"layers":["backend","data"]}',
    );
    expect(first).toBe(second);
    expect(first).toMatch(/^POST \/api\/recommend\?a=1&b=2 [a-f0-9]{64}$/);
  });

  it("keeps methods, paths, query values and body values distinct", async () => {
    const keys = await Promise.all([
      snapshotKey("GET", "/api/notes"),
      snapshotKey("POST", "/api/notes"),
      snapshotKey("GET", "/api/inbox"),
      snapshotKey("GET", "/api/notes?type=tech"),
      snapshotKey("GET", "/api/notes?type=practice"),
      snapshotKey("POST", "/api/notes", {}),
      snapshotKey("POST", "/api/notes", null),
      snapshotKey("POST", "/api/notes", { layers: ["backend", "data"] }),
      snapshotKey("POST", "/api/notes", { layers: ["data", "backend"] }),
    ]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("normalizes encoding and repeated query parameters without losing values", async () => {
    expect(await snapshotKey("GET", "/api/search?q=hello%20world&type=tech&type=check")).toBe(
      await snapshotKey("GET", "/api/search?type=check&q=hello+world&type=tech", ""),
    );
    expect(await snapshotKey("GET", "/api/search?type=tech&type=tech")).not.toBe(await snapshotKey("GET", "/api/search?type=tech"));
  });
});
