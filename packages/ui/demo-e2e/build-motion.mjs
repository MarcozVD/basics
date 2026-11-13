import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Compile the real Vue components into an isolated test fixture, never the deployed site. */
export default async function buildMotionFixture() {
  const repo = path.resolve(import.meta.dirname, "../../..");
  const runtime = createRequire(path.join(repo, "node_modules/vitepress/package.json"));
  const { build } = await import(pathToFileURL(path.join(path.dirname(runtime.resolve("vite")), "dist/node/index.js")).href);
  const { default: vue } = await import(pathToFileURL(runtime.resolve("@vitejs/plugin-vue")).href);
  const output = path.join(repo, "scripts/demo/generated/motion-fixture");
  if (!output.startsWith(`${path.join(repo, "scripts/demo/generated")}${path.sep}`)) throw new Error("Unsafe fixture output");
  await build({
    configFile: false,
    root: fileURLToPath(new URL("./motion", import.meta.url)),
    base: "/basics/__motion/",
    plugins: [vue()],
    resolve: {
      alias: {
        vitepress: fileURLToPath(new URL("./motion/vitepress.ts", import.meta.url)),
        "@landing": path.join(repo, "site/.vitepress/theme/landing"),
      },
    },
    build: { outDir: output, emptyOutDir: true },
    logLevel: "warn",
  });
}
