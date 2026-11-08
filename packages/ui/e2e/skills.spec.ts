import { expect, test } from "@playwright/test";

const section = (area: string) => `section[aria-labelledby="skills-area-${area}"]`;

test("lists the installed skills by area, in the fixed order", async ({ page }) => {
  await page.goto("/skills");

  await expect(page.getByRole("heading", { name: "Skills", level: 1 })).toBeVisible();
  // Skills has data, so its description sits behind the header's `?`, not under the title.
  await expect(page.getByRole("button", { name: "Help" })).toBeVisible();
  await expect(
    page.getByText("Skills are instructions your coding agents load when a task matches them. Basics only reads them."),
  ).toHaveCount(0);
  await expect(page.locator(section("frontend"))).toBeVisible();

  // Only the seeded areas render, always in the same order.
  const areas = await page
    .locator('section[aria-labelledby^="skills-area-"]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-labelledby")?.replace("skills-area-", "")));
  expect(areas).toEqual(["frontend", "security", "testing", "docs", "workflow"]);

  // The same skill installed for two agents is one row, with both chips.
  const frontend = page.locator(section("frontend"));
  await expect(frontend.getByText("frontend-design", { exact: true })).toBeVisible();
  await expect(frontend.getByText("Claude Code", { exact: true })).toBeVisible();
  await expect(frontend.getByText("Shared", { exact: true })).toBeVisible();

  // A plugin skill keeps the plugin name on the row.
  await expect(page.locator(section("docs")).getByText("acme-docs", { exact: true })).toBeVisible();
  await expect(page.locator(section("docs")).getByText("Plugin · acme")).toBeVisible();

  // The Basics skill is not installed for the detected agents in the throwaway home.
  await expect(page.getByText(/not installed for Claude Code/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Add it in Settings › Agents" })).toHaveAttribute("href", "/settings?section=agents");
});

test("the agent filter and the search box narrow the list", async ({ page }) => {
  await page.goto("/skills");
  await expect(page.locator(section("frontend"))).toBeVisible();

  await page.getByRole("button", { name: "Filter by agent" }).click();
  await page
    .getByRole("listbox")
    .getByRole("option", { name: /^Codex/ })
    .click();
  await expect(page.locator(section("testing")).getByText("playwright-cli", { exact: true })).toBeVisible();
  await expect(page.locator(section("frontend"))).toHaveCount(0);
  await expect(page.locator(section("security"))).toHaveCount(0);

  const search = page.getByRole("searchbox", { name: "Search name or description" });
  await search.fill("playwright");
  await expect(page.locator(section("testing")).getByText("playwright-cli", { exact: true })).toBeVisible();

  await search.fill("zzz");
  await expect(page.getByText("No skills match", { exact: true })).toBeVisible();
  await expect(page.getByText(/Nothing here matches/)).toBeVisible();

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(search).toHaveValue("");
  await expect(page.getByRole("button", { name: "Filter by agent" })).toContainText("All agents");
  await expect(page.locator(section("frontend"))).toBeVisible();
  await expect(page.locator(section("workflow"))).toBeVisible();
});

test("an area override moves a skill, survives a reload and resets", async ({ page }) => {
  await page.goto("/skills");
  await expect(page.locator(section("workflow")).getByText("caveman-tools", { exact: true })).toBeVisible();

  // Change area lives with the rest of the row's details now.
  await page.getByRole("button", { name: "Show details for caveman-tools" }).click();
  await page.getByRole("button", { name: "Change area for caveman-tools" }).click();
  await page.getByRole("listbox").getByRole("option", { name: "Data", exact: true }).click();

  const data = page.locator(section("data"));
  await expect(data.getByText("caveman-tools", { exact: true })).toBeVisible();
  await expect(data.getByText("Changed by you")).toBeVisible();
  await expect(page.locator(section("workflow"))).toHaveCount(0);

  await page.reload();
  await expect(page.locator(section("data")).getByText("caveman-tools", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show details for caveman-tools" }).click();
  await expect(page.locator(section("data")).getByText("Changed by you")).toBeVisible();

  await page.getByRole("button", { name: "Reset the area of caveman-tools" }).click();
  await expect(page.locator(section("workflow")).getByText("caveman-tools", { exact: true })).toBeVisible();
  await expect(page.getByText("Changed by you")).toHaveCount(0);
});

test("a row opens its details: path and version", async ({ page }) => {
  await page.goto("/skills");

  await page.getByRole("button", { name: "Show details for frontend-design" }).click();
  await expect(page.getByText("~/.claude/skills/frontend-design/SKILL.md")).toBeVisible();
  await expect(page.getByText("1.2.0", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Hide details for frontend-design" }).click();
  await expect(page.getByRole("button", { name: "Show details for frontend-design" })).toHaveAttribute("aria-expanded", "false");
});

test("explains the empty states: no agents, no skills", async ({ page }) => {
  const agents = [
    { id: "claude-code", name: "Claude Code", detected: false, dirs: [] },
    { id: "opencode", name: "opencode", detected: false, dirs: [] },
    { id: "codex", name: "Codex", detected: false, dirs: [] },
    { id: "shared", name: "Shared (opencode, Codex)", detected: false, dirs: [] },
  ];

  await page.route("**/api/skills", (route) => route.fulfill({ json: { agents, skills: [] } }));
  await page.goto("/skills");
  await expect(page.getByText("No coding agents found", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Open Settings › Agents/ })).toHaveAttribute("href", "/settings?section=agents");

  await page.unroute("**/api/skills");
  await page.route("**/api/skills", (route) => route.fulfill({ json: { agents: [{ ...agents[0], detected: true }], skills: [] } }));
  await page.goto("/skills");
  await expect(page.getByText("No skills installed yet", { exact: true })).toBeVisible();
  await expect(page.getByText(/npx skills add/)).toBeVisible();
  await expect(page.getByRole("link", { name: /How skills work/ })).toHaveAttribute(
    "href",
    "https://marcozvd.github.io/basics/guide/skills.html",
  );
});

test("the area row filters one area and keeps it in the URL", async ({ page }) => {
  await page.goto("/skills");
  await expect(page.locator(section("frontend"))).toBeVisible();
  const securityChip = page.getByRole("button", { name: /^Security\s+\d+$/ });
  await expect(securityChip).toHaveAttribute("aria-pressed", "false");

  await securityChip.click();
  await expect(page).toHaveURL(/\?area=security$/);
  await expect(page.locator(section("security")).getByText("security-audit", { exact: true })).toBeVisible();
  await expect(page.locator(section("frontend"))).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Security\s+\d+$/ })).toHaveAttribute("aria-pressed", "true");

  // Reload and the browser's back button both keep the area the person picked.
  await page.reload();
  await expect(page.locator(section("security")).getByText("security-audit", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^All areas/ }).click();
  await expect(page).toHaveURL(/\/skills$/);
  await expect(page.locator(section("frontend"))).toBeVisible();
  await page.getByRole("button", { name: /^Security\s+\d+$/ }).click();
  await expect(page.locator(section("frontend"))).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/skills$/);
  await expect(page.locator(section("frontend"))).toBeVisible();

  // The area combines with the agent chips, and clearing filters drops it from the URL.
  await page.getByRole("button", { name: /^Security\s+\d+$/ }).click();
  await page.getByRole("button", { name: "Filter by agent" }).click();
  await page
    .getByRole("listbox")
    .getByRole("option", { name: /^Codex/ })
    .click();
  await expect(page.getByText("No skills for this agent", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).toHaveURL(/\/skills$/);
  await expect(page.locator(section("frontend"))).toBeVisible();
});

test("the All view previews five rows per area and expands on demand", async ({ page }) => {
  const agents = [
    { id: "claude-code", name: "Claude Code", detected: true, dirs: [] },
    { id: "opencode", name: "opencode", detected: false, dirs: [] },
    { id: "codex", name: "Codex", detected: false, dirs: [] },
    { id: "shared", name: "Shared (opencode, Codex)", detected: false, dirs: [] },
  ];
  const skill = (index: number, area: "frontend" | "security") => {
    const name = `${area}-skill-${index}`;
    return {
      key: name,
      name,
      description: `Practice ${index} for ${area} work.`,
      summary: `Practice ${index}`,
      area,
      areaSource: "keywords",
      agents: ["claude-code"],
      path: `~/.claude/skills/${name}/SKILL.md`,
    };
  };
  const skills = [...Array.from({ length: 7 }, (_, index) => skill(index + 1, "frontend")), skill(1, "security")];

  await page.route("**/api/skills", (route) => route.fulfill({ json: { agents, skills } }));
  await page.goto("/skills");

  const frontend = page.locator(section("frontend"));
  const frontendRows = frontend.getByRole("button", { name: /^Show details for/ });
  await expect(frontendRows).toHaveCount(5);
  await expect(page.locator(section("security")).getByRole("button", { name: /^Show all/ })).toHaveCount(0);

  const showAll = frontend.getByRole("button", { name: "Show all 7 Frontend skills" });
  await expect(showAll).toHaveAttribute("aria-expanded", "false");
  await showAll.click();
  await expect(frontendRows).toHaveCount(7);
  await expect(frontend.getByRole("button", { name: "Show fewer Frontend skills" })).toHaveAttribute("aria-expanded", "true");

  await frontend.getByRole("button", { name: "Show fewer Frontend skills" }).click();
  await expect(frontendRows).toHaveCount(5);

  // Keyboard only: focus the button and press Enter.
  await frontend.getByRole("button", { name: "Show all 7 Frontend skills" }).focus();
  await page.keyboard.press("Enter");
  await expect(frontendRows).toHaveCount(7);
});
