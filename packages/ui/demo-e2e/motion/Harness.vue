<script setup lang="ts">
// biome-ignore lint/correctness/noUnusedImports: used by the Vue template.
import AppPart from "@landing/AppPart.vue";
import { useReveal } from "@landing/useReveal";
import { ref } from "vue";

const query = new URLSearchParams(location.search);
// biome-ignore lint/correctness/noUnusedVariables: read and mutated by the Vue template.
const parts = ref((query.get("parts") || "explore,note,proposal,recommend,graph").split(","));
const root = ref<HTMLElement>();
// biome-ignore lint/correctness/useHookAtTopLevel: Vue script setup executes inside component setup.
useReveal(root);
// biome-ignore lint/correctness/noUnusedVariables: used by the Vue template.
const distance = Number(query.get("distance") || 0);
</script>
<template>
  <div ref="root" class="motion-harness">
    <button id="remove-first" type="button" @click="parts.shift()">Remove first part</button>
    <div :style="{ height: `${distance}vh` }"></div>
    <section v-for="(part, index) in parts" :key="part" class="fixture-section">
      <h2><span data-reveal="0">{{ index + 1 }}</span><span data-reveal="1">{{ part }}</span></h2>
      <p data-reveal="2">Real app part follows this section.</p>
      <AppPart :part="part" :params="{ id: part === 'proposal' ? 'cli-error-messages' : 'nextjs', focus: 'nextjs' }" />
    </section>
  </div>
</template>
<style>
body { margin: 0; background: var(--basics-shell); color: var(--basics-text); }
.motion-harness { max-width: 720px; margin: 24px auto; padding-inline: 24px; }
.fixture-section { margin-block: 40px 80px; }
.fixture-section h2 { display: flex; gap: 12px; font-size: 26px; }
#remove-first { padding: 12px; border: 1px solid var(--basics-border); }
</style>
