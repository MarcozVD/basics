/** One document-wide cold embed boot at a time. Ready/failure/unmount releases the next job. */
export function createEmbedQueue() {
  let active: symbol | undefined;
  const waiting = new Map<symbol, (release: () => void) => void>();
  function pump() {
    if (active) return;
    const next = waiting.entries().next().value;
    if (!next) return;
    const [id, start] = next;
    waiting.delete(id);
    active = id;
    start(() => {
      if (active !== id) return;
      active = undefined;
      pump();
    });
  }
  return {
    enqueue(start: (release: () => void) => void) {
      const id = Symbol();
      waiting.set(id, start);
      pump();
      return () => {
        waiting.delete(id);
        if (active === id) {
          active = undefined;
          pump();
        }
      };
    },
  };
}

export const embedQueue = createEmbedQueue();
