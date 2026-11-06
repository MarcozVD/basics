import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Path of the temp vault created by serve.mjs for this run. */
export function vaultPath(): string {
  return fs.readFileSync(path.join(here, ".vault-path"), "utf8").trim();
}

/**
 * Recommend keeps its layer chips and stepper behind one summary line. Open it
 * before reaching for a layer control; calling this when it is already open is safe.
 */
export async function openRecommendLayers(page: Page): Promise<void> {
  const trigger = page.getByRole("button", { name: /layers, \d+ per layer$/ });
  await expect(trigger).toBeVisible();
  if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
}
