import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { startStaticServer } from "../../packages/ui/demo-e2e/serve.mjs";

// Run after demo:build. The only subject is the built public-packs demo, never a live user's app.
const port = Number(process.env.BASICS_POSTER_PORT ?? 4895);
const server = await startStaticServer(port);
const directory = path.resolve(import.meta.dirname, "../../site/public/media");
let browser;
try {
  browser = await chromium.launch({ channel: process.env.BASICS_DEMO_BROWSER_CHANNEL || undefined });
  fs.mkdirSync(directory, { recursive: true });
  for (const density of [1, 2]) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: density,
      colorScheme: "dark",
      reducedMotion: "reduce",
    });
    await context.addInitScript(() => localStorage.setItem("basics-theme", "dark"));
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date("2026-11-12T12:00:00.000Z"));
    await page.goto(`http://127.0.0.1:${port}/basics/demo/explore/`);
    await page.getByRole("option", { name: /Next\.js/ }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    const png = await page.screenshot({ type: "png", animations: "disabled", caret: "hide" });
    // Use the browser's WebP codec; no image-processing dependency or synthetic app artwork.
    const webp = await page.evaluate(async (encoded) => {
      const bitmap = await createImageBitmap(
        new Blob([Uint8Array.from(atob(encoded), (byte) => byte.charCodeAt(0))], { type: "image/png" }),
      );
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d").drawImage(bitmap, 0, 0);
      bitmap.close();
      return canvas.toDataURL("image/webp", 0.88).split(",")[1];
    }, png.toString("base64"));
    const file = path.join(directory, density === 2 ? "demo-poster.webp" : "demo-poster-1x.webp");
    fs.writeFileSync(file, Buffer.from(webp, "base64"));
    console.log(`${path.basename(file)}: ${1280 * density}x${800 * density}, ${fs.statSync(file).size} bytes`);
    await context.close();
  }
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}
