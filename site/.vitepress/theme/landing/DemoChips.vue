<script setup lang="ts">
import { computed, ref } from "vue";
import transcripts from "./transcripts";
import { useTranscript } from "./useTranscript";

// biome-ignore lint/correctness/noUnusedVariables: read by the Vue template.
const props = defineProps<{ showAnswer: boolean }>();
const choices = transcripts.entries.filter((entry) => entry.kind === "scenario" || entry.kind === "proposal");
const emit = defineEmits<{ select: [entry: (typeof choices)[number]]; reset: [] }>();
const selected = ref<string | null>(null);
// biome-ignore lint/correctness/noUnusedVariables: read by the Vue template.
const choice = computed(() => choices.find((entry) => entry.id === selected.value));
// biome-ignore lint/correctness/noUnusedVariables: typed and phase are read by the Vue template.
const { typed, phase, play, reset: resetTranscript } = useTranscript();
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
      <span class="landing-chip-label">Ask your agent:</span>
      <button v-for="entry in choices" :key="entry.id" type="button" :aria-pressed="selected === entry.id" aria-controls="hero-transcript" class="landing-chip" :style="{ '--chip-color': 'var(--basics-' + colors[entry.id] + ')' }" @click="choose(entry)"><span class="landing-type-dot" aria-hidden="true"></span>{{ entry.label.en }}</button>
    </div>
    <div id="hero-transcript" class="landing-transcript" :aria-busy="phase === 'running'">
      <p v-if="phase === 'idle'" class="landing-transcript-idle">Choose a simulated project or review an agent proposal.</p>
      <template v-else>
        <div class="landing-transcript-line"><code :aria-hidden="phase === 'running'">{{ typed }}</code><button type="button" class="landing-reset" @click="reset">Reset</button></div>
        <div v-if="props.showAnswer && phase === 'done' && choice" class="landing-recorded-answer" data-testid="recorded-answer"><p class="landing-answer-label">Simulated agent transcript</p><ul><li v-for="(line, index) in choice.answerLines.en" :key="index" :style="{ '--line-delay': index * 40 + 'ms' }">{{ line }}</li></ul></div>
        <p v-else-if="phase === 'done'" class="landing-transcript-result">Simulated example ready in the app. You decide what to use.</p>
      </template>
      <span class="landing-sr-only" role="status" aria-live="polite">{{ phase === 'running' ? 'Typing simulated prompt.' : phase === 'done' ? 'Simulated answer ready.' : '' }}</span>
    </div>
  </div>
</template>
