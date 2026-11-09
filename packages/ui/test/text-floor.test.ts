import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const FLOOR_PX = 11;
const SIZE = /text-\[(\d+(?:\.\d+)?)px\]/g;
const SOURCE = /\.(?:tsx?|css)$/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    // Vendored motion primitives keep their own type scale.
    if (entry.isDirectory()) {
      return entry.name === "motion" && dir.endsWith(join("src", "components")) ? [] : sourceFiles(path);
    }
    return SOURCE.test(entry.name) ? [path] : [];
  });
}

describe("type scale", () => {
  it("keeps every arbitrary text size at or above 11px", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(srcDir)) {
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, index) => {
        for (const match of line.matchAll(SIZE)) {
          if (Number(match[1]) < FLOOR_PX) {
            offenders.push(`${relative(srcDir, file)}:${index + 1} ${match[0]}`);
          }
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});
