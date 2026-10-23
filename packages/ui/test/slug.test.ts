import { describe, expect, it } from "vitest";
import { slugify } from "../src/lib/slug";

describe("slugify", () => {
  it.each([
    ["Next.js", "nextjs"],
    ["C++", "c"],
    ["Lógica", "logica"],
    ["Strict TypeScript", "strict-typescript"],
    ["snake_case name", "snake-case-name"],
    ["  --Many   dashes--  ", "many-dashes"],
  ])("turns %j into %j", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });
});
