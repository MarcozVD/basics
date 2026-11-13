<script setup lang="ts">
import { useData, withBase } from "vitepress";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { embedQueue } from "./embedQueue";
// biome-ignore lint/correctness/noUnusedImports: used by the Vue template.
import PartSkeleton from "./PartSkeleton.vue";

const props = withDefaults(
  defineProps<{
    part: "full" | "explore" | "note" | "graph" | "proposal" | "recommend";
    params?: Record<string, string>;
    path?: string;
  }>(),
  { params: () => ({}) },
);
const emit = defineEmits<{ state: [state: string] }>();
const { isDark } = useData();
const root = ref<HTMLElement>();
const frame = ref<HTMLIFrameElement>();
const state = ref("idle");
const narrow = ref(true);
const visible = ref(false);
const scale = ref(1);
let near = false;
let mounted = false;
let observer: IntersectionObserver | undefined;
let viewObserver: IntersectionObserver | undefined;
let size: ResizeObserver | undefined;
let media: MediaQueryList;
let cancel: (() => void) | undefined;
let release: (() => void) | undefined;
let timeout: ReturnType<typeof setTimeout> | undefined;
let fade: ReturnType<typeof setTimeout> | undefined;
let firstFrame = 0;
let secondFrame = 0;
const source = computed(() => {
  if (props.part === "full") return props.path || withBase("/demo/explore/");
  const query = new URLSearchParams(Object.entries(props.params).sort(([a], [b]) => a.localeCompare(b)));
  return `${withBase(`/demo/embed/${props.part}/`)}${query.size ? `?${query}` : ""}`;
});
// biome-ignore lint/correctness/noUnusedVariables: used by the Vue template.
const title = computed(() => (props.part === "full" ? "Interactive Basics app demo" : `Interactive Basics ${props.part} demo`));
// biome-ignore lint/correctness/noUnusedVariables: used by the Vue template; raw noscript avoids browser parsing differences during hydration.
const noScript = computed(() => `<a class="app-part-nojs" href="${withBase("/demo/")}">Open live demo</a>`);
function clearTimers() {
  clearTimeout(timeout);
  clearTimeout(fade);
  cancelAnimationFrame(firstFrame);
  cancelAnimationFrame(secondFrame);
}
function sendTheme() {
  frame.value?.contentWindow?.postMessage({ type: "theme", value: isDark.value ? "dark" : "light" }, window.location.origin);
}
function fail() {
  clearTimers();
  state.value = "failed";
  release?.();
  release = undefined;
}
function start() {
  if (!mounted || state.value !== "idle") return;
  state.value = "queued";
  cancel = embedQueue.enqueue((done) => {
    release = done;
    state.value = "loading";
    timeout = setTimeout(fail, 15000);
  });
}
function ready(event: MessageEvent) {
  if (state.value !== "loading" || event.origin !== window.location.origin || event.source !== frame.value?.contentWindow) return;
  if (event.data?.source !== "basics-demo" || event.data.type !== "ready" || event.data.part !== props.part) return;
  clearTimeout(timeout);
  sendTheme();
  // Keep the frame invisible while the child's theme effect commits, then cross-fade.
  firstFrame = requestAnimationFrame(() => {
    secondFrame = requestAnimationFrame(() => {
      state.value = "fading";
      fade = setTimeout(
        () => {
          state.value = "live";
          release?.();
          release = undefined;
        },
        window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 200,
      );
    });
  });
}
function resize() {
  narrow.value = media.matches;
  if (narrow.value && state.value === "queued") {
    cancel?.();
    state.value = "idle";
  }
  if (near && !narrow.value) start();
}
onMounted(() => {
  mounted = true;
  media = window.matchMedia("(max-width: 767px)");
  narrow.value = media.matches;
  media.addEventListener("change", resize);
  window.addEventListener("message", ready);
  size = new ResizeObserver(() => {
    scale.value = (root.value?.clientWidth || 1280) / 1280;
  });
  if (root.value) {
    scale.value = root.value.clientWidth / 1280;
    size.observe(root.value);
    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver(
        (entries) => {
          near = entries.some((entry) => entry.isIntersecting);
          if (near && !narrow.value) start();
          else if (!near && state.value === "queued") {
            cancel?.();
            state.value = "idle";
          }
        },
        { rootMargin: `${window.innerHeight}px 0px`, threshold: 0 },
      );
      observer.observe(root.value);
      viewObserver = new IntersectionObserver((entries) => {
        visible.value = entries.some((entry) => entry.isIntersecting);
      });
      viewObserver.observe(root.value);
    }
  }
});
watch(isDark, sendTheme);
watch(state, (value) => emit("state", value), { immediate: true });
watch(source, () => {
  if (!mounted) return;
  clearTimers();
  cancel?.();
  release = undefined;
  state.value = "idle";
  if (near && !narrow.value) start();
});
onBeforeUnmount(() => {
  mounted = false;
  clearTimers();
  cancel?.();
  observer?.disconnect();
  viewObserver?.disconnect();
  size?.disconnect();
  media?.removeEventListener("change", resize);
  window.removeEventListener("message", ready);
});
defineExpose({ start });
</script>

<template>
  <div ref="root" class="app-part" :class="`app-part-${part}`" :data-part="part" :data-state="state" :data-visible="visible" :aria-busy="state === 'loading' || state === 'queued' || state === 'fading'">
    <PartSkeleton :part="part" />
    <iframe v-if="state === 'loading' || state === 'fading' || state === 'live'" ref="frame" :src="source" :title="title" :class="{ 'is-live': state === 'live' }" :style="part === 'full' ? { transform: `scale(${scale})` } : undefined" :inert="state !== 'live'" :aria-hidden="state !== 'live'" :tabindex="state === 'live' ? 0 : -1" @load="sendTheme" @error="fail" />
    <button v-if="state === 'idle'" class="app-part-try" type="button" @click="start">{{ part === 'full' ? 'Try live demo' : 'Try it' }} <span aria-hidden="true">↗</span></button>
    <span v-if="state === 'loading' || state === 'queued'" class="app-part-status" role="status">{{ state === 'queued' ? 'Waiting to start demo' : 'Starting demo' }}</span>
    <div v-if="state === 'failed'" class="app-part-fallback">
      <slot name="fallback"></slot>
      <div class="app-part-failure-copy"><p role="status">The embedded demo could not start. Open it in a new tab.</p><a :href="withBase('/demo/')" target="_blank" rel="noopener">Open full demo <span aria-hidden="true">↗</span></a></div>
    </div>
    <noscript v-html="noScript"></noscript>
  </div>
</template>
