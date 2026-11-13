<script setup lang="ts">
// biome-ignore lint/correctness/noUnusedImports: used by the Vue template.
import { withBase } from "vitepress";
import { ref } from "vue";
import { useReveal } from "./useReveal";

const root = ref<HTMLElement>();
useReveal(root);
</script>

<template>
  <footer ref="root" class="site-footer" aria-label="Basics footer">
    <div class="site-footer-inner">
      <p><a data-reveal="0" class="site-footer-brand" :href="withBase('/')">Basics</a><span data-reveal="1">Your stack, in plain Markdown.</span></p>
      <nav aria-label="Footer"><a data-reveal="0" :href="withBase('/guide/getting-started.html')">Guide</a><a data-reveal="1" :href="withBase('/reference/cli.html')">Reference</a><a data-reveal="2" href="https://github.com/MarcozVD/basics">GitHub</a><a data-reveal="3" href="https://www.npmjs.com/package/@marcozvd/basics">npm</a><a data-reveal="4" href="https://github.com/MarcozVD/basics/blob/main/packages/basics/CHANGELOG.md">Changelog</a><a data-reveal="5" href="https://github.com/MarcozVD/basics/blob/main/LICENSE">MIT</a></nav>
    </div>
  </footer>
</template>
