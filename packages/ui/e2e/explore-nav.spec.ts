import { expect, type Page, test } from "@playwright/test";

/** One animation frame of Explore while a note is opening. */
interface Sample {
  /** Labels of the selected tabs at that frame (the language segment is a tab too). */
  tabs: string[];
  /** Text of the closed select triggers (layer and sort). */
  selects: string[];
  /** Rows still rendered by the Explore list. */
  rows: number;
  /** Rows whose note type is not the filtered one (always 0 when the filter holds). */
  foreign: number;
}

const ROWS = "[role='listbox'] [data-note-row]";
const OTHER_TYPE = `${ROWS}:not([data-note-type="check"])`;

declare global {
  interface Window {
    __exploreFrames?: Sample[];
    __exploreStop?: () => void;
  }
}

/**
 * Sample the rendered Explore list and its controls on every animation frame and after every
 * DOM mutation until stopped. The bug this guards (a filtered Explore flashing back to "All"
 * while a note opens) exists only inside the route transition, so assertions taken after the
 * navigation would miss it.
 */
async function startSampling(page: Page, noteType: string): Promise<void> {
  await page.evaluate((type) => {
    const frames: Sample[] = [];
    window.__exploreFrames = frames;
    let running = true;
    const sample = () => {
      if (frames.length >= 2000) return;
      const tabs = Array.from(document.querySelectorAll<HTMLElement>('[role="tab"][aria-selected="true"]')).map(
        (tab) => tab.textContent?.trim() ?? "",
      );
      const selects = Array.from(document.querySelectorAll<HTMLElement>('button[aria-haspopup="listbox"]')).map(
        (trigger) => trigger.textContent?.trim() ?? "",
      );
      const rows = Array.from(document.querySelectorAll<HTMLElement>("[role='listbox'] [data-note-row]"));
      frames.push({
        tabs,
        selects,
        rows: rows.length,
        foreign: rows.filter((row) => row.dataset.noteType !== type).length,
      });
    };
    const observer = new MutationObserver(sample);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    const tick = () => {
      if (!running) return;
      sample();
      requestAnimationFrame(tick);
    };
    window.__exploreStop = () => {
      running = false;
      observer.disconnect();
    };
    requestAnimationFrame(tick);
  }, noteType);
}

async function stopSampling(page: Page): Promise<Sample[]> {
  return page.evaluate(() => {
    window.__exploreStop?.();
    return window.__exploreFrames ?? [];
  });
}

/** Click a row, wait for the editor and for the exiting Explore page to be gone, then read the frames. */
async function openFirstRowAndSettle(page: Page, noteType: string): Promise<Sample[]> {
  await startSampling(page, noteType);
  await page.locator(ROWS).first().click();
  await expect(page).toHaveURL(/\/notes\//);
  await expect(page.locator(ROWS)).toHaveCount(0);
  return stopSampling(page);
}

test("a type-filtered Explore keeps its filter while a check opens", async ({ page }) => {
  await page.goto("/explore?type=check");
  await expect(page.getByRole("tab", { name: /^Check/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(ROWS).first()).toBeVisible();
  await expect(page.locator(OTHER_TYPE)).toHaveCount(0);

  const frames = await openFirstRowAndSettle(page, "check");
  const onExplore = frames.filter((frame) => frame.rows > 0);
  expect(onExplore.length, "frames captured while Explore was still mounted").toBeGreaterThan(0);
  for (const frame of onExplore) {
    expect(frame.foreign, JSON.stringify(frame)).toBe(0);
    expect(
      frame.tabs.some((tab) => tab.startsWith("Check")),
      JSON.stringify(frame),
    ).toBe(true);
  }

  await expect(page.getByLabel("Title", { exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/explore\?type=check$/);
  await expect(page.getByRole("tab", { name: /^Check/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(OTHER_TYPE)).toHaveCount(0);
});

test("a layer-filtered Explore keeps its filter while a note opens", async ({ page }) => {
  await page.goto("/explore?layer=testing");
  const rows = page.locator(ROWS);
  await expect(rows).toHaveCount(3);
  const filtered = await rows.count();

  const frames = await openFirstRowAndSettle(page, "");
  const onExplore = frames.filter((frame) => frame.rows > 0);
  expect(onExplore.length, "frames captured while Explore was still mounted").toBeGreaterThan(0);
  for (const frame of onExplore) {
    expect(frame.rows, JSON.stringify(frame)).toBe(filtered);
    expect(
      frame.selects.some((trigger) => trigger.startsWith("Testing")),
      JSON.stringify(frame),
    ).toBe(true);
  }

  await page.goBack();
  await expect(page).toHaveURL(/\/explore\?layer=testing$/);
  await expect(page.locator(ROWS)).toHaveCount(filtered);
  await expect(page.getByRole("button", { name: /^Testing/ })).toBeVisible();
});
