<script setup lang="ts">
import { ref } from "vue";
import { useTranscriptReplay } from "./useTranscript";

const props = defineProps<{ command: string; answerLines: string[] }>();
const root = ref<HTMLElement>();
// biome-ignore lint/correctness/noUnusedVariables: typed and phase are read by the Vue template.
const { typed, phase, active } = useTranscriptReplay(root, () => `> ${props.command}`);
</script>
<template>
  <div ref="root" class="agent-transcript" :data-state="active ? phase : 'static'" :data-typing="active && phase === 'running' && typed !== `> ${command}`">
    <pre class="agent-transcript-command" tabindex="0"><code class="agent-transcript-measure" aria-hidden="true">&gt; {{ command }}</code><code :aria-hidden="active && phase !== 'done'">{{ active ? typed : `> ${command}` }}</code></pre>
    <pre class="agent-transcript-answers" tabindex="0" :aria-hidden="active && phase !== 'done'"><code><span v-for="(line, index) in answerLines" :key="index" class="agent-transcript-answer" :style="{ '--line-delay': `${index * 40}ms` }">{{ (line || '\u00a0') + '\n' }}</span></code></pre>
    <span class="landing-sr-only" role="status" aria-live="polite">{{ phase === 'done' ? 'Transcript ready.' : '' }}</span>
  </div>
</template>
