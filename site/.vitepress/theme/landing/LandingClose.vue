<script setup lang="ts">
// biome-ignore lint/correctness/noUnusedImports: used by the Vue template.
import { withBase } from "vitepress";
import { nextTick, onBeforeUnmount, ref } from "vue";

const release = "https://github.com/MarcozVD/basics/releases/latest";
const options = [
  {
    id: "desktop",
    label: "Desktop",
    value: release,
    description: "Download the installer for Windows, macOS or Linux. No Node.js or terminal required.",
  },
  {
    id: "npm",
    label: "npm",
    value: "npm install -g @marcozvd/basics",
    description: "Requires Node.js 20.11 or newer. Install globally, then run basics init to create your vault.",
  },
  {
    id: "pnpm",
    label: "pnpm",
    value: "pnpm add -g @marcozvd/basics",
    description: "Requires Node.js 20.11 or newer. Install globally, then run basics init to create your vault.",
  },
];
const selected = ref(0);
const copied = ref(false);
const message = ref("");
let reset: ReturnType<typeof setTimeout> | undefined;
let operation = 0;

function select(index: number) {
  operation++;
  clearTimeout(reset);
  copied.value = false;
  message.value = "";
  selected.value = index;
}
// biome-ignore lint/correctness/noUnusedVariables: used by the Vue template.
async function moveTab(event: KeyboardEvent) {
  let index = selected.value;
  if (event.key === "ArrowRight") index = (index + 1) % options.length;
  else if (event.key === "ArrowLeft") index = (index + options.length - 1) % options.length;
  else if (event.key === "Home") index = 0;
  else if (event.key === "End") index = options.length - 1;
  else return;
  event.preventDefault();
  select(index);
  await nextTick();
  document.getElementById(`install-tab-${options[index].id}`)?.focus();
}
// biome-ignore lint/correctness/noUnusedVariables: used by the Vue template.
async function copy() {
  clearTimeout(reset);
  const current = ++operation;
  copied.value = false;
  message.value = "";
  const desktop = selected.value === 0;
  try {
    await navigator.clipboard.writeText(options[selected.value].value);
    if (current !== operation) return;
    copied.value = true;
    message.value = desktop ? "Download link copied." : "Install command copied.";
    reset = setTimeout(() => {
      copied.value = false;
      message.value = "";
    }, 1500);
  } catch {
    if (current !== operation) return;
    const selection = window.getSelection();
    const valueElement = document.getElementById(`install-panel-${options[selected.value].id}`)?.querySelector("code");
    if (valueElement && selection) {
      const range = document.createRange();
      range.selectNodeContents(valueElement);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    message.value = desktop ? "Copy unavailable. Select the link and copy it." : "Copy unavailable. Select the command and copy it.";
  }
}
onBeforeUnmount(() => {
  operation++;
  clearTimeout(reset);
});
</script>

<template>
  <div class="landing-close">
    <section class="landing-faq" aria-labelledby="landing-faq-title">
      <h2 id="landing-faq-title"><span class="landing-section-number" aria-hidden="true">07</span>Questions before you install</h2>
      <details><summary>What is Basics?</summary><p>A folder of Markdown notes about your stack, with a CLI, a local UI and an MCP server over the same files. You record the technologies, practices and checks you trust; your agents read them when they work. <a :href="withBase('/guide/concepts.html')">How the vault works</a>.</p></details>
      <details><summary>Which coding agents can use it?</summary><p>Claude Code, Codex, Cursor, OpenCode, Gemini CLI and other MCP clients can connect. Run <code>basics connect</code> for supported client setup, or <code>basics connect --print</code> for copyable snippets. <a :href="withBase('/guide/mcp-clients.html')">See the client instructions</a>.</p></details>
      <details><summary>Can an agent change my files?</summary><p>Through Basics, agent writes create proposals in your Inbox. Your notes stay unchanged until you approve a diff. The CLI can export instruction files into a project directory you choose; the MCP export tool returns content without writing files. <a :href="withBase('/guide/security.html')">Read the write boundaries</a>.</p></details>
      <details><summary>Does it work offline? Where does my data go?</summary><p>Your vault stays on your machine, with no account, telemetry or remote sync. Local reading, editing and keyword recommendations work offline; package installs, semantic search model downloads and desktop update checks need a connection. A connected coding agent follows its own data and network settings. <a :href="withBase('/guide/security.html')">Read about local state</a>.</p></details>
      <details><summary>Is it free and open source?</summary><p>Yes. Basics is released under the MIT license. You can read, modify and redistribute the source under that license; your notes remain plain files you control. <a href="https://github.com/MarcozVD/basics/blob/main/LICENSE">Read the license</a>.</p></details>
      <details><summary>Should I use Desktop or npm?</summary><p>Desktop bundles Node.js and runs the same local server and UI in a window that stays in the tray. Choose npm or pnpm if you want the CLI in your terminal and already have Node.js 20.11 or newer. Both use the same vault format. <a :href="withBase('/guide/desktop.html')">Read the desktop guide</a>.</p></details>
    </section>

    <section class="landing-install" aria-labelledby="landing-install-title" data-testid="landing-install">
      <h2 id="landing-install-title">Your stack, remembered.</h2>
      <a class="landing-download" :href="release">Download desktop <span aria-hidden="true">↗</span></a>
      <div class="landing-install-tabs" role="tablist" aria-label="Install Basics">
        <button v-for="(option, index) in options" :id="`install-tab-${option.id}`" :key="option.id" type="button" role="tab" :aria-selected="selected === index" :aria-controls="`install-panel-${option.id}`" :tabindex="selected === index ? 0 : -1" @click="select(index)" @keydown="moveTab">{{ option.label }}</button>
      </div>
      <div v-for="(option, index) in options" :id="`install-panel-${option.id}`" :key="option.id" :hidden="selected !== index" class="landing-install-panel" role="tabpanel" :aria-labelledby="`install-tab-${option.id}`" tabindex="0">
        <p>{{ option.description }}</p>
        <div class="landing-install-command">
          <code>{{ option.value }}</code>
          <button type="button" :aria-label="copied ? 'Copied' : selected === 0 ? 'Copy download link' : 'Copy install command'" @click="copy">{{ copied ? 'Copied' : selected === 0 ? 'Copy link' : 'Copy' }}</button>
        </div>
      </div>
      <p class="landing-copy-status" role="status" aria-live="polite" aria-atomic="true">{{ message }}</p>
      <a class="landing-all-install" :href="withBase('/guide/getting-started.html#install')">All install options <span aria-hidden="true">→</span></a>
    </section>
  </div>
</template>
