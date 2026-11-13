<!--
THESIS: A window into the stack control room, with the real app as proof rather than feature cards.
OWN-WORLD: Inherit Basics Geist, neutral shell and surfaces, blue action, hairline frame, 16px radius.
STORY: Recognize your agents' workflow, inspect the app, download Basics or copy its install command.
FIRST VIEWPORT: Approved 40/60 copy/window composition at 1280px; stacked below; poster only on phones.
FORM: Owner-approved V19 design brief, section 3. Composition is pinned; no concept roll or new identity.
-->
<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
// biome-ignore lint/correctness/noUnusedImports: used by the Vue template.
import LiveWindow from "./LiveWindow.vue";

const command = "npx @marcozvd/basics init";
const copied = ref(false);
const copyError = ref("");
const commandElement = ref<HTMLElement>();
let reset: ReturnType<typeof setTimeout> | undefined;
// biome-ignore lint/correctness/noUnusedVariables: used by the Vue template.
async function copyCommand() {
  clearTimeout(reset);
  copyError.value = "";
  try {
    await navigator.clipboard.writeText(command);
    copied.value = true;
    reset = setTimeout(() => {
      copied.value = false;
    }, 1500);
  } catch {
    copied.value = false;
    const selection = window.getSelection();
    if (commandElement.value && selection) {
      const range = document.createRange();
      range.selectNodeContents(commandElement.value);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    copyError.value = "Copy unavailable. Select the command and copy it.";
  }
}
onBeforeUnmount(() => clearTimeout(reset));
</script>

<template>
  <section class="landing-hero" aria-labelledby="landing-title" data-testid="landing-hero">
    <div class="landing-copy">
      <h1 id="landing-title">Your agents build it your way.</h1>
      <p class="landing-promise">Teach your stack once.<br /> Every agent uses it.</p>
      <p class="landing-summary">Basics keeps your tech stack as plain Markdown notes. Your coding agents read it over MCP and propose what they learn. You approve every change.</p>
      <div class="landing-actions">
        <a class="landing-download" href="https://github.com/MarcozVD/basics/releases/latest">Download desktop <span aria-hidden="true">↗</span></a>
        <div class="landing-command">
          <code ref="commandElement">{{ command }}</code>
          <button type="button" :aria-label="copied ? 'Copied install command' : 'Copy install command'" @click="copyCommand">{{ copied ? "Copied" : "Copy" }}</button>
        </div>
      </div>
      <span class="landing-sr-only" role="status" aria-live="polite">{{ copied ? 'Install command copied.' : copyError }}</span>
      <p class="landing-platforms">Windows, macOS, Linux <span aria-hidden="true">·</span> MIT <span aria-hidden="true">·</span> local, no account</p>
    </div>
    <LiveWindow />
  </section>
</template>
