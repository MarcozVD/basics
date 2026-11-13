<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useReveal } from "./landing/useReveal";

const root = ref<HTMLElement>();
onMounted(() => {
  root.value = document.querySelector<HTMLElement>(".vp-doc") || undefined;
});
useReveal(root, () => true, "h2");
</script>
<template><span hidden aria-hidden="true"></span></template>
