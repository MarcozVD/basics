<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useTranscript } from "./useTranscript";

const props = defineProps<{ command: string; answerLines: string[] }>();
const root = ref<HTMLElement>();
const active = ref(false);
// biome-ignore lint/correctness/noUnusedVariables: typed and phase are read by the Vue template.
const { typed, phase, play } = useTranscript();
let observer: IntersectionObserver | undefined;
onMounted(() => {
  if (!("IntersectionObserver" in window)) return;
  active.value = true;
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.2)) {
        play(`> ${props.command}`);
        observer?.disconnect();
      }
    },
    { threshold: 0.2 },
  );
  if (root.value) observer.observe(root.value);
});
onBeforeUnmount(() => observer?.disconnect());
</script>
<template>
  <div ref="root" class="agent-transcript" :data-state="active ? phase : 'static'" :data-typing="active && phase === 'running' && typed !== `> ${command}`">
    <pre class="agent-transcript-command" tabindex="0"><code class="agent-transcript-measure" aria-hidden="true">&gt; {{ command }}</code><code :aria-hidden="active && phase !== 'done'">{{ active ? typed : `> ${command}` }}</code></pre>
    <pre class="agent-transcript-answers" tabindex="0" :aria-hidden="active && phase !== 'done'"><code><span v-for="(line, index) in answerLines" :key="index" class="agent-transcript-answer" :style="{ '--line-delay': `${index * 40}ms` }">{{ (line || '\u00a0') + '\n' }}</span></code></pre>
    <span class="landing-sr-only" role="status" aria-live="polite">{{ phase === 'done' ? 'Transcript ready.' : '' }}</span>
  </div>
</template>
