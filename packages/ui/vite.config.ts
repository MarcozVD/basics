import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const pkg = (names: string) => new RegExp(`node_modules[\\/](?:${names})[\\/]`);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  build: {
    // CodeMirror and Cytoscape are single route-level vendor chunks (~210/170 kB gzip) that load only with the editor and graph.
    chunkSizeWarningLimit: 650,
    rolldownOptions: {
      output: {
        // Stable vendor chunks: the app shell caches across releases, and heavy editors load with their route.
        codeSplitting: {
          groups: [
            { name: "react", test: pkg("react|react-dom|scheduler|react-router|cookie|set-cookie-parser"), priority: 3 },
            { name: "motion", test: pkg("motion|framer-motion|motion-dom|motion-utils"), priority: 3 },
            { name: "query", test: pkg("@tanstack"), priority: 3 },
            { name: "codemirror", test: pkg("@codemirror|@lezer|@uiw|@marijn|crelt|style-mod|w3c-keyname"), priority: 2 },
            { name: "cytoscape", test: pkg("cytoscape|cytoscape-fcose|cose-base|layout-base"), priority: 2 },
          ],
        },
      },
    },
  },
  server: {
    proxy: {
      "/api": { target: "http://127.0.0.1:4747", changeOrigin: true },
      "/mcp": { target: "http://127.0.0.1:4747", changeOrigin: true },
    },
  },
});
