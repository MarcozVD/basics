<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import content from "../../../../scripts/demo/generated/landing.json";

// biome-ignore lint/correctness/noUnusedVariables: read by the Vue template.
const props = defineProps<{ showAnswer: boolean }>();
const emit = defineEmits<{ select: [path: string]; reset: [] }>();
const selected = ref<string | null>(null);
const phase = ref<"idle" | "running" | "done">("idle");
const typed = ref("");
// biome-ignore lint/correctness/noUnusedVariables: read by the Vue template.
const choice = computed(() => content.choices.find((entry) => entry.id === selected.value));
let timer: ReturnType<typeof setTimeout> | undefined;
let epoch = 0;

// biome-ignore lint/correctness/noUnusedVariables: called by the chip buttons in the Vue template.
function choose(entry: (typeof content.choices)[number]) {
  clearTimeout(timer);
  const run = ++epoch;
  selected.value = entry.id;
  typed.value = "";
  phase.value = "running";
  emit("select", entry.path);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    typed.value = entry.prompt;
    phase.value = "done";
    return;
  }
  const start = performance.now();
  function tick() {
    if (run !== epoch) return;
    const progress = Math.min(1, (performance.now() - start) / 400);
    typed.value = entry.prompt.slice(0, Math.ceil(entry.prompt.length * progress));
    if (progress === 1) phase.value = "done";
    else timer = setTimeout(tick, 16);
  }
  tick();
}
// biome-ignore lint/correctness/noUnusedVariables: called by the reset button in the Vue template.
function reset() {
  clearTimeout(timer);
  epoch++;
  selected.value = null;
  typed.value = "";
  phase.value = "idle";
  emit("reset");
}
onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <div class="landing-prompts" data-testid="landing-prompts" :data-state="phase">
    <div class="landing-chip-row" aria-label="Ask your agent">
      <span class="landing-chip-label">Ask your agent:</span>
      <button v-for="entry in content.choices" :key="entry.id" type="button" :aria-pressed="selected === entry.id" aria-controls="hero-transcript" class="landing-chip" :style="{ '--chip-color': `var(--basics-${entry.type})` }" @click="choose(entry)">
        <span class="landing-type-dot" aria-hidden="true"></span>{{ entry.label }}
      </button>
    </div>
    <div id="hero-transcript" class="landing-transcript" :aria-busy="phase === 'running'">
      <p v-if="phase === 'idle'" class="landing-transcript-idle">Choose a project or review an agent proposal.</p>
      <template v-else>
        <div class="landing-transcript-line">
          <code :aria-hidden="phase === 'running'">{{ typed }}</code>
          <button type="button" class="landing-reset" @click="reset">Reset</button>
        </div>
        <div v-if="props.showAnswer && phase === 'done' && choice" class="landing-recorded-answer" data-testid="recorded-answer">
          <p class="landing-answer-label">{{ choice.id === 'agent-proposal' ? 'Pending your review' : 'Recorded shortlist from the demo vault' }}</p>
          <ul>
            <li v-for="answer in choice.answer" :key="answer.id"><strong>{{ answer.layer }}: {{ answer.title }}</strong><span>{{ answer.reasonLabel }}: {{ answer.reason }}</span></li>
          </ul>
        </div>
        <p v-else-if="phase === 'done'" class="landing-transcript-result">{{ selected === 'agent-proposal' ? 'A proposal is waiting in the Inbox. You decide what gets written.' : 'Recorded shortlist ready in the app. Open each note to read its reasons.' }}</p>
      </template>
      <span class="landing-sr-only" role="status" aria-live="polite">{{ phase === 'running' ? 'Running recorded prompt.' : phase === 'done' ? 'Recorded answer ready.' : '' }}</span>
    </div>
  </div>
</template>
