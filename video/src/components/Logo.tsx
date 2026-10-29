import { color } from "../theme";

/** The Basics mark: blue rounded square with three stacked bars of decreasing width. */
export function Logo({ size = 96 }: { size?: number }) {
  const bar = (top: number, width: number) => (
    <div
      style={{
        position: "absolute",
        left: size * 0.24,
        top: size * top,
        width: size * width,
        height: size * 0.1,
        borderRadius: size * 0.05,
        background: "white",
      }}
    />
  );
  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: size * 0.24,
        background: `linear-gradient(145deg, ${color.blueSoft}, ${color.blue})`,
        boxShadow: `0 ${size * 0.15}px ${size * 0.5}px rgba(26,124,255,0.45)`,
      }}
    >
      {bar(0.28, 0.52)}
      {bar(0.45, 0.4)}
      {bar(0.62, 0.26)}
    </div>
  );
}
