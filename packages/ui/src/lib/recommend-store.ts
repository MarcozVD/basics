import type { Recommendation } from "@marcozvd/basics-core";
import { useSyncExternalStore } from "react";

const KEY = "basics:recommend";
/** Keep the stored session small enough for sessionStorage even with a big result. */
const MAX_CHARS = 500_000;
const DEFAULT_PER_LAYER = 3;

export interface RecommendState {
  description: string;
  selectedLayers: string[] | null;
  perLayer: number;
  selected: string[];
  recommendation: Recommendation | null;
  exportTab: string;
  /** Profile id the current selection came from (via "Use this profile"), for prefills. */
  fromProfile: string | null;
}

function initialState(): RecommendState {
  return {
    description: "",
    selectedLayers: null,
    perLayer: DEFAULT_PER_LAYER,
    selected: [],
    recommendation: null,
    exportTab: "stack",
    fromProfile: null,
  };
}

function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((item): item is string => typeof item === "string");
}

/** Restore the last session; malformed or missing data falls back to the defaults. */
function read(): RecommendState {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Partial<RecommendState> | null;
    if (!parsed || typeof parsed !== "object") return initialState();
    const perLayer = parsed.perLayer;
    return {
      description: typeof parsed.description === "string" ? parsed.description : "",
      selectedLayers: stringList(parsed.selectedLayers),
      perLayer: typeof perLayer === "number" && perLayer >= 1 && perLayer <= 10 ? perLayer : DEFAULT_PER_LAYER,
      selected: stringList(parsed.selected) ?? [],
      recommendation: parsed.recommendation && typeof parsed.recommendation === "object" ? parsed.recommendation : null,
      exportTab: typeof parsed.exportTab === "string" ? parsed.exportTab : "stack",
      fromProfile: typeof parsed.fromProfile === "string" ? parsed.fromProfile : null,
    };
  } catch {
    return initialState();
  }
}

let state = read();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;

function emit(): void {
  for (const listener of listeners) listener();
}

function save(): void {
  try {
    let payload = JSON.stringify(state);
    if (payload.length > MAX_CHARS) payload = JSON.stringify({ ...state, recommendation: null });
    sessionStorage.setItem(KEY, payload);
  } catch {
    // Storage can be unavailable in private or restricted contexts.
  }
}

function scheduleSave(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(save, 200);
}

export function updateRecommend(patch: Partial<RecommendState>): void {
  state = { ...state, ...patch };
  emit();
  scheduleSave();
}

/** Reset every control and result; storage is written at once so a reload stays clean. */
export function clearRecommend(): void {
  state = initialState();
  emit();
  if (timer) clearTimeout(timer);
  timer = undefined;
  save();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): RecommendState {
  return state;
}

export function useRecommendStore(): RecommendState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
