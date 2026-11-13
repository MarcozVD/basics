<script setup lang="ts">
// biome-ignore lint/correctness/noUnusedImports: used by the Vue template.
import { useData, withBase } from "vitepress";
import { computed, ref } from "vue";
// biome-ignore lint/correctness/noUnusedImports: used by the Vue template.
import content from "../../../scripts/demo/generated/landing.json";
// biome-ignore lint/correctness/noUnusedImports: used by the Vue template.
import AgentTranscript from "./landing/AgentTranscript.vue";
// biome-ignore lint/correctness/noUnusedImports: used by the Vue template.
import AppPart from "./landing/AppPart.vue";
import transcripts from "./landing/transcripts";
import { useReveal } from "./landing/useReveal";

const pages = [
  {
    id: "recommend",
    label: "Recommend",
    title: "Your agent guesses your stack.",
    answer: "Rank technologies from your own notes, read why they fit, and choose the stack yourself.",
    guide: "recommend",
    blocks: [
      {
        title: "Describe the project",
        text: "Start with what you are building, including constraints such as language and whether you need SEO. The CLI ranks tech notes by layer.",
        command: 'basics recommend "REST API without SEO, in TypeScript"',
      },
      {
        title: "Read the reasons",
        text: "The app shows Matches, Fits profile and Watch out. Open Why for the score breakdown; keyword matching is local and embeddings are opt-in.",
        command: 'basics recommend "REST API to serve ML models" --json',
      },
      {
        title: "Choose what travels with the stack",
        text: "Select the technologies that fit, then export their practices and checks to your project. Export writes the instruction files your agents read.",
        command: "basics export ./sample-app --stack nextjs,typescript,postgresql,playwright --targets agents,claude,cursor",
      },
    ],
  },
  {
    id: "inbox",
    label: "Inbox",
    title: "Agents rewrite your notes behind your back.",
    answer: "Review each proposed change and its reason before approving it into your vault.",
    guide: "web-ui#reviewing-proposals",
    blocks: [
      {
        title: "A proposal, not a direct write",
        text: "The MCP tool propose_note creates an Inbox proposal for a new note or an update. List pending proposals from the CLI; propose_note is an MCP tool, not a shell command.",
        command: "basics inbox list",
      },
      {
        title: "Read the change and its source",
        text: "Open the reason and diff in the app, or inspect the proposal from the terminal. The example comes from opencode; approved notes retain their agent provenance.",
        command: "basics inbox show cli-error-messages",
      },
      {
        title: "Approve or reject",
        text: "Approve the reviewed change, or reject it. In the app, Edit and approve lets you adjust it first; the delayed save offers Undo. This demo changes memory only.",
        command: "basics inbox approve cli-error-messages\n# Or reject it instead:\nbasics inbox reject cli-error-messages",
      },
    ],
  },
  {
    id: "graph",
    label: "Graph & notes",
    title: "Your knowledge is scattered in chats.",
    answer: "Keep decisions in plain Markdown and follow their connections through notes and graph.",
    guide: "notes#wikilinks",
    blocks: [
      {
        title: "Find the decision",
        text: "Search the same vault your agents read. A note is a Markdown file with frontmatter, so you can open it in your own editor too.",
        command: 'basics search "server rendering"',
      },
      {
        title: "Link notes by id",
        text: "Write [[nextjs]] or [[react]] in a note body. Basics derives backlinks; the graph shows connections, with type and layer filters and neighborhood focus.",
        command: "basics list --type tech",
      },
      {
        title: "Keep the links sound",
        text: "Validation checks frontmatter, duplicate ids and broken links. Run it after hand-editing notes or reviewing a batch of proposals.",
        command: "basics validate",
      },
    ],
  },
  {
    id: "export-connect",
    label: "Export & connect",
    title: "You paste the same rules every project.",
    answer: "Export your stack’s practices and checks, then connect your agents to the same Markdown vault.",
    guide: "projects-and-checks",
    blocks: [
      {
        title: "Export once, update when needed",
        text: "Write STACK.md, AGENTS.md, CLAUDE.md and Cursor rules. The stack and targets stay in basics.json; later exports can use that saved choice. Text outside marked instruction blocks stays yours.",
        command: "basics export ./sample-app --stack nextjs,typescript,postgresql,playwright --targets agents,claude,cursor",
      },
      {
        title: "Connect the agents you use",
        text: "Print registration snippets without changing settings. Supported client ids and snippet formats below come from Basics itself; no client is registered in this demo.",
        command: "basics connect --print",
      },
      {
        title: "Inspect checks before running them",
        text: "Check commands come from your vault notes. List their trust state first; --list does not execute them. A normal check run asks before running an untrusted command and records results on the project note.",
        command: "basics check ./sample-app --only typescript-typecheck --list",
      },
    ],
  },
];
const { frontmatter } = useData();
const index = computed(() =>
  Math.max(
    0,
    pages.findIndex((page) => page.id === frontmatter.value.feature),
  ),
);
// biome-ignore lint/correctness/noUnusedVariables: used by the Vue template.
const feature = computed(() => pages[index.value]);
// biome-ignore lint/correctness/noUnusedVariables: used by the Vue template.
const previous = computed(() => pages[(index.value + pages.length - 1) % pages.length]);
// biome-ignore lint/correctness/noUnusedVariables: used by the Vue template.
const next = computed(() => pages[(index.value + 1) % pages.length]);
// biome-ignore lint/correctness/noUnusedVariables: used by the Vue template.
const focus = ref("nextjs");
// biome-ignore lint/correctness/noUnusedVariables: used by the Vue template.
const transcript = (id: string) => transcripts.entries.find((entry) => entry.id === id)!;
const root = ref<HTMLElement>();
useReveal(root);
</script>

<template>
  <article :key="feature.id" ref="root" class="feature-page" :aria-labelledby="`feature-${feature.id}`">
    <header class="feature-intro">
      <p class="feature-eyebrow" data-reveal="0">Product / {{ feature.label }}</p>
      <h1 :id="`feature-${feature.id}`" data-reveal="1">{{ feature.title }}</h1>
      <p class="feature-answer" data-reveal="2">{{ feature.answer }}</p>
    </header>
    <figure class="landing-part-figure feature-demo">
      <AppPart data-reveal="3" v-if="feature.id === 'recommend'" part="recommend" :params="{ scenario: 'nextjs-saas' }" />
      <AppPart data-reveal="3" v-else-if="feature.id === 'inbox'" part="proposal" :params="{ id: 'cli-error-messages' }" />
      <div v-else-if="feature.id === 'graph'" class="landing-note-parts"><AppPart data-reveal="3" part="note" :params="{ id: focus }" @focus="focus = $event" /><AppPart data-reveal="3" part="graph" :params="{ focus }" @focus="focus = $event" /></div>
      <AppPart data-reveal="3" v-else part="explore" :params="{ type: 'check' }" />
      <figcaption data-reveal="4" v-if="feature.id === 'recommend'">Five simulated scenarios from the demo vault. Choose an example or describe a project.</figcaption>
      <figcaption data-reveal="4" v-else-if="feature.id === 'inbox'">Review Actionable CLI errors, proposed by opencode. Approval changes only this demo’s memory.</figcaption>
      <figcaption data-reveal="4" v-else-if="feature.id === 'graph'">Select a connected note. Both views follow the same focus.</figcaption>
      <figcaption data-reveal="4" v-else>Explore check notes from the demo vault before exporting a stack.</figcaption>
    </figure>
    <div class="feature-reading">
      <section v-for="(block, blockIndex) in feature.blocks" :key="block.title" class="feature-block">
        <h2><span data-reveal="0" aria-hidden="true">{{ String(blockIndex + 1).padStart(2, '0') }}</span><span data-reveal="1">{{ block.title }}</span></h2>
        <p data-reveal="2">{{ block.text }}</p>
        <template v-if="feature.id === 'export-connect'">
          <figure class="landing-artifact">
            <AgentTranscript data-reveal="3" v-if="blockIndex === 0" :command="content.exported.command" :answer-lines="content.exported.tree.split('\n')" />
            <AgentTranscript data-reveal="3" v-else :command="transcript(blockIndex === 1 ? 'basics-connect' : 'basics-check').command.en" :answer-lines="transcript(blockIndex === 1 ? 'basics-connect' : 'basics-check').answerLines.en" />
            <figcaption data-reveal="4">{{ blockIndex === 0 ? 'Generated by the CLI in a temporary demo project.' : 'Simulated transcript; no agent registration or check execution in this browser.' }}</figcaption>
          </figure>
        </template>
        <pre v-else data-reveal="3" tabindex="0"><code>{{ block.command }}</code></pre>
      </section>
      <p class="feature-guide" data-reveal="0"><a :href="withBase(`/guide/${feature.guide.replace('#', '.html#')}${feature.guide.includes('#') ? '' : '.html'}`)">Read the {{ feature.label }} guide <span aria-hidden="true">↗</span></a><template v-if="feature.id === 'export-connect'"> · <a :href="withBase('/guide/mcp-clients.html')">MCP client setup</a></template></p>
      <nav class="feature-pagination" aria-label="Features"><a data-reveal="1" :href="withBase(`/features/${previous.id}/`)"><span>Previous feature</span>{{ previous.label }}</a><a data-reveal="2" :href="withBase(`/features/${next.id}/`)"><span>Next feature</span>{{ next.label }}</a></nav>
    </div>
  </article>
</template>

<style scoped>
.feature-page { max-width: 1032px; margin: 0 auto; padding: 72px 24px 80px; }
.feature-intro, .feature-reading { max-width: 720px; margin: 0 auto; }
.feature-eyebrow { color: var(--basics-muted); font-size: 13px; margin: 0 0 24px; }
h1 { font-size: clamp(34px, 4.4vw, 56px); line-height: 1.08; letter-spacing: -.045em; font-weight: 600; text-wrap: balance; }
.feature-answer { margin-top: 24px; font-size: 19px; line-height: 1.6; color: var(--basics-muted); }
.feature-demo { margin: 40px 0 64px; }
.feature-block { margin-top: clamp(64px, 12vh, 128px); }
h2 { font-size: 25px; line-height: 1.3; letter-spacing: -.025em; font-weight: 550; display: flex; gap: 16px; }
h2 > span:first-child { color: var(--vp-c-brand-1); font: 12px/32px var(--vp-font-family-mono); letter-spacing: 0; }
.feature-block p { margin: 16px 0 20px; line-height: 1.75; color: var(--basics-muted); }
pre { padding: 20px; background: var(--basics-surface); border: 1px solid var(--basics-border); border-radius: 8px; overflow-x: auto; font: 13px/1.75 var(--vp-font-family-mono); }
.feature-guide { margin: 48px 0; color: var(--vp-c-brand-1); line-height: 1.8; }
a:hover { text-decoration: underline; }
.feature-pagination { border-top: 1px solid var(--basics-border); padding-top: 24px; display: flex; justify-content: space-between; gap: 24px; }
.feature-pagination a:last-child { text-align: right; }
.feature-pagination span { display: block; color: var(--basics-muted); font-size: 12px; margin-bottom: 6px; }
@media (max-width: 767px) { .feature-page { padding: 40px 20px 56px; } .feature-demo { margin: 32px 0 40px; } .feature-answer { font-size: 17px; } h2 { font-size: 22px; gap: 12px; } }
</style>
