import { onBeforeUnmount, onMounted, type Ref } from "vue";

/** Visible SSR default; hydration arms each target before its next paint. No observer means no hiding. */
export function useReveal(root: Ref<HTMLElement | undefined>, enabled: () => boolean = () => true) {
  let observer: IntersectionObserver | undefined;
  const targets = new Set<HTMLElement>();
  const show = (element: HTMLElement) => {
    element.classList.add("is-revealed");
    observer?.unobserve(element);
  };
  const focus = (event: FocusEvent) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-reveal]");
    if (target && targets.has(target)) {
      target.classList.add("reveal-focused");
      show(target);
    }
  };
  onMounted(() => {
    if (!enabled() || !root.value || !("IntersectionObserver" in window)) return;
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting && entry.intersectionRatio >= 0.2) show(entry.target as HTMLElement);
      },
      { threshold: 0.2 },
    );
    for (const target of root.value.querySelectorAll<HTMLElement>("[data-reveal]")) {
      targets.add(target);
      target.style.setProperty("--reveal-delay", `${Number(target.dataset.reveal || 0) * 60}ms`);
      target.classList.add("reveal-armed");
      observer.observe(target);
    }
    root.value.addEventListener("focusin", focus);
  });
  onBeforeUnmount(() => {
    observer?.disconnect();
    root.value?.removeEventListener("focusin", focus);
    for (const target of targets) target.classList.remove("reveal-armed", "is-revealed", "reveal-focused");
  });
}
