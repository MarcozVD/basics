import { defineConfig } from "vitepress";

const REPO = "https://github.com/MarcozVD/basics";

export default defineConfig({
  title: "Basics",
  description: "A personal tech-stack vault in Markdown that your coding agents read and extend over MCP.",
  base: "/basics/",
  lang: "en-US",
  appearance: "dark",
  lastUpdated: true,
  transformHead({ assets }) {
    // Request the two reading fonts with the HTML, before CSS discovery can cause a late swap.
    return assets
      .filter((asset) => /\/geist(?:-mono)?-latin-wght-normal\.[^/]+\.woff2$/.test(asset))
      .map((href) => ["link", { rel: "preload", href, as: "font", type: "font/woff2", crossorigin: "" }]);
  },
  cleanUrls: false,
  markdown: {
    // The generated reference tables contain <name>, <lang>, ... as literal values.
    html: false,
    config(md) {
      // Only this authored guide embeds a Vue player. Keep literal <name> values in generated references.
      md.core.ruler.before("block", "desktop-guide-html", (state) => {
        state.md.options.html = state.env.relativePath === "guide/desktop.md";
      });
    },
  },
  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/basics/favicon.svg" }],
    ["meta", { name: "theme-color", content: "#151515" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:title", content: "Basics" }],
    [
      "meta",
      {
        property: "og:description",
        content: "A personal tech-stack vault in Markdown that your coding agents read and extend over MCP.",
      },
    ],
  ],
  themeConfig: {
    logo: { src: "/logo.svg", width: 24, height: 24 },
    nav: [
      {
        text: "Product",
        activeMatch: "/features/",
        items: [
          { text: "Recommend", link: "/features/recommend/" },
          { text: "Inbox", link: "/features/inbox/" },
          { text: "Graph & notes", link: "/features/graph/" },
          { text: "Export & connect", link: "/features/export-connect/" },
        ],
      },
      { text: "Guide", link: "/guide/getting-started", activeMatch: "/guide/" },
      { text: "Reference", link: "/reference/cli", activeMatch: "/reference/" },
      { text: "GitHub", link: REPO },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "Start",
          items: [
            { text: "Getting started", link: "/guide/getting-started" },
            { text: "Concepts", link: "/guide/concepts" },
          ],
        },
        {
          text: "Use Basics",
          items: [
            { text: "Notes", link: "/guide/notes" },
            { text: "Packs", link: "/guide/packs" },
            { text: "MCP clients", link: "/guide/mcp-clients" },
            { text: "Agent skill", link: "/guide/agent-skill" },
            { text: "Skills", link: "/guide/skills" },
            { text: "Web UI", link: "/guide/web-ui" },
            { text: "Desktop app", link: "/guide/desktop" },
            { text: "Recommend", link: "/guide/recommend" },
            { text: "Projects and checks", link: "/guide/projects-and-checks" },
          ],
        },
        {
          text: "Operate",
          items: [
            { text: "Security", link: "/guide/security" },
            { text: "Troubleshooting", link: "/guide/troubleshooting" },
            { text: "Stability", link: "/guide/stability" },
          ],
        },
      ],
      "/reference/": [
        {
          text: "Reference",
          items: [
            { text: "CLI", link: "/reference/cli" },
            { text: "MCP tools", link: "/reference/mcp-tools" },
            { text: "Vault schema", link: "/reference/schema" },
          ],
        },
      ],
    },
    search: {
      provider: "local",
      options: {
        translations: {
          // Keep a word boundary before VitePress's adjacent visible K hint.
          button: { buttonText: "Search ", buttonAriaLabel: "Search K" },
        },
      },
    },
    editLink: {
      pattern: `${REPO}/edit/main/site/:path`,
      text: "Edit this page on GitHub",
    },
    lastUpdated: {
      text: "Last updated",
      formatOptions: { dateStyle: "medium", timeStyle: "short", forceLocale: true },
    },
    outline: {
      level: [2, 3],
      label: "On this page",
    },
    socialLinks: [{ icon: "github", link: REPO }],
    docFooter: {
      prev: "Previous",
      next: "Next",
    },
  },
});
