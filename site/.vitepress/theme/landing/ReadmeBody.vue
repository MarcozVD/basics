<script setup lang="ts">
// biome-ignore lint/correctness/noUnusedImports: used by the Vue template.
import { withBase } from "vitepress";
import { ref } from "vue";
// biome-ignore lint/correctness/noUnusedImports: used by the Vue template.
import comparison from "../../../../scripts/demo/compare-recorded.json";
import content from "../../../../scripts/demo/generated/landing.json";
// biome-ignore lint/correctness/noUnusedImports: used by the Vue template.
import AgentTranscript from "./AgentTranscript.vue";
// biome-ignore lint/correctness/noUnusedImports: used by the Vue template.
import AppPart from "./AppPart.vue";
import transcripts from "./transcripts";
import { useReveal } from "./useReveal";

// biome-ignore lint/correctness/noUnusedVariables: iterated by the Vue template.
const sections = [
  { id: "your-stack", title: "Your agent picks tools from scratch", type: "tech" },
  { id: "your-review", title: "Agents rewrite your notes behind your back", type: "project" },
  { id: "your-rules", title: "You paste the same rules every project", type: "practice" },
  { id: "your-notes", title: "Your knowledge is scattered in chats", type: "profile" },
  { id: "your-agents", title: "Locked to one agent", type: "layer" },
  { id: "your-checks", title: "Checks get forgotten", type: "check" },
];
// biome-ignore lint/correctness/noUnusedVariables: used by the Vue template.
const connect = transcripts.entries.find((entry) => entry.id === "basics-connect")!;
// biome-ignore lint/correctness/noUnusedVariables: used by the Vue template.
const check = transcripts.entries.find((entry) => entry.id === "basics-check")!;
// biome-ignore lint/correctness/noUnusedVariables: used by the Vue template.
const noteFocus = ref(content.note.id);
const revealRoot = ref<HTMLElement>();
useReveal(revealRoot);
</script>

<template>
  <div ref="revealRoot" class="landing-readme" data-testid="landing-readme">
    <nav class="landing-toc" aria-label="On this page">
      <ol><li data-reveal="0" v-for="(section, index) in sections" :key="section.id"><a :href="`#${section.id}`"><span :style="{ color: `var(--basics-${section.type})` }" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>{{ section.title }}</a></li><li data-reveal="0"><a href="#recorded-compare-title"><span :style="{ color: 'var(--basics-layer)' }" aria-hidden="true">07</span>Compare the same task, both ways</a></li></ol>
      <a class="landing-toc-faq" data-reveal="1" href="#landing-faq-title"><span aria-hidden="true">08</span>Questions before you install</a>
    </nav>
    <div class="landing-sections">
      <section v-for="(section, index) in sections" :key="section.id" :aria-labelledby="section.id" class="landing-section" :style="{ '--section-color': `var(--basics-${section.type})` }">
        <h2 :id="section.id"><span class="landing-section-number" data-reveal="0" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span><span data-reveal="1">{{ section.title }}</span></h2>

        <template v-if="index === 0">
          <p data-reveal="2">Without your past choices, an agent picks tools from scratch. Basics suggests tools from your <a :href="withBase('/guide/glossary.html#vault')">vault</a>, a folder of notes about how you build. A <a :href="withBase('/guide/glossary.html#profile')">profile</a> saves a set of tools for a type of project. You choose what fits.</p>
          <figure class="landing-part-figure"><AppPart data-reveal="3" part="recommend" :params="{ scenario: 'nextjs-saas' }" /><figcaption data-reveal="5">Five simulated examples from the demo vault. Try a scenario or describe your project.</figcaption></figure>
        </template>

        <template v-else-if="index === 1">
          <p data-reveal="2">Useful changes are easy to miss in a chat. In Basics, a <a :href="withBase('/guide/glossary.html#proposal')">proposal</a> is a suggested note change. It waits in your <a :href="withBase('/guide/glossary.html#inbox')">Inbox</a>, the place where you review changes, until you approve or reject it.</p>
          <figure class="landing-part-figure landing-review-artifact">
            <AppPart data-reveal="3" part="proposal" :params="{ id: 'cli-error-messages' }" />
            <svg data-reveal="4" class="landing-loop" viewBox="0 0 360 220" role="img" aria-labelledby="review-loop-title" aria-describedby="review-loop-description">
              <title id="review-loop-title">The Basics review loop</title><desc id="review-loop-description">You write your stack. Your agent reads it, proposes a note, and waits for you to approve it. The reviewed knowledge returns to your vault.</desc>
              <defs><marker id="review-loop-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--basics-layer)" /></marker></defs>
              <g fill="none" stroke="var(--basics-layer)" stroke-width="1.5" marker-end="url(#review-loop-arrow)"><path d="M162 40H194" /><path d="M273 68V128" /><path d="M198 160H166" /><path d="M87 132V72" /></g>
              <g fill="var(--basics-surface)" stroke-width="1.5"><rect x="12" y="12" width="150" height="56" rx="10" stroke="var(--basics-tech)" /><rect x="198" y="12" width="150" height="56" rx="10" stroke="var(--basics-practice)" /><rect x="198" y="132" width="150" height="56" rx="10" stroke="var(--basics-project)" /><rect x="12" y="132" width="150" height="56" rx="10" stroke="var(--basics-check)" /></g>
              <g fill="var(--basics-text)" font-size="15" text-anchor="middle"><text x="87" y="46">You write</text><text x="273" y="46">Agent reads</text><text x="273" y="166">Agent proposes</text><text x="87" y="166">You approve</text></g>
            </svg>
            <figcaption data-reveal="5">You write the stack. Your agent reads it, proposes a note, and waits for your approval.</figcaption>
          </figure>
        </template>

        <template v-else-if="index === 2">
          <p data-reveal="2">Repeating the same rules in every project wastes time. Keep your working rules and <a :href="withBase('/guide/glossary.html#check')">checks</a>, commands that verify the work, beside your notes. Export them to the instruction files your agents already read. Text outside Basics' marked blocks stays yours.</p>
          <figure class="landing-artifact">
            <AgentTranscript data-reveal="3" :command="content.exported.command" :answer-lines="content.exported.tree.split('\n')" />
            <details data-reveal="4" class="landing-file-preview" open><summary>Read the generated AGENTS.md excerpt</summary><pre tabindex="0"><code>{{ content.exported.agents }}</code></pre></details>
            <figcaption data-reveal="5">Files written by the built CLI in a temporary project, using the demo's Next.js, TypeScript, PostgreSQL and Playwright notes.</figcaption>
          </figure>
        </template>

        <template v-else-if="index === 3">
          <p data-reveal="2">Decisions disappear into old chats. Keep each one in a plain text note you can open in any editor. Links connect related notes, and the graph helps you follow those connections.</p>
          <figure class="landing-part-figure"><div class="landing-note-parts" data-testid="note-parts"><AppPart data-reveal="3" part="note" :params="{ id: noteFocus }" @focus="noteFocus = $event" /><AppPart data-reveal="3" part="graph" :params="{ focus: noteFocus }" @focus="noteFocus = $event" /></div><figcaption data-reveal="5">Plain Markdown and its connected notes. Both views follow the same note.</figcaption></figure>
        </template>

        <template v-else-if="index === 4">
          <p data-reveal="2">Switching agents should not mean copying your instructions again. Connect each agent to the same notes over <a :href="withBase('/guide/glossary.html#mcp')">MCP</a>, a standard that lets agents use outside tools. A <a :href="withBase('/guide/glossary.html#skill')">skill</a> is a short guide that tells an agent when to use Basics.</p>
          <figure class="landing-artifact"><AgentTranscript data-reveal="3" :command="connect.command.en" :answer-lines="connect.answerLines.en" /><figcaption data-reveal="5">Simulated transcript. Supported clients and snippet formats come from Basics; no client is registered here.</figcaption></figure>
        </template>

        <template v-else>
          <p data-reveal="2">An agent can finish a task without testing its work. Keep the commands that verify each tool beside its note. Basics can run these checks for a project and record the results, so you can see what failed.</p>
          <figure class="landing-artifact"><AgentTranscript data-reveal="3" :command="check.command.en" :answer-lines="check.answerLines.en" /><figcaption data-reveal="5">Simulated transcript of the demo stack's check list. Commands are listed, not run in your browser.</figcaption></figure>
        </template>
      </section>
    <section class="landing-section" aria-labelledby="recorded-compare-title" style="--section-color: var(--basics-layer)">
        <h2 id="recorded-compare-title"><span class="landing-section-number" data-reveal="0" aria-hidden="true">07</span><span data-reveal="1">Compare the same task, both ways</span></h2>
        <p data-reveal="2">One recorded Claude Haiku run built a CSV reporting tool with and without Basics. This snapshot is not evidence of a general improvement. No agent runs in your browser.</p>
        <div data-reveal="3" class="landing-artifact" style="overflow-x: auto">
          <table class="recorded-compare">
            <caption>One recorded run: CSV report</caption>
            <thead><tr><th scope="col">Condition</th><th scope="col">Time</th><th scope="col">Checks passed</th><th scope="col">Stack agreement</th></tr></thead>
            <tbody><tr v-for="result in comparison.results" :key="result.condition"><th scope="row">{{ result.condition === 'with_basics' ? 'With Basics' : 'Without Basics' }}</th><td>{{ (result.wall_ms / 1000).toFixed(1) }} s</td><td>{{ result.checks_passed }}/{{ result.checks.length }}</td><td>{{ result.stack_match === null ? 'Not reported' : `${Math.round(result.stack_match * 100)}%` }}</td></tr></tbody>
          </table>
        </div>
        <p data-reveal="4"><a :href="withBase('/demo/compare/')">Inspect the recorded outputs and checks</a></p>
    </section>
    </div>
  </div>
</template>

<style scoped>
.recorded-compare { width: 100%; border-collapse: collapse; font-size: 14px; }
.recorded-compare caption { text-align: left; margin-bottom: 16px; }
.recorded-compare :is(th, td) { padding: 12px; text-align: left; border-bottom: 1px solid var(--basics-border); }
</style>
