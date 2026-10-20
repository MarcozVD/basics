import type { CSSProperties } from "react";

/** Note-type color token (`--type-*`); undefined falls back to the neutral layer gray. */
export const typeColor = (type: string | undefined) => `var(--type-${type ?? "layer"})`;

/** Text in a type color that stays AA-readable on its own 12% tint and on the page background. */
export const tintText = (color: string) => `color-mix(in srgb, ${color} var(--tint-text-mix), var(--foreground))`;

/** Chip surface: 12% tint of the color with text-safe foreground. */
export const tintStyle = (color: string): CSSProperties => ({
  backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
  color: tintText(color),
});
