<script setup lang="ts">
// biome-ignore lint/correctness/noUnusedImports: used in the template, which Biome does not read
import { withBase } from "vitepress";
</script>

<template>
  <section class="demo-video">
    <video
      :src="withBase('/media/basics-demo.mp4')"
      :poster="withBase('/media/basics-demo-poster.jpg')"
      controls
      muted
      playsinline
      preload="metadata"
    />
    <p>Two-minute tour: vault, explore, editor, graph, an agent proposing notes over MCP, inbox review and stack export.</p>
  </section>
</template>

<style scoped>
.demo-video {
  max-width: 1152px;
  margin: 0 auto;
  padding: 0 24px 48px;
}

.demo-video video {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 12px;
  border: 1px solid var(--vp-c-divider);
  background: #07090d;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.35);
}

.demo-video p {
  margin: 12px 0 0;
  text-align: center;
  font-size: 14px;
  color: var(--vp-c-text-2);
}

@media (min-width: 640px) {
  .demo-video {
    padding: 0 48px 64px;
  }
}
</style>
