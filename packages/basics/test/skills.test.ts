import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { configSchema } from "@marcozvd/basics-core";
import { test } from "vitest";
import { classifySkill, firstParagraph, MAX_SKILLS, scanSkills } from "../src/skills.js";

function sandbox(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "basics-skills-"));
}

/** Write `<home>/<dir>/SKILL.md` with the given YAML frontmatter and body. */
function seedSkill(home: string, dir: string, frontmatter: string, body = "What it does."): string {
  const full = path.join(home, dir);
  fs.mkdirSync(full, { recursive: true });
  const file = path.join(full, "SKILL.md");
  fs.writeFileSync(file, `---\n${frontmatter}\n---\n\n${body}\n`);
  return full;
}

function scan(home: string, config = configSchema.parse({})) {
  return scanSkills({ home, config });
}

test("classifies the skill descriptions found on this machine", () => {
  const cases: Array<[string, string, string]> = [
    [
      "basics",
      "Use the Basics MCP server (tools like recommend_stack, get_stack_context, detect_stack, propose_note) to pick a project's tech stack from the user's own vault, follow its practices and checks while coding, and record what was learned. Use when starting a new project, choosing or changing technologies, working in a project that has STACK.md or basics.json, or when the user mentions Basics, their stack vault or their stack notes.",
      "workflow",
    ],
    [
      "caveman",
      "Ultra-compressed communication mode that cuts output tokens while keeping technical accuracy. Levels: lite, full, ultra and the wenyan variants. Use for /caveman, caveman mode, talk like caveman, be brief or less tokens.",
      "workflow",
    ],
    [
      "caveman-commit",
      "Ultra-compressed commit message generator. Cuts noise from commit messages while preserving intent and reasoning. Conventional Commits format. Subject 50 chars, body only when why is not obvious. Use when user says write a commit, commit message, generate commit, /commit, or invokes /caveman-commit.",
      "workflow",
    ],
    [
      "caveman-compress",
      "Compress natural language memory files (CLAUDE.md, todos, preferences) into caveman format to save input tokens. Preserves all technical substance, code, URLs, and structure. Compressed version overwrites the original file. Human-readable backup saved as FILE.original.md.",
      "workflow",
    ],
    [
      "impeccable",
      "Use when the user wants to design, redesign, shape, critique, audit, polish, clarify, distill, harden, optimize, adapt, animate, colorize, extract, or otherwise improve a frontend interface. Covers websites, landing pages, dashboards, product UI, app shells, components, forms, settings, onboarding, and empty states. Handles UX review, visual hierarchy, information architecture, cognitive load, accessibility, performance, responsive behavior, theming, anti-patterns, typography, fonts, spacing, layout, alignment, color, motion, micro-interactions, UX copy, error states, edge cases, i18n, and reusable design systems or tokens.",
      "frontend",
    ],
    [
      "gsap-scrolltrigger",
      "GSAP animation reference for HyperFrames. Covers gsap.to(), from(), fromTo(), easing, stagger, defaults, timelines, and performance. Use when writing GSAP animations in HyperFrames compositions.",
      "frontend",
    ],
    [
      "ui-ux-pro-max",
      "Senior UI/UX designer and frontend developer. Use for beautiful interfaces, design systems, branding and landing pages.",
      "frontend",
    ],
    [
      "security-audit",
      "Security guidance and vulnerability review for codebases, APIs, services, CLI tools, libraries, and daemons. Use for security questions, focused reviews, vulnerability research, security audits, or pen tests. Run the complete workflow only for explicit codebase audit or pen-test requests, full/comprehensive/end-to-end reviews, or requested report artifacts.",
      "security",
    ],
    ["playwright-cli", "Automate browser interactions, test web pages and work with Playwright tests.", "testing"],
    [
      "graphify",
      "Use for any question about a codebase, its architecture, file relationships, or project content. Turns any input into a persistent knowledge graph with god nodes, community detection, and query/path/explain tools.",
      "data",
    ],
    [
      "legal:contract-review",
      "Review contracts, terms of service, privacy policies and other legal documents. Use when the user needs a contract summary.",
      "docs",
    ],
    [
      "find-skills",
      "Helps users discover and install agent skills when they ask questions like how do I do X, find a skill for X, or express interest in extending capabilities. This skill should be used when the user is looking for functionality that might exist as an installable skill.",
      "workflow",
    ],
    [
      "testsprite-verify",
      "Run the relevant TestSprite tests against a change and inspect any failure artifacts before reporting the work as done.",
      "testing",
    ],
    [
      "limpieza",
      "Borra los archivos temporales y de build regenerables de un repo (target, dist, test-results, logs de build) y deja solo lo de desarrollo. Usar cuando el usuario escriba /limpieza o pida limpiar la carpeta del proyecto.",
      "devops",
    ],
    [
      "design-taste-frontend",
      "tasteskill v2, the anti-slop frontend skill. Art direction for websites, distilled from a study of 247 curated gallery sites. Use whenever you build, design, redesign, restyle, polish or review a landing page, marketing site, portfolio, product page or any public-facing web page.",
      "frontend",
    ],
  ];

  for (const [name, description, area] of cases) {
    assert.deepEqual(classifySkill({ name, description }), { area, source: "keywords" }, name);
  }
});

test("frontmatter category and tags win over keywords", () => {
  assert.deepEqual(classifySkill({ name: "acme", description: "A CSS layout helper", category: "Security" }), {
    area: "security",
    source: "frontmatter",
  });
  assert.deepEqual(classifySkill({ name: "acme", description: "Runs browser checks", tags: ["qa"] }), {
    area: "testing",
    source: "frontmatter",
  });
  assert.deepEqual(classifySkill({ name: "acme", description: "Runs browser checks", tags: ["frontend-design"] }), {
    area: "frontend",
    source: "frontmatter",
  });
  // Unknown category falls through to keywords instead of guessing.
  assert.deepEqual(classifySkill({ name: "acme", description: "A React component library", category: "misc" }), {
    area: "frontend",
    source: "keywords",
  });
  assert.deepEqual(classifySkill({ name: "acme", description: "Nothing that matches the table" }), {
    area: "other",
    source: "none",
  });
});

test("firstParagraph skips headings and reads the first plain block", () => {
  assert.equal(firstParagraph("# Title\n\nFirst paragraph here.\nStill first.\n\nSecond."), "First paragraph here. Still first.");
  assert.equal(firstParagraph("\n\n- item\n\nText after a list."), "Text after a list.");
  assert.equal(firstParagraph(""), "");
});

test("scans every source shape into one merged inventory", () => {
  const home = sandbox();
  seedSkill(home, ".claude/skills/basics", "name: basics\ndescription: Pick a project's tech stack from the vault.");
  seedSkill(home, ".agents/skills/impeccable", "name: impeccable\ndescription: Improve a frontend interface.");

  // A junction into the shared store: same skill, two agents, one row.
  const codexSkills = path.join(home, ".codex", "skills");
  fs.mkdirSync(codexSkills, { recursive: true });
  fs.symlinkSync(path.join(home, ".agents", "skills", "impeccable"), path.join(codexSkills, "impeccable"), "junction");

  // The same name and content copied into two agent folders also becomes one row.
  const copy = seedSkill(home, ".claude/skills/shared-copy", "name: shared-copy\ndescription: Shared across agents.");
  seedSkill(home, ".agents/skills/shared-copy", "name: shared-copy\ndescription: Shared across agents.");

  // A user-scoped plugin, plus a project-scoped one that must not show up.
  const pluginRoot = path.join(home, ".claude", "plugins", "cache", "gsap-skills", "gsap-skills", "1.0.0");
  seedSkill(pluginRoot, "skills/gsap-core", "name: gsap-core\ndescription: GSAP animation reference.");
  const projectRoot = path.join(home, ".claude", "plugins", "cache", "project", "project", "1.0.0");
  seedSkill(projectRoot, "skills/project-only", "name: project-only\ndescription: Only for one project.");
  const manifest = path.join(home, ".claude", "plugins", "installed_plugins.json");
  fs.mkdirSync(path.dirname(manifest), { recursive: true });
  fs.writeFileSync(
    manifest,
    JSON.stringify({
      version: 2,
      plugins: {
        "gsap-skills@gsap-skills": [{ scope: "user", installPath: pluginRoot, version: "1.0.0" }],
        "project@project": [{ scope: "project", projectPath: copy, installPath: projectRoot, version: "1.0.0" }],
      },
    }),
  );

  // Broken YAML and an oversize file are rows with an error, never a failed scan.
  seedSkill(home, ".claude/skills/broken", "name: [unclosed\ndescription: nope");
  const huge = path.join(home, ".claude", "skills", "huge");
  fs.mkdirSync(huge, { recursive: true });
  fs.writeFileSync(path.join(huge, "SKILL.md"), `---\nname: huge\n---\n\n${"x".repeat(300 * 1024)}`);

  const result = scan(home);

  assert.deepEqual(
    result.agents.map((agent) => [agent.id, agent.detected]),
    [
      ["claude-code", true],
      ["opencode", false],
      ["codex", true],
      ["shared", true],
    ],
  );
  assert.deepEqual(result.agents[0].dirs, ["~/.claude/skills", "~/.claude/plugins/cache/gsap-skills/gsap-skills/1.0.0/skills"]);

  const byName = new Map(result.skills.map((skill) => [skill.name, skill]));
  assert.equal(byName.size, result.skills.length, "names are unique in this fixture");

  const basics = byName.get("basics");
  assert.ok(basics);
  assert.deepEqual(basics.agents, ["claude-code"]);
  assert.equal(basics.path, "~/.claude/skills/basics/SKILL.md");
  assert.equal(basics.area, "workflow");
  assert.equal(basics.areaSource, "keywords");
  assert.equal(basics.summary, basics.description);

  const impeccable = byName.get("impeccable");
  assert.ok(impeccable);
  assert.deepEqual(impeccable.agents, ["codex", "shared"]);
  assert.equal(impeccable.area, "frontend");

  assert.deepEqual(byName.get("shared-copy")?.agents, ["claude-code", "shared"]);

  const gsap = byName.get("gsap-core");
  assert.ok(gsap);
  assert.equal(gsap.plugin, "gsap-skills");
  assert.deepEqual(gsap.agents, ["claude-code"]);
  assert.equal(gsap.area, "frontend");
  assert.equal(byName.has("project-only"), false);

  const broken = byName.get("broken");
  assert.ok(broken?.error);
  assert.equal(broken.description, "");

  const hugeRow = byName.get("huge");
  assert.match(hugeRow?.error ?? "", /256/);

  // Areas render in the documented order.
  const order = result.skills.map((skill) => skill.area);
  const first = (area: string) => order.indexOf(area);
  assert.ok(first("frontend") < first("workflow"));
  assert.ok(first("workflow") <= order.length - 1);
});

test("a ---js frontmatter is refused, listed with an error, and never evaluated", () => {
  const home = sandbox();
  const dir = path.join(home, ".claude", "skills", "evil");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), "---js\nglobalThis.__basicsSkillsEval = true;\n---\n\nBody.\n");

  const globals = globalThis as unknown as Record<string, unknown>;
  globals.__basicsSkillsEval = false;
  try {
    const result = scan(home);
    assert.equal(globals.__basicsSkillsEval, false, "frontmatter must never be evaluated");
    assert.equal(result.skills.length, 1);
    assert.equal(result.skills[0].name, "evil");
    assert.match(result.skills[0].error ?? "", /not supported/);
  } finally {
    delete globals.__basicsSkillsEval;
  }
});

test("area overrides come from the config and invalid values are ignored", () => {
  const home = sandbox();
  seedSkill(home, ".claude/skills/impeccable", "name: impeccable\ndescription: Improve a frontend interface.");

  const overridden = scan(home, configSchema.parse({ skills: { areas: { impeccable: "testing" } } }));
  assert.equal(overridden.skills[0].area, "testing");
  assert.equal(overridden.skills[0].areaSource, "override");

  const invalid = scan(home, configSchema.parse({ skills: { areas: { impeccable: "nonsense" } } }));
  assert.equal(invalid.skills[0].area, "frontend");
  assert.equal(invalid.skills[0].areaSource, "keywords");
});

test("stops at the skill cap", () => {
  const home = sandbox();
  const dir = path.join(home, ".claude", "skills");
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < MAX_SKILLS + 5; i++) {
    const folder = path.join(dir, `skill-${String(i).padStart(3, "0")}`);
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, "SKILL.md"), `---\nname: skill-${i}\ndescription: Number ${i}.\n---\n`);
  }
  assert.equal(scan(home).skills.length, MAX_SKILLS);
});

test("a home without agent folders scans to nothing", () => {
  const result = scan(sandbox());
  assert.deepEqual(result.skills, []);
  assert.deepEqual(
    result.agents.map((agent) => agent.detected),
    [false, false, false, false],
  );
  assert.deepEqual(
    result.agents.map((agent) => agent.dirs),
    [[], [], [], []],
  );
});
