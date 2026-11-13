<script setup lang="ts">
// biome-ignore lint/correctness/noUnusedImports: used in the template, which Biome does not read
import { withBase } from "vitepress";
</script>

<template>
  <figure class="demo-video">
    <video
      :src="withBase('/media/basics-demo.mp4')"
      :poster="withBase('/media/basics-demo-poster.jpg')"
      controls
      muted
      playsinline
      preload="none"
      aria-label="Basics desktop tour, silent video"
      aria-describedby="desktop-tour-description"
    />
    <figcaption id="desktop-tour-description">Silent tour: vault, Explore, editor, graph, an agent proposing notes over MCP, Inbox review and stack export.</figcaption>
    <details open>
      <summary>Text version of the tour</summary>
      <ol>
        <li>Start with a vault: a folder of Markdown notes shared by the desktop app, CLI and coding agents.</li>
        <li>Use Explore to find a note by title, type or layer.</li>
        <li>Open the note to read its properties and Markdown. Wikilinks connect it to other notes.</li>
        <li>Follow those connections in the graph or the note's connections panel.</li>
        <li>An agent proposes a note through MCP. Open Inbox, read the reason and diff, then approve or reject it.</li>
        <li>Choose a stack and export its practices and checks to STACK.md and your agents' instruction files.</li>
      </ol>
    </details>
  </figure>
</template>

<style scoped>
.demo-video {
  margin: 24px 0 32px;
}

.demo-video video {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 12px;
  border: 1px solid var(--vp-c-divider);
  background: var(--basics-shell);
}

.demo-video figcaption {
  margin: 12px 0 0;
  font-size: 14px;
  color: var(--vp-c-text-2);
}

.demo-video details {
  margin-top: 20px;
}
.demo-video summary {
  cursor: pointer;
  font-weight: 500;
}
</style>
