import { AbsoluteFill, useCurrentFrame } from "remotion";
import { color } from "../theme";

/** Slow drifting light blobs over a faint grid; runs for the whole video so cuts never flash. */
export function Background() {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const blob = (x: number, y: number, size: number, hue: string, phase: number) => (
    <div
      style={{
        position: "absolute",
        left: x + Math.sin(t * 0.25 + phase) * 120,
        top: y + Math.cos(t * 0.2 + phase) * 90,
        width: size,
        height: size,
        borderRadius: "50%",
        background: hue,
        filter: "blur(140px)",
        opacity: 0.55,
      }}
    />
  );
  return (
    <AbsoluteFill style={{ background: color.bg, overflow: "hidden" }}>
      {blob(-200, -260, 900, "radial-gradient(circle, #1a5cff 0%, transparent 70%)", 0)}
      {blob(1250, 380, 950, "radial-gradient(circle, #7c3aed 0%, transparent 70%)", 2)}
      {blob(500, 700, 800, "radial-gradient(circle, #0ea5e9 0%, transparent 70%)", 4)}
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          backgroundPosition: `${(t * 6) % 64}px ${(t * 6) % 64}px`,
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
        }}
      />
    </AbsoluteFill>
  );
}
