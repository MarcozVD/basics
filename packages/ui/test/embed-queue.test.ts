import { expect, it } from "vitest";
import { createEmbedQueue } from "../../../site/.vitepress/theme/landing/embedQueue";

it("serializes cold boots until ready and ignores repeated completion", () => {
  const queue = createEmbedQueue();
  const starts: number[] = [];
  let ready!: () => void;
  queue.enqueue((done) => {
    starts.push(1);
    ready = done;
  });
  queue.enqueue(() => starts.push(2));
  expect(starts).toEqual([1]);
  ready();
  ready();
  expect(starts).toEqual([1, 2]);
});
it("removes queued work and releases active work on unmount", () => {
  const queue = createEmbedQueue();
  const starts: number[] = [];
  const cancel = queue.enqueue(() => starts.push(1));
  const removeQueued = queue.enqueue(() => starts.push(2));
  queue.enqueue(() => starts.push(3));
  removeQueued();
  cancel();
  cancel();
  expect(starts).toEqual([1, 3]);
});
it("batches eligible requests and starts the visible part before an offscreen part", () => {
  let tick!: () => void;
  const queue = createEmbedQueue((task) => {
    tick = task;
  });
  const starts: string[] = [];
  let finish!: () => void;
  queue.enqueue(
    () => starts.push("offscreen"),
    () => 500,
  );
  queue.enqueue(
    (done) => {
      starts.push("visible");
      finish = done;
    },
    () => 0,
  );
  expect(starts).toEqual([]);
  tick();
  expect(starts).toEqual(["visible"]);
  finish();
  tick();
  expect(starts).toEqual(["visible", "offscreen"]);
});
