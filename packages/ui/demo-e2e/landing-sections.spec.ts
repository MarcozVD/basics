import fs from "node:fs";
import { expect, test } from "@playwright/test";

const transcripts = JSON.parse(fs.readFileSync(new URL("../../../scripts/demo/transcripts.json", import.meta.url), "utf8"));

test("each section renders its app part, graph stays lazy, approval works and note focus stays shared", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    (window as unknown as { __BASICS_E2E__: boolean }).__BASICS_E2E__ = true;
  });
  const errors: string[] = [];
  const graphRequests: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("request", (r) => {
    if (r.url().includes("cytoscape")) graphRequests.push(r.url());
  });
  await page.goto("/basics/");
  await expect(page.locator('[data-testid="landing-window"]')).toHaveAttribute("data-state", "live", { timeout: 20000 });
  expect(graphRequests).toEqual([]);
  const recommendPart = page.locator('.landing-readme .app-part[data-part="recommend"]');
  await recommendPart.scrollIntoViewIfNeeded();
  await expect(recommendPart).toHaveAttribute("data-state", "live", { timeout: 20000 });
  const recommend = page.frameLocator('iframe[title="Interactive Basics recommend demo"]');
  for (const entry of transcripts.entries.filter((e: { kind: string }) => e.kind === "scenario"))
    await expect(recommend.getByRole("button", { name: entry.label.en, exact: true })).toBeVisible();
  await recommend.getByRole("textbox", { name: "Describe your project", exact: true }).fill("Python REST API");
  await recommend.getByRole("button", { name: "Show example", exact: true }).click();
  await expect(recommend.locator("[data-scenario]")).toHaveAttribute("data-scenario", "python-api");
  expect(graphRequests).toEqual([]);
  const proposalPart = page.locator('.landing-readme .app-part[data-part="proposal"]');
  await proposalPart.scrollIntoViewIfNeeded();
  await expect(proposalPart).toHaveAttribute("data-state", "live", { timeout: 20000 });
  const proposal = page.frameLocator('iframe[title="Interactive Basics proposal demo"]');
  await proposal.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(proposal.getByRole("status")).toHaveText("Approved");
  await expect(page.getByRole("img", { name: "The Basics review loop", exact: true })).toBeVisible();
  const parts = page.getByTestId("note-parts");
  await parts.scrollIntoViewIfNeeded();
  for (const part of await parts.locator(".app-part").all()) await expect(part).toHaveAttribute("data-state", "live", { timeout: 20000 });
  expect(graphRequests.length).toBeGreaterThan(0);
  const note = page.frameLocator('iframe[title="Interactive Basics note demo"]');
  const graph = page.frameLocator('iframe[title="Interactive Basics graph demo"]');
  await expect(note.getByRole("heading", { name: "Next.js", exact: true }).first()).toBeVisible();
  await expect(graph.getByTestId("local-graph-canvas")).toHaveAttribute("aria-label", "Knowledge graph: 8 notes, 16 links");
  await note.getByRole("link", { name: "React", exact: true }).first().click();
  await expect.poll(() => graph.locator("body").evaluate(() => location.search)).toContain("focus=react");
  await graph.locator("body").evaluate(() => {
    const cy = (window as unknown as { __basicsCy: { getElementById: (id: string) => { emit: (type: string) => void } } }).__basicsCy;
    cy.getElementById("typescript").emit("tap");
  });
  await expect(note.getByRole("heading", { name: "TypeScript", exact: true }).first()).toBeVisible();
  const boxes = await parts.locator(".app-part").evaluateAll((elements) =>
    elements.map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, right: r.right, y: r.y };
    }),
  );
  expect(boxes[0].right).toBeLessThanOrEqual(boxes[1].x);
  expect(Math.abs(boxes[0].y - boxes[1].y)).toBeLessThan(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440);
  expect(errors).toEqual([]);
});

test("text transcripts use generated answers, keep export artifact, and mobile parts load only on tap", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/basics/");
  await expect(page.locator(".app-part")).toHaveCount(5);
  await expect(page.locator("iframe")).toHaveCount(0);
  for (const id of ["basics-connect", "basics-check"]) {
    const entry = transcripts.entries.find((e: { id: string }) => e.id === id);
    const heading = page.locator(id === "basics-connect" ? "#your-agents" : "#your-checks");
    await heading.scrollIntoViewIfNeeded();
    const transcript = heading.locator("..").locator(".agent-transcript");
    await transcript.scrollIntoViewIfNeeded();
    await expect(transcript).toHaveAttribute("data-state", "done");
    await expect(transcript.locator(".agent-transcript-command > code:last-child")).toHaveText(`> ${entry.command.en}`);
    await expect(transcript.locator(".agent-transcript-answer")).toHaveText(entry.answerLines.en);
    await expect(transcript.locator(".agent-transcript-answer").first()).toHaveCSS("animation-name", "transcript-answer-still");
    await expect(transcript.locator(".agent-transcript-answer").first()).toHaveCSS("animation-duration", "0.001s");
  }
  const exportTranscript = page.locator("#your-rules").locator("..").locator(".agent-transcript");
  await exportTranscript.scrollIntoViewIfNeeded();
  await expect(exportTranscript).toHaveAttribute("data-state", "done");
  await expect(exportTranscript).toContainText("STACK.md");
  await expect(page.locator(".landing-file-preview")).toHaveAttribute("open", "");
  await expect(page.locator("iframe")).toHaveCount(0);
  const recommend = page.locator('.landing-readme .app-part[data-part="recommend"]');
  await recommend.scrollIntoViewIfNeeded();
  await expect(recommend).toHaveAttribute("data-state", "idle");
  await recommend.getByRole("button", { name: "Try it", exact: true }).click();
  await expect(recommend).toHaveAttribute("data-state", "live", { timeout: 20000 });
  await expect(page.locator("iframe")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test("phone hero tap opens the matching part at a readable native mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/basics/");
  const hero = page.getByTestId("landing-hero");
  await hero.getByRole("button", { name: "Mobile app", exact: true }).click();
  await expect(hero.locator("iframe")).toHaveCount(0);
  await hero.getByRole("button", { name: "Try it", exact: true }).click();
  await expect(hero.getByTestId("landing-window")).toHaveAttribute("data-state", "live", { timeout: 20000 });
  const frame = page.frameLocator('iframe[title="Interactive Basics app demo"]');
  await expect(frame.locator("[data-scenario]")).toHaveAttribute("data-scenario", "mobile-app");
  expect(await frame.locator("body").evaluate(() => window.innerWidth)).toBeLessThanOrEqual(390);
  await expect(hero.locator("iframe")).toHaveCSS("transform", "none");
});
