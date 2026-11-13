<script setup lang="ts">
// biome-ignore lint/correctness/noUnusedImports: used by the Vue template.
import { withBase } from "vitepress";
</script>

<template>
  <footer class="site-footer" aria-label="Basics footer">
    <div class="site-footer-inner">
      <p><a class="site-footer-brand" :href="withBase('/')">Basics</a><span>Your stack, in plain Markdown.</span></p>
      <nav aria-label="Footer"><a :href="withBase('/guide/getting-started.html')">Guide</a><a :href="withBase('/reference/cli.html')">Reference</a><a href="https://github.com/MarcozVD/basics">GitHub</a><a href="https://www.npmjs.com/package/@marcozvd/basics">npm</a><a href="https://github.com/MarcozVD/basics/blob/main/packages/basics/CHANGELOG.md">Changelog</a><a href="https://github.com/MarcozVD/basics/blob/main/LICENSE">MIT</a></nav>
    </div>
  </footer>
</template>
