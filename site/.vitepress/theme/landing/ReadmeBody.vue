<script setup lang="ts">
import { ref } from "vue";
import content from "../../../../scripts/demo/generated/landing.json";
// biome-ignore lint/correctness/noUnusedImports: used by the Vue template.
import AgentTranscript from "./AgentTranscript.vue";
// biome-ignore lint/correctness/noUnusedImports: used by the Vue template.
import AppPart from "./AppPart.vue";
import transcripts from "./transcripts";
import { useReveal } from "./useReveal";

// biome-ignore lint/correctness/noUnusedVariables: iterated by the Vue template.
const sections = [
  { id: "your-stack", title: "Your agent guesses your stack", type: "tech" },
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
      <ol><li v-for="(section, index) in sections" :key="section.id"><a :href="`#${section.id}`"><span :style="{ color: `var(--basics-${section.type})` }" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>{{ section.title }}</a></li></ol>
      <a class="landing-toc-faq" href="#landing-faq-title"><span aria-hidden="true">07</span>Questions before you install</a>
    </nav>
    <div class="landing-sections">
      <section v-for="(section, index) in sections" :key="section.id" :aria-labelledby="section.id" class="landing-section" :style="{ '--section-color': `var(--basics-${section.type})` }">
        <h2 :id="section.id"><span class="landing-section-number" data-reveal="0" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span><span data-reveal="1">{{ section.title }}</span></h2>

        <template v-if="index === 0">
          <p data-reveal="2">Your agent should start with the stack you already trust. Basics ranks technologies from your vault, with the note's own reasons beside each candidate. You choose what fits.</p>
          <figure data-reveal="3" class="landing-part-figure"><AppPart part="recommend" :params="{ scenario: 'nextjs-saas' }" /><figcaption>Five simulated examples from the demo vault. Try a scenario or describe your project.</figcaption></figure>
        </template>

        <template v-else-if="index === 1">
          <p data-reveal="2">An agent can propose a new note or an update, but it does not apply it. You review the reason and diff in the Inbox, then approve or reject. Approved notes record which agent proposed them.</p>
          <figure data-reveal="3" class="landing-part-figure landing-review-artifact">
            <AppPart part="proposal" :params="{ id: 'cli-error-messages' }" />
            <svg class="landing-loop" viewBox="0 0 360 220" role="img" aria-labelledby="review-loop-title" aria-describedby="review-loop-description">
              <title id="review-loop-title">The Basics review loop</title><desc id="review-loop-description">You write your stack. Your agent reads it, proposes a note, and waits for you to approve it. The reviewed knowledge returns to your vault.</desc>
              <defs><marker id="review-loop-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--basics-layer)" /></marker></defs>
              <g fill="none" stroke="var(--basics-layer)" stroke-width="1.5" marker-end="url(#review-loop-arrow)"><path d="M162 40H194" /><path d="M273 68V128" /><path d="M198 160H166" /><path d="M87 132V72" /></g>
              <g fill="var(--basics-surface)" stroke-width="1.5"><rect x="12" y="12" width="150" height="56" rx="10" stroke="var(--basics-tech)" /><rect x="198" y="12" width="150" height="56" rx="10" stroke="var(--basics-practice)" /><rect x="198" y="132" width="150" height="56" rx="10" stroke="var(--basics-project)" /><rect x="12" y="132" width="150" height="56" rx="10" stroke="var(--basics-check)" /></g>
              <g fill="var(--basics-text)" font-size="15" text-anchor="middle"><text x="87" y="46">You write</text><text x="273" y="46">Agent reads</text><text x="273" y="166">Agent proposes</text><text x="87" y="166">You approve</text></g>
            </svg>
            <figcaption>You write the stack. Your agent reads it, proposes a note, and waits for your approval.</figcaption>
          </figure>
        </template>

        <template v-else-if="index === 2">
          <p data-reveal="2">Keep your practices and checks in the vault instead of rewriting them in every repository. Export the chosen stack to Markdown and the instruction files your agents already read. Text outside Basics' marked blocks stays yours.</p>
          <figure data-reveal="3" class="landing-artifact">
            <AgentTranscript :command="content.exported.command" :answer-lines="content.exported.tree.split('\n')" />
            <details class="landing-file-preview" open><summary>Read the generated AGENTS.md excerpt</summary><pre tabindex="0"><code>{{ content.exported.agents }}</code></pre></details>
            <figcaption>Files written by the built CLI in a temporary project, using the demo's Next.js, TypeScript, PostgreSQL and Playwright notes.</figcaption>
          </figure>
        </template>

        <template v-else-if="index === 3">
          <p data-reveal="2">Turn a useful decision into a note you can open in any editor. Frontmatter records when a technology fits; links connect it to the rest of your stack. The graph shows those connections without hiding the Markdown underneath.</p>
          <figure data-reveal="3" class="landing-part-figure"><div class="landing-note-parts" data-testid="note-parts"><AppPart part="note" :params="{ id: noteFocus }" @focus="noteFocus = $event" /><AppPart part="graph" :params="{ focus: noteFocus }" @focus="noteFocus = $event" /></div><figcaption>Plain Markdown and its connected notes. Both views follow the same note.</figcaption></figure>
        </template>

        <template v-else-if="index === 4">
          <p data-reveal="2">Keep the same vault when you switch agents. Basics connects the clients you choose, and can print the registration snippets without changing their settings. Your stack stays in your Markdown files.</p>
          <figure data-reveal="3" class="landing-artifact"><AgentTranscript :command="connect.command.en" :answer-lines="connect.answerLines.en" /><figcaption>Simulated transcript. Supported clients and snippet formats come from Basics; no client is registered here.</figcaption></figure>
        </template>

        <template v-else>
          <p data-reveal="2">Store check commands beside the technologies they validate. Basics runs the checks for your exported stack and records the result on the project note. You can see what failed before calling the work finished.</p>
          <figure data-reveal="3" class="landing-artifact"><AgentTranscript :command="check.command.en" :answer-lines="check.answerLines.en" /><figcaption>Simulated transcript of the demo stack's check list. Commands are listed, not run in your browser.</figcaption></figure>
        </template>
      </section>
    </div>
  </div>
</template>
