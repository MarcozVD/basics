/** One document-wide cold embed boot at a time. Ready/failure/unmount releases the next job. */
export function createEmbedQueue(schedule: (task: () => void) => void = (task) => task()) {
  let active: symbol | undefined;
  let scheduled = false;
  const waiting = new Map<symbol, { start: (release: () => void) => void; priority: () => number }>();
  function requestPump() {
    if (scheduled) return;
    scheduled = true;
    schedule(() => {
      scheduled = false;
      pump();
    });
  }
  function pump() {
    if (active) return;
    const next = [...waiting.entries()].sort((a, b) => a[1].priority() - b[1].priority())[0];
    if (!next) return;
    const [id, job] = next;
    waiting.delete(id);
    active = id;
    job.start(() => {
      if (active !== id) return;
      active = undefined;
      requestPump();
    });
  }
  return {
    enqueue(start: (release: () => void) => void, priority: () => number = () => 0) {
      const id = Symbol();
      waiting.set(id, { start, priority });
      requestPump();
      return () => {
        waiting.delete(id);
        if (active === id) {
          active = undefined;
          requestPump();
        }
      };
    },
  };
}

// Batch observer callbacks before selecting the closest eligible part, even if callbacks arrive out of order.
export const embedQueue = createEmbedQueue((task) => requestAnimationFrame(task));
