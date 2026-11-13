<script setup lang="ts">
import { withBase } from "vitepress";
import { onBeforeUnmount, onMounted, ref } from "vue";
// biome-ignore lint/correctness/noUnusedImports: used by the Vue template.
import AppPart from "./AppPart.vue";
// biome-ignore lint/correctness/noUnusedImports: used by the Vue template.
import DemoChips from "./DemoChips.vue";

// biome-ignore lint/correctness/noUnusedVariables: assigned and read by the Vue template.
const state = ref("idle");
const narrow = ref(true);
const frameSrc = ref(withBase("/demo/explore/"));
const framePart = ref<"full" | "recommend" | "proposal">("full");
const navigation = ref(0);
let media: MediaQueryList;
function resize() {
  narrow.value = media.matches;
}
// biome-ignore lint/correctness/noUnusedVariables: called by the Vue template.
function navigateDemo(entry: { kind: string; path: string | null }) {
  framePart.value = entry.kind === "proposal" ? "proposal" : "recommend";
  frameSrc.value = entry.path || withBase("/demo/explore/");
  navigation.value++;
}
// biome-ignore lint/correctness/noUnusedVariables: used by the Vue template.
function resetDemo() {
  framePart.value = "full";
  frameSrc.value = withBase("/demo/explore/");
  navigation.value++;
}
onMounted(() => {
  media = window.matchMedia("(max-width: 767px)");
  resize();
  media.addEventListener("change", resize);
});
onBeforeUnmount(() => media?.removeEventListener("change", resize));
</script>

<template>
  <div class="landing-demo">
    <div class="landing-window" data-reveal="3" data-ui data-testid="landing-window" :data-state="state">
      <div class="landing-window-titlebar"><span class="landing-window-name">Basics <span>demo vault</span></span><div class="landing-window-controls" aria-hidden="true"><span>&#8722;</span><span>&#9633;</span><span>&#215;</span></div></div>
      <div class="landing-window-viewport">
        <AppPart :key="navigation" :part="framePart" windowed :path="frameSrc" @state="state = $event">
          <template #fallback><picture class="landing-poster"><source :srcset="withBase('/media/demo-poster.webp')" type="image/webp" /><img :src="withBase('/media/demo-poster-1x.webp')" alt="Basics Explore showing notes from the public packs." width="1280" height="800" decoding="async" /></picture></template>
        </AppPart>
      </div>
    </div>
    <div class="landing-window-links" data-reveal="4"><span>Real app. Public note packs.</span><a v-if="narrow || state === 'failed'" href="/basics/demo/" target="_blank" rel="noopener">Open live demo <span aria-hidden="true">&#8599;</span></a><a v-else href="/basics/demo/" target="_blank" rel="noopener">Open full screen <span aria-hidden="true">&#8599;</span></a></div>
    <DemoChips :show-answer="narrow || state === 'failed'" @select="navigateDemo" @reset="resetDemo" />
  </div>
</template>
