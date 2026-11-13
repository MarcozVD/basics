<script setup lang="ts">
// biome-ignore lint/correctness/noUnusedImports: used by the Vue template's public asset URLs.
import { withBase } from "vitepress";
import { onBeforeUnmount, onMounted, ref } from "vue";

const viewport = ref<HTMLElement>();
const frame = ref<HTMLIFrameElement>();
const state = ref<"poster" | "loading" | "live" | "failed">("poster");
const narrow = ref(true);
const scale = ref(1);
let visibility: IntersectionObserver | undefined;
let size: ResizeObserver | undefined;
let media: MediaQueryList | undefined;
let deadline: ReturnType<typeof setTimeout> | undefined;
let ready: ReturnType<typeof setInterval> | undefined;

function stopTimers() {
  clearTimeout(deadline);
  clearInterval(ready);
}
function fail() {
  stopTimers();
  state.value = "failed";
}
function start() {
  if (narrow.value || state.value !== "poster") return;
  state.value = "loading";
  visibility?.disconnect();
  deadline = setTimeout(fail, 15000);
}
// biome-ignore lint/correctness/noUnusedVariables: used by the iframe's Vue template load handler.
function checkFrame() {
  if (state.value !== "loading") return;
  const check = () => {
    try {
      if (frame.value?.contentDocument?.querySelector('[data-testid="demo-notice"]')) {
        stopTimers();
        state.value = "live";
      }
    } catch {
      fail();
    }
  };
  clearInterval(ready);
  ready = setInterval(check, 100);
  check();
}
function observeVisibility() {
  visibility?.disconnect();
  if (!narrow.value && viewport.value && "IntersectionObserver" in window) {
    visibility = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.intersectionRatio >= 0.5)) start();
      },
      { threshold: 0.5 },
    );
    visibility.observe(viewport.value);
  }
}
function resize() {
  narrow.value = media?.matches ?? true;
  if (narrow.value) {
    stopTimers();
    state.value = "poster";
  }
  observeVisibility();
}
onMounted(() => {
  media = window.matchMedia("(max-width: 767px)");
  media.addEventListener("change", resize);
  size = new ResizeObserver(() => {
    scale.value = (viewport.value?.clientWidth ?? 1280) / 1280;
  });
  if (viewport.value) {
    scale.value = viewport.value.clientWidth / 1280;
    size.observe(viewport.value);
  }
  resize();
});
onBeforeUnmount(() => {
  stopTimers();
  visibility?.disconnect();
  size?.disconnect();
  media?.removeEventListener("change", resize);
});
</script>

<template>
  <div class="landing-demo">
    <div class="landing-window" data-ui data-testid="landing-window" :data-state="state">
      <div class="landing-window-titlebar">
        <span class="landing-window-name">Basics <span>demo vault</span></span>
        <div class="landing-window-controls" aria-hidden="true"><span>−</span><span>□</span><span>×</span></div>
      </div>
      <div ref="viewport" class="landing-window-viewport" @pointerdown="start">
        <picture v-show="state !== 'live'" class="landing-poster">
          <source :srcset="`${withBase('/media/demo-poster-1x.webp')} 1x, ${withBase('/media/demo-poster.webp')} 2x`" type="image/webp" />
          <img :src="withBase('/media/demo-poster-1x.webp')" alt="Basics Explore showing technologies, practices, checks and profiles from the public note packs." width="1280" height="800" fetchpriority="high" decoding="async" />
        </picture>
        <iframe v-if="!narrow && (state === 'loading' || state === 'live')" ref="frame" src="/basics/demo/explore/" title="Interactive Basics app demo" :style="{ transform: `scale(${scale})` }" :class="{ 'is-live': state === 'live' }" :aria-hidden="state !== 'live'" :tabindex="state === 'live' ? 0 : -1" @load="checkFrame" @error="fail" />
        <button v-if="!narrow && state === 'poster'" class="landing-start" type="button" @click="start">Try live demo <span aria-hidden="true">↗</span></button>
        <span v-if="state === 'loading'" class="landing-demo-status" role="status">Starting demo</span>
      </div>
    </div>
    <div class="landing-window-links">
      <span>Real app. Public note packs.</span>
      <a v-if="narrow || state === 'failed'" href="/basics/demo/" target="_blank" rel="noopener">Open live demo <span aria-hidden="true">↗</span></a>
      <a v-else href="/basics/demo/" target="_blank" rel="noopener">Open full screen <span aria-hidden="true">↗</span></a>
    </div>
    <p v-if="state === 'failed'" class="landing-demo-error" role="status">The embedded demo could not start. Open it in a new tab.</p>
  </div>
</template>
