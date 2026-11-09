import type { Candidate } from "@marcozvd/basics-core";

/** One card in the shortlist: where it shows and every other layer it also fits. */
export interface ShortlistCard {
  candidate: Candidate;
  layer: string;
  /** Layers the tech also matched, shown as "Also fits ...". */
  alsoLayers: string[];
}

export interface ShortlistLayer {
  layer: string;
  cards: ShortlistCard[];
}

/**
 * A tech can match several layers. Keep one card, under its primary layer (the
 * note's own first `layer`), and remember the others so the card can say where
 * else it fits. A declared primary layer that did not produce a candidate (for
 * example the user left it out) falls back to the first layer that did.
 */
export function buildShortlist(layers: Record<string, Candidate[]>, primaryLayerOf: (id: string) => string | undefined): ShortlistLayer[] {
  const order = Object.keys(layers).filter((layer) => layers[layer].length > 0);
  const entries = new Map<
    string,
    {
      candidate: Candidate;
      firstLayer: string;
      firstIndex: number;
      occurrences: Map<string, number>;
    }
  >();

  for (const layer of order) {
    layers[layer].forEach((candidate, index) => {
      let entry = entries.get(candidate.id);
      if (!entry) {
        entry = { candidate, firstLayer: layer, firstIndex: index, occurrences: new Map() };
        entries.set(candidate.id, entry);
      }
      if (!entry.occurrences.has(layer)) entry.occurrences.set(layer, index);
    });
  }

  const byLayer = new Map<string, { card: ShortlistCard; rank: number }[]>();
  for (const entry of entries.values()) {
    const declared = primaryLayerOf(entry.candidate.id);
    const layer = declared && entry.occurrences.has(declared) ? declared : entry.firstLayer;
    const rank = entry.occurrences.get(layer) ?? entry.firstIndex;
    // Use the candidate as it was scored for this layer: a hybrid run can fuse
    // different layers differently, and the card's reasons and Why breakdown
    // must match the section it sits under.
    const candidate = layers[layer]?.[rank] ?? entry.candidate;
    const alsoLayers = [...entry.occurrences.keys()].filter((id) => id !== layer);
    const row = byLayer.get(layer) ?? [];
    row.push({
      card: { candidate, layer, alsoLayers },
      rank,
    });
    byLayer.set(layer, row);
  }

  return order
    .map((layer) => ({
      layer,
      cards: (byLayer.get(layer) ?? []).sort((a, b) => a.rank - b.rank).map(({ card }) => card),
    }))
    .filter((section) => section.cards.length > 0);
}
