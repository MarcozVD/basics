<script setup lang="ts">
import { computed, ref } from "vue";
import transcripts from "./transcripts";
import { useTranscriptReplay } from "./useTranscript";

// biome-ignore lint/correctness/noUnusedVariables: read by the Vue template.
const props = defineProps<{ showAnswer: boolean }>();
const choices = transcripts.entries.filter((entry) => entry.kind === "scenario" || entry.kind === "proposal");
const emit = defineEmits<{ select: [entry: (typeof choices)[number]]; reset: [] }>();
const selected = ref<string | null>(null);
const choice = computed(() => choices.find((entry) => entry.id === selected.value));
const transcriptRoot = ref<HTMLElement>();
const {
  // biome-ignore lint/correctness/noUnusedVariables: read by the Vue template.
  typed,
  // biome-ignore lint/correctness/noUnusedVariables: read by the Vue template.
  phase,
  play,
  reset: resetTranscript,
} = useTranscriptReplay(transcriptRoot, () => (choice.value ? `> ${choice.value.command.en}` : null));
// biome-ignore lint/correctness/noUnusedVariables: called by the Vue template.
function choose(entry: (typeof choices)[number]) {
  selected.value = entry.id;
  play(`> ${entry.command.en}`);
  emit("select", entry);
}
// biome-ignore lint/correctness/noUnusedVariables: called by the Vue template.
function reset() {
  selected.value = null;
  resetTranscript();
  emit("reset");
}
// biome-ignore lint/correctness/noUnusedVariables: presentation metadata read by the Vue template.
const colors: Record<string, string> = {
  "nextjs-saas": "profile",
  "python-api": "tech",
  "cli-tool": "check",
  "mobile-app": "tech",
  "data-pipeline": "practice",
  "agent-proposal": "project",
};
</script>
<template>
  <div class="landing-prompts" data-testid="landing-prompts" :data-state="phase" :data-typing="phase === 'running' && typed !== '> ' + choice?.command.en">
    <div class="landing-chip-row" aria-label="Ask your agent">
      <span class="landing-chip-label" data-reveal="0">Ask your agent:</span>
      <button v-for="(entry, index) in choices" :key="entry.id" :data-reveal="index + 1" type="button" :aria-pressed="selected === entry.id" aria-controls="hero-transcript" class="landing-chip" :style="{ '--chip-color': 'var(--basics-' + colors[entry.id] + ')' }" @click="choose(entry)"><span class="landing-type-dot" aria-hidden="true"></span>{{ entry.label.en }}</button>
    </div>
    <div id="hero-transcript" ref="transcriptRoot" class="landing-transcript" data-reveal="2" :aria-busy="phase === 'running'">
      <p v-if="!choice" class="landing-transcript-idle">Choose a simulated project or review an agent proposal.</p>
      <template v-else>
        <div class="landing-transcript-line"><span class="hero-command"><code class="hero-command-measure" aria-hidden="true">&gt; {{ choice.command.en }}</code><code :aria-hidden="phase !== 'done'">{{ typed }}</code></span><button type="button" class="landing-reset" @click="reset">Reset</button></div>
        <div v-if="props.showAnswer" class="landing-recorded-answer" :aria-hidden="phase !== 'done'" data-testid="recorded-answer"><p class="landing-answer-label">Simulated agent transcript</p><ul><li v-for="(line, index) in choice.answerLines.en" :key="index" :style="{ '--line-delay': index * 40 + 'ms' }">{{ line }}</li></ul></div>
        <p v-else class="landing-transcript-result" :aria-hidden="phase !== 'done'">Simulated example ready in the app. You decide what to use.</p>
      </template>
      <span class="landing-sr-only" role="status" aria-live="polite">{{ phase === 'running' ? 'Typing simulated prompt.' : phase === 'done' ? 'Simulated answer ready.' : '' }}</span>
    </div>
  </div>
</template>
