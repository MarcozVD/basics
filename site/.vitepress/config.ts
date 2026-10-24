import { defineConfig } from "vitepress";

const REPO = "https://github.com/MarcozVD/basics";

export default defineConfig({
  title: "Basics",
  description: "A personal tech-stack vault in Markdown that your coding agents read and extend over MCP.",
  base: "/basics/",
  lang: "en-US",
  appearance: "dark",
  lastUpdated: true,
  cleanUrls: false,
  markdown: {
    // The generated reference tables contain <name>, <lang>, ... as literal values.
    html: false,
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
    logo: "/logo.svg",
    nav: [
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
    footer: {
      message: "Released under the MIT license.",
      copyright: "© 2026 MarcozVD",
    },
    docFooter: {
      prev: "Previous",
      next: "Next",
    },
  },
});
