<script setup lang="ts">
defineProps<{ part: "full" | "explore" | "note" | "graph" | "proposal" | "recommend" }>();
</script>

<template>
  <div class="part-skeleton" :class="`skeleton-${part}`" aria-hidden="true" :data-skeleton="part">
    <aside v-if="part === 'full'" class="skeleton-sidebar"><i class="skeleton-bar skeleton-logo"></i><i v-for="row in 8" :key="row" class="skeleton-bar"></i></aside>
    <div v-if="part !== 'graph'" class="skeleton-content">
      <div class="skeleton-heading"><i v-if="part === 'proposal'" class="skeleton-avatar"></i><i class="skeleton-bar skeleton-title"></i></div>
      <template v-if="part === 'explore' || part === 'full'"><div class="skeleton-filters"><i v-for="filter in 4" :key="filter"></i></div><div v-for="row in 6" :key="row" class="skeleton-row"><i class="skeleton-dot"></i><i class="skeleton-bar"></i><i class="skeleton-bar skeleton-meta"></i></div></template>
      <template v-else-if="part === 'note'"><div class="skeleton-frontmatter"><i v-for="line in 5" :key="line" class="skeleton-bar"></i></div><div v-for="paragraph in 3" :key="paragraph" class="skeleton-paragraph"><i class="skeleton-bar"></i><i class="skeleton-bar"></i></div><div class="skeleton-filters"><i></i><i></i></div></template>
      <template v-else-if="part === 'proposal'"><div class="skeleton-paragraph"><i class="skeleton-bar"></i><i class="skeleton-bar"></i></div><div class="skeleton-diff"><i v-for="line in 7" :key="line" class="skeleton-bar"></i></div><div class="skeleton-filters skeleton-actions"><i></i><i></i><i></i></div></template>
      <template v-else-if="part === 'recommend'"><div class="skeleton-input"></div><div class="skeleton-filters"><i v-for="chip in 5" :key="chip"></i></div><div v-for="layer in 3" :key="layer" class="skeleton-shortlist"><i class="skeleton-bar skeleton-title"></i><div class="skeleton-row"><i class="skeleton-dot"></i><i class="skeleton-bar"></i></div><i class="skeleton-bar"></i></div></template>
    </div>
    <svg v-else class="skeleton-graph" viewBox="0 0 640 400"><g fill="none" stroke="var(--basics-border)" stroke-width="2"><path d="M320 200L160 110M320 200L470 85M320 200L505 240M320 200L375 330M320 200L140 290M160 110L140 290M470 85L505 240" /></g><g fill="var(--basics-elevated)"><circle cx="320" cy="200" r="20" /><circle cx="160" cy="110" r="13" /><circle cx="470" cy="85" r="15" /><circle cx="505" cy="240" r="12" /><circle cx="375" cy="330" r="14" /><circle cx="140" cy="290" r="15" /><rect x="285" y="234" width="70" height="8" rx="4" /><rect x="130" y="138" width="60" height="7" rx="3" /><rect x="440" y="114" width="60" height="7" rx="3" /><rect x="475" y="267" width="60" height="7" rx="3" /><rect x="345" y="360" width="60" height="7" rx="3" /><rect x="110" y="320" width="60" height="7" rx="3" /></g></svg>
  </div>
</template>
