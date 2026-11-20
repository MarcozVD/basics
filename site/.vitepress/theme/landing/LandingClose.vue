<script setup lang="ts">
import { withBase } from "vitepress";
import { nextTick, onBeforeUnmount, ref } from "vue";
import { useReveal } from "./useReveal";

const release = withBase("/guide/desktop.html#download");
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
    description: "Requires Node.js 20.11 or newer. Install globally, then run basics init to create your notes folder.",
  },
  {
    id: "pnpm",
    label: "pnpm",
    value: "pnpm add -g @marcozvd/basics",
    description: "Requires Node.js 20.11 or newer. Install globally, then run basics init to create your notes folder.",
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
    const value = options[selected.value].value;
    await navigator.clipboard.writeText(desktop ? new URL(value, window.location.href).href : value);
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
const revealRoot = ref<HTMLElement>();
useReveal(revealRoot);
</script>

<template>
  <div ref="revealRoot" class="landing-close">
    <section class="landing-faq" aria-labelledby="landing-faq-title">
      <h2 id="landing-faq-title"><span class="landing-section-number" data-reveal="0" aria-hidden="true">08</span><span data-reveal="1">Questions before you install</span></h2>
      <details data-reveal="2"><summary>What problem does Basics solve?</summary><p>Your coding agent does not know the choices you made in earlier projects, so it guesses and you explain them again. Basics keeps those choices in reusable notes for your agents to read. You decide which suggested changes to keep. <a :href="withBase('/guide/glossary.html')">Learn the terms</a> or <a :href="withBase('/guide/concepts.html')">see how the notes fit together</a>.</p></details>
      <details data-reveal="3"><summary>How is it different from Cursor rules or an AGENTS.md file?</summary><p>Rules files give an agent instructions. Basics adds a shared set of notes you can reuse across projects, suggestions for which tools fit, and a place to review suggested changes. It can export instructions to those files. If you only need rules for one project, a plain file may be enough. <a :href="withBase('/guide/comparison.html')">Compare the options</a>.</p></details>
      <details data-reveal="4"><summary>Which coding agents can use it?</summary><p>Basics works with Claude Code, Codex, Cursor, OpenCode, Gemini CLI and other agents that support <a :href="withBase('/guide/glossary.html#mcp')">MCP</a>, a standard for connecting agents to outside tools. Run <code>basics connect</code> to set up a supported client, or <code>basics connect --print</code> for instructions you can copy. For agents that support them, <a :href="withBase('/guide/glossary.html#skill')">skills</a> are guides that explain when to use Basics. <a :href="withBase('/guide/mcp-clients.html')">Connect your coding agent</a>.</p></details>
      <details data-reveal="5"><summary>Can an agent change my files?</summary><p>Through Basics, agent changes arrive as <a :href="withBase('/guide/glossary.html#proposal')">proposals</a>, suggested edits waiting in the <a :href="withBase('/guide/glossary.html#inbox')">Inbox</a> for your review. Your notes stay unchanged until you approve. The terminal export command can write instruction files to a project folder you choose; the <a :href="withBase('/guide/glossary.html#mcp')">MCP</a> export tool returns text without writing files. <a :href="withBase('/guide/security.html')">Read what Basics can change</a>.</p></details>
      <details data-reveal="6"><summary>Does it work offline? Where does my data go?</summary><p>Your <a :href="withBase('/guide/glossary.html#vault')">vault</a>, the folder of notes, stays on your computer, with no account, telemetry or remote sync. Reading and editing notes and keyword-based suggestions work offline. Downloading <a :href="withBase('/guide/glossary.html#pack')">packs</a> (bundles of notes), the optional search model or desktop updates needs a connection. A connected coding agent follows its own data and network settings. <a :href="withBase('/guide/security.html')">Read about local state</a>.</p></details>
      <details data-reveal="7"><summary>Is it free and open source?</summary><p>Yes. Basics is released under the MIT license. You can read, modify and redistribute the source under that license; your notes remain plain files you control. <a href="https://github.com/MarcozVD/basics/blob/main/LICENSE">Read the license</a>.</p></details>
      <details data-reveal="8"><summary>Should I use Desktop or npm?</summary><p>Choose Desktop if you want an app window and a tray icon, with Node.js included. Choose npm or pnpm if you prefer terminal commands and already have Node.js 20.11 or newer. Both read and write the same folder of notes, your <a :href="withBase('/guide/glossary.html#vault')">vault</a>. <a :href="withBase('/guide/desktop.html')">Read the desktop guide</a>.</p></details>
    </section>

    <section class="landing-install" aria-labelledby="landing-install-title" data-testid="landing-install">
      <h2 id="landing-install-title" data-reveal="0">Start with what you know.</h2>
      <p>Quick start with Node.js 20.11 or newer: create a vault, then connect Claude Code over stdio. No running server or web UI needed.</p>
      <div class="landing-install-command"><code>npx @marcozvd/basics init ~/basics-vault --yes<br />claude mcp add --scope user basics -- npx -y --package @marcozvd/basics basics-mcp /absolute/path/to/basics-vault</code></div>
      <p>Use your vault's absolute path. Open the UI when you want to review proposals. Alternatively, connect over HTTP while the UI is running:</p>
      <div class="landing-install-command"><code>npx @marcozvd/basics --vault ~/basics-vault ui<br />claude mcp add --transport http basics http://127.0.0.1:4747/mcp</code></div>
      <a class="landing-download" data-reveal="1" :href="release">Download desktop <span aria-hidden="true">→</span></a>
      <div class="landing-install-tabs" role="tablist" aria-label="Install Basics">
        <button :data-reveal="index + 2" v-for="(option, index) in options" :id="`install-tab-${option.id}`" :key="option.id" type="button" role="tab" :aria-selected="selected === index" :aria-controls="`install-panel-${option.id}`" :tabindex="selected === index ? 0 : -1" @click="select(index)" @keydown="moveTab">{{ option.label }}</button>
      </div>
      <div v-for="(option, index) in options" :id="`install-panel-${option.id}`" :key="option.id" :hidden="selected !== index" class="landing-install-panel" role="tabpanel" :aria-labelledby="`install-tab-${option.id}`" tabindex="0">
        <p data-reveal="3">{{ option.description }}</p>
        <div class="landing-install-command" data-reveal="4">
          <code>{{ option.value }}</code>
          <button type="button" :aria-label="copied ? 'Copied' : selected === 0 ? 'Copy download link' : 'Copy install command'" @click="copy">{{ copied ? 'Copied' : 'Copy' }}</button>
        </div>
      </div>
      <p class="landing-copy-status" role="status" aria-live="polite" aria-atomic="true">{{ message }}</p>
      <a class="landing-all-install" data-reveal="4" :href="withBase('/guide/getting-started.html#install')">All install options <span aria-hidden="true">→</span></a>
    </section>
  </div>
</template>
