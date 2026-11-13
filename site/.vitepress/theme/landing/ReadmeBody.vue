<script setup lang="ts">
// biome-ignore lint/correctness/noUnusedImports: used by the Vue template.
import content from "../../../../scripts/demo/generated/landing.json";

// biome-ignore lint/correctness/noUnusedVariables: iterated by the Vue template.
const sections = [
  { id: "your-stack", title: "Your agent guesses your stack", type: "tech" },
  { id: "your-review", title: "Agents rewrite your notes behind your back", type: "project" },
  { id: "your-rules", title: "You paste the same rules every project", type: "practice" },
  { id: "your-notes", title: "Your knowledge is scattered in chats", type: "profile" },
  { id: "your-agents", title: "Locked to one agent", type: "layer" },
  { id: "your-checks", title: "Checks get forgotten", type: "check" },
];
</script>

<template>
  <div class="landing-readme" data-testid="landing-readme">
    <nav class="landing-toc" aria-label="On this page">
      <ol><li v-for="(section, index) in sections" :key="section.id"><a :href="`#${section.id}`"><span :style="{ color: `var(--basics-${section.type})` }" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>{{ section.title }}</a></li></ol>
      <a class="landing-toc-faq" href="#landing-faq-title"><span aria-hidden="true">07</span>Questions before you install</a>
    </nav>
    <div class="landing-sections">
      <section v-for="(section, index) in sections" :key="section.id" :aria-labelledby="section.id" class="landing-section" :style="{ '--section-color': `var(--basics-${section.type})` }">
        <h2 :id="section.id"><span class="landing-section-number" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>{{ section.title }}</h2>

        <template v-if="index === 0">
          <p>Your agent should start with the stack you already trust. Basics ranks technologies from your vault, with the note's own reasons beside each candidate. You choose what fits.</p>
          <figure class="landing-artifact">
            <pre class="landing-artifact-command"><code>{{ content.choices[0].prompt }}</code></pre>
            <ul class="landing-shortlist"><li v-for="answer in content.choices[0].answer" :key="answer.id"><strong>{{ answer.layer }}: {{ answer.title }}</strong><span>{{ answer.reasonLabel }}: {{ answer.reason }}</span></li></ul>
            <figcaption>Recorded from the public-packs demo vault. A shortlist to review, not a decision made for you.</figcaption>
          </figure>
        </template>

        <template v-else-if="index === 1">
          <p>An agent can propose a new note or an update, but it does not apply it. You review the reason and diff in the Inbox, then approve or reject. Approved notes record which agent proposed them.</p>
          <figure class="landing-artifact landing-review-artifact">
            <p class="landing-artifact-caption"><strong>{{ content.proposal.agent }} proposed {{ content.proposal.id }}</strong><span>{{ content.proposal.reason }}</span></p>
            <pre class="landing-diff"><code><span v-for="(line, lineIndex) in content.proposal.diff.split('\n')" :key="lineIndex" :class="{ 'diff-add': line.startsWith('+') && !line.startsWith('+++') }">{{ line }}
</span></code></pre>
            <a class="landing-artifact-link" href="/basics/demo/inbox/cli-error-messages/" target="_blank" rel="noopener">Review this proposal in the demo <span aria-hidden="true">↗</span></a>
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
          <p>Keep your practices and checks in the vault instead of rewriting them in every repository. Export the chosen stack to Markdown and the instruction files your agents already read. Text outside Basics' marked blocks stays yours.</p>
          <figure class="landing-artifact">
            <pre class="landing-artifact-command"><code>&gt; {{ content.exported.command }}</code></pre>
            <pre><code>{{ content.exported.tree }}</code></pre>
            <details class="landing-file-preview" open><summary>Read the generated AGENTS.md excerpt</summary><pre tabindex="0"><code>{{ content.exported.agents }}</code></pre></details>
            <figcaption>Files written by the built CLI in a temporary project, using the demo's Next.js, TypeScript, PostgreSQL and Playwright notes.</figcaption>
          </figure>
        </template>

        <template v-else-if="index === 3">
          <p>Turn a useful decision into a note you can open in any editor. Frontmatter records when a technology fits; links connect it to the rest of your stack. The graph shows those connections without hiding the Markdown underneath.</p>
          <figure class="landing-artifact landing-note-artifact">
            <pre tabindex="0"><code>{{ content.note.markdown }}</code></pre>
            <svg class="landing-neighborhood" viewBox="0 0 400 280" role="img" aria-labelledby="note-graph-title" aria-describedby="note-graph-description">
              <title id="note-graph-title">{{ content.note.title }} and its connected notes</title><desc id="note-graph-description">{{ content.note.neighbors.map(node => node.title).join(', ') }}</desc>
              <line v-for="node in content.note.neighbors" :key="`edge-${node.id}`" x1="200" y1="140" :x2="node.x" :y2="node.y" stroke="var(--basics-layer)" stroke-width="1.5" />
              <circle cx="200" cy="140" r="10" fill="var(--basics-tech)" /><text x="200" y="168" text-anchor="middle" fill="var(--basics-text)" font-size="17">{{ content.note.title }}</text>
              <g v-for="node in content.note.neighbors" :key="node.id"><circle :cx="node.x" :cy="node.y" r="6" :fill="`var(--basics-${node.type})`" /><text :x="node.x" :y="node.labelY" :text-anchor="node.anchor" fill="var(--basics-text)" font-size="15">{{ node.title }}</text></g>
            </svg>
            <figcaption>Markdown from <code>nextjs.md</code>, with connections read from the recorded demo graph.</figcaption>
          </figure>
        </template>

        <template v-else-if="index === 4">
          <p>Keep the same vault when you switch agents. Basics connects the clients you choose, and can print the registration snippets without changing their settings. Your stack stays in your Markdown files.</p>
          <figure class="landing-artifact">
            <pre><code>&gt; {{ content.connect.command }}</code></pre>
            <p class="landing-artifact-caption">Supported clients</p>
            <ul class="landing-client-list"><li v-for="client in content.connect.clients" :key="client">{{ client }}</li></ul>
            <figcaption>Client ids and snippet headings come from the recorded API and built CLI.</figcaption>
          </figure>
        </template>

        <template v-else>
          <p>Store check commands beside the technologies they validate. Basics runs the checks for your exported stack and records the result on the project note. You can see what failed before calling the work finished.</p>
          <figure class="landing-artifact">
            <pre><code>&gt; {{ content.checks.command }}
{{ content.checks.failed }}</code></pre>
            <p class="landing-check-change">After correcting the TypeScript value:</p>
            <pre><code>&gt; {{ content.checks.command }}
{{ content.checks.passed }}</code></pre>
            <figcaption>A real failing and passing run of the public <code>typescript-typecheck</code> check in a temporary project.</figcaption>
          </figure>
        </template>
      </section>
    </div>
  </div>
</template>
