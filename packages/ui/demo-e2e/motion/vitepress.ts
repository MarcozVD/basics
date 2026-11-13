import { ref } from "vue";

const isDark = ref(document.documentElement.classList.contains("dark"));
new MutationObserver(() => {
  isDark.value = document.documentElement.classList.contains("dark");
}).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
export const useData = () => ({ isDark });
export const withBase = (path: string) => `/basics${path}`;
