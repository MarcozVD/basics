/**
 * Flat-graph force layout, off the main thread.
 *
 * Runs the same fcose options as the synchronous path on a headless cytoscape instance.
 * Node sizes are measured on the main thread (dot plus label box) and passed in, so the
 * simulation sees the same dimensions the rendered graph has and the picture keeps its
 * proportions.
 *
 * Two stages are posted back: `coarse` first (draft quality, a few hundred iterations) and
 * then `final`. Both start from the same seeded positions, so a run is deterministic: the
 * same graph always settles the same way, no matter how often it is laid out.
 *
 * Bundled as its own lazy chunk by Vite; the main thread falls back to a synchronous
 * layout when the worker cannot be created or fails.
 */

import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import type { GraphLayoutRequest, GraphLayoutResult, GraphLayoutStageOptions } from "./graph-layout";

cytoscape.use(fcose);

/** A module worker has no `window`, and the DOM lib does not type its own scope. */
const scope = globalThis as unknown as {
  postMessage: (message: GraphLayoutResult) => void;
  addEventListener: (type: "message", listener: (event: MessageEvent<GraphLayoutRequest>) => void) => void;
};

/**
 * fcose seeds its initial positions with `Math.random`. Swapping in a small LCG keeps the
 * result identical between runs (and between the worker and the synchronous fallback).
 */
function withSeededRandom<T>(run: () => T): T {
  const original = Math.random;
  let state = 0x9e3779b9;
  Math.random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  try {
    return run();
  } finally {
    Math.random = original;
  }
}

function runStage(request: GraphLayoutRequest, options: GraphLayoutStageOptions): Record<string, { x: number; y: number }> {
  const cy = cytoscape({
    headless: true,
    styleEnabled: true,
    // The only thing the simulation reads from the style: the size of each node.
    style: [{ selector: "node", style: { width: "data(w)", height: "data(h)" } }],
    elements: [
      ...request.nodes.map((node) => ({
        group: "nodes" as const,
        data: { id: node.id, w: node.width, h: node.height },
        position: request.positions?.[node.id],
      })),
      ...request.edges.map((edge) => ({
        group: "edges" as const,
        data: { id: `${edge.source}|${edge.target}`, source: edge.source, target: edge.target },
      })),
    ],
  });
  const started = performance.now();
  const layout = cy.layout({
    name: "fcose",
    quality: options.quality,
    randomize: request.randomize,
    animate: false,
    fit: false,
    nodeDimensionsIncludeLabels: true,
    nodeRepulsion: options.nodeRepulsion,
    idealEdgeLength: options.idealEdgeLength,
    nodeSeparation: options.nodeSeparation,
    gravity: options.gravity,
    numIter: options.numIter,
  } as cytoscape.LayoutOptions);
  if (request.randomize) withSeededRandom(() => layout.run());
  else layout.run();
  const positions = Object.fromEntries(
    cy.nodes().map((node) => {
      const position = node.position();
      return [node.id(), { x: position.x, y: position.y }];
    }),
  );
  cy.destroy();
  scope.postMessage({ id: request.id, stage: options.stage, positions, ms: Math.round(performance.now() - started) });
  return positions;
}

scope.addEventListener("message", (event) => {
  const request = event.data;
  try {
    // The coarse pass only exists to show a plausible early picture: the final pass starts
    // again from the request's positions, so this one is only ever displayed.
    if (request.coarse) runStage(request, request.coarse);
    runStage(request, request.final);
  } catch (error) {
    scope.postMessage({
      id: request.id,
      stage: "error",
      positions: {},
      ms: 0,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
