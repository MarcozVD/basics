import { describe, expect, it } from "vitest";
import { TEMPLATES } from "../src/lib/fields";

describe("new-note templates", () => {
  it("builds a layer and omits an empty description", () => {
    expect(TEMPLATES.layer({ title: "Ops" })).toMatchObject({
      type: "layer",
      title: "Ops",
      tags: [],
      source: "manual",
    });
    expect(TEMPLATES.layer({ title: "Ops" })).not.toHaveProperty("description");
    expect(TEMPLATES.layer({ title: "Ops", description: "  " })).not.toHaveProperty("description");
    expect(TEMPLATES.layer({ title: "Ops", description: " How we ship " })).toMatchObject({
      description: "How we ship",
    });
  });

  it("builds a tech with key and more fields", () => {
    expect(TEMPLATES.tech({ title: "Drizzle" })).toMatchObject({
      type: "tech",
      kind: "framework",
      layer: "backend",
      use_when: [],
      avoid_when: [],
      performs_best: [],
      related: [],
      practices: [],
      checks: [],
    });

    const tech = TEMPLATES.tech({
      title: "Drizzle",
      kind: "library",
      layer: ["backend", "data"],
      use_when: ["Typed SQL"],
      avoid_when: ["MongoDB"],
      version: "0.44",
      language: "typescript",
    });
    expect(tech).toMatchObject({
      type: "tech",
      kind: "library",
      layer: ["backend", "data"],
      use_when: ["Typed SQL"],
      avoid_when: ["MongoDB"],
      version: "0.44",
      language: "typescript",
    });
    expect(tech).not.toHaveProperty("description");
  });

  it("builds a practice with applies_to and version bounds", () => {
    const practice = TEMPLATES.practice({
      title: "Strict request validation",
      applies_to: ["fastapi", "react"],
      since: "1.0",
      until: "2.0",
    });
    expect(practice).toMatchObject({
      type: "practice",
      title: "Strict request validation",
      applies_to: ["fastapi", "react"],
      since: "1.0",
      until: "2.0",
    });
    expect(TEMPLATES.practice({ title: "Plain" })).toMatchObject({ applies_to: [] });
    expect(TEMPLATES.practice({ title: "Plain", since: " ", until: "" })).not.toHaveProperty("since");
  });

  it("builds a check with kind and command", () => {
    expect(TEMPLATES.check({ title: "Lint" })).toMatchObject({
      type: "check",
      kind: "test",
      applies_to: [],
    });
    expect(TEMPLATES.check({ title: "Lint" })).not.toHaveProperty("command");

    expect(
      TEMPLATES.check({
        title: "Lint the UI",
        kind: "lint",
        applies_to: ["react"],
        command: "npm run lint",
        since: "1.0",
        until: "2.0",
      }),
    ).toMatchObject({
      type: "check",
      kind: "lint",
      applies_to: ["react"],
      command: "npm run lint",
      since: "1.0",
      until: "2.0",
    });
  });

  it("builds a profile with use_when and stack", () => {
    expect(TEMPLATES.profile({ title: "ML API" })).toMatchObject({
      type: "profile",
      use_when: [],
      stack: {},
    });

    expect(
      TEMPLATES.profile({
        title: "ML API",
        description: "Serves models",
        use_when: ["Inference over HTTP"],
        stack: { backend: ["fastapi"], testing: ["pytest"] },
      }),
    ).toMatchObject({
      type: "profile",
      description: "Serves models",
      use_when: ["Inference over HTTP"],
      stack: { backend: ["fastapi"], testing: ["pytest"] },
    });
  });

  it("builds a project with active status and optional fields", () => {
    expect(TEMPLATES.project({ title: "Gamma App" })).toMatchObject({
      type: "project",
      status: "active",
      stack: {},
      lessons: [],
    });
    expect(TEMPLATES.project({ title: "Gamma App" })).not.toHaveProperty("path");

    expect(
      TEMPLATES.project({
        title: "Gamma App",
        description: "Internal dashboard",
        path: "/home/me/code/gamma",
        status: "paused",
        profile: "ml-api",
        reason: "Chosen for its typed API",
        stack: { frontend: ["react"] },
      }),
    ).toMatchObject({
      type: "project",
      description: "Internal dashboard",
      path: "/home/me/code/gamma",
      status: "paused",
      profile: "ml-api",
      reason: "Chosen for its typed API",
      stack: { frontend: ["react"] },
    });
  });

  it("never writes empty strings for text options", () => {
    for (const build of Object.values(TEMPLATES)) {
      const data = build({
        title: "Note",
        description: " ",
        version: "",
        language: "",
        command: "",
        path: "",
        profile: "",
        reason: "",
        since: "",
        until: "",
      }) as Record<string, unknown>;
      for (const key of ["description", "version", "language", "command", "path", "profile", "reason", "since", "until"]) {
        expect(data[key], `${String(data.type)}.${key}`).not.toBe("");
      }
    }
  });
});
