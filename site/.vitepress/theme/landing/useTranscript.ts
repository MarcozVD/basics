import { onBeforeUnmount, onMounted, type Ref, ref } from "vue";
import { observeReplay } from "./useReveal";

/** Transcript replay never touches the app embed or its loading state. */
export function useTranscriptReplay(root: Ref<HTMLElement | undefined>, command: () => string | null) {
  const transcript = useTranscript();
  const active = ref(false);
  let observer: IntersectionObserver | undefined;
  onMounted(() => {
    if (!root.value || !("IntersectionObserver" in window)) return;
    active.value = true;
    observer = observeReplay(
      [root.value],
      () => {
        const text = command();
        if (text) transcript.play(text);
      },
      transcript.reset,
    );
  });
  onBeforeUnmount(() => observer?.disconnect());
  return { ...transcript, active };
}

/** One interruptible prompt, with the motion spec shared by hero and text artifacts. */
export function useTranscript() {
  const typed = ref("");
  const phase = ref<"idle" | "running" | "done">("idle");
  let timer: ReturnType<typeof setTimeout> | undefined;
  let epoch = 0;
  function reset() {
    clearTimeout(timer);
    epoch++;
    typed.value = "";
    phase.value = "idle";
  }
  function play(command: string) {
    reset();
    const run = epoch;
    phase.value = "running";
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      typed.value = command;
      phase.value = "done";
      return;
    }
    const start = performance.now();
    function tick() {
      if (run !== epoch) return;
      const count = Math.floor((performance.now() - start) / 28);
      typed.value = command.slice(0, count);
      if (count >= command.length)
        timer = setTimeout(() => {
          if (run === epoch) phase.value = "done";
        }, 120);
      else timer = setTimeout(tick, 16);
    }
    tick();
  }
  onBeforeUnmount(reset);
  return { typed, phase, play, reset };
}
