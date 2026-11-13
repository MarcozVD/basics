import { onBeforeUnmount, onMounted, type Ref } from "vue";

/** Keep observing: zero visibility resets, 20% visibility starts each new entry. */
export function observeReplay(targets: Iterable<HTMLElement>, enter: (element: HTMLElement) => void, exit: (element: HTMLElement) => void) {
  const entered = new WeakSet<Element>();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const element = entry.target as HTMLElement;
        if (entry.intersectionRatio === 0) {
          entered.delete(element);
          exit(element);
        } else if (entry.intersectionRatio >= 0.2 && !entered.has(element)) {
          entered.add(element);
          enter(element);
        }
      }
    },
    { threshold: [0, 0.2] },
  );
  for (const target of targets) observer.observe(target);
  return observer;
}

/** Visible SSR default; hydration arms each target before its next paint. No observer means no hiding. */
export function useReveal(root: Ref<HTMLElement | undefined>, enabled: () => boolean = () => true, selector = "[data-reveal]") {
  let observer: IntersectionObserver | undefined;
  const targets = new Set<HTMLElement>();
  const show = (element: HTMLElement) => {
    element.classList.add("is-revealed");
  };
  const focus = (event: FocusEvent) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>(selector);
    if (target && targets.has(target)) {
      target.classList.add("reveal-focused");
      show(target);
    }
  };
  onMounted(() => {
    if (!enabled() || !root.value || !("IntersectionObserver" in window)) return;
    for (const target of root.value.querySelectorAll<HTMLElement>(selector)) {
      targets.add(target);
      target.style.setProperty("--reveal-delay", `${Number(target.dataset.reveal || 0) * 60}ms`);
      target.classList.add("reveal-armed");
    }
    observer = observeReplay(targets, show, (element) => element.classList.remove("is-revealed", "reveal-focused"));
    root.value.addEventListener("focusin", focus);
  });
  onBeforeUnmount(() => {
    observer?.disconnect();
    root.value?.removeEventListener("focusin", focus);
    for (const target of targets) target.classList.remove("reveal-armed", "is-revealed", "reveal-focused");
  });
}
