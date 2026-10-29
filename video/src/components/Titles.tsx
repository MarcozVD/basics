import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { color, mono, sans } from "../theme";
import { Logo } from "./Logo";

function Words({
  text,
  start,
  size,
  weight = 600,
  tint = color.text,
}: {
  text: string;
  start: number;
  size: number;
  weight?: number;
  tint?: string;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: `0 ${size * 0.28}px`,
        fontFamily: sans,
        fontSize: size,
        fontWeight: weight,
        letterSpacing: -size * 0.02,
        color: tint,
      }}
    >
      {text.split(" ").map((word, index) => {
        const s = spring({ frame: frame - start - index * 3, fps, config: { damping: 200 } });
        return (
          <span
            key={index}
            style={{ display: "inline-block", opacity: s, transform: `translateY(${(1 - s) * 30}px)`, filter: `blur(${(1 - s) * 8}px)` }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
}

export function Intro({ duration }: { duration: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 12, stiffness: 120 } });
  const name = spring({ frame: frame - 10, fps, config: { damping: 200 } });
  const out = interpolate(frame, [duration - 16, duration], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const glow = 0.4 + Math.sin(frame / 12) * 0.15;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: out, transform: `scale(${1 + (1 - out) * 0.06})` }}>
      <div
        style={{
          position: "absolute",
          width: 700,
          height: 700,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(26,124,255,${glow}) 0%, transparent 65%)`,
          filter: "blur(40px)",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 36, transform: `scale(${0.6 + pop * 0.4})`, opacity: pop }}>
        <div style={{ transform: `rotate(${(1 - pop) * -25}deg)` }}>
          <Logo size={150} />
        </div>
        <div
          style={{
            fontFamily: sans,
            fontSize: 150,
            fontWeight: 700,
            letterSpacing: -6,
            color: color.text,
            clipPath: `inset(0 ${(1 - name) * 100}% 0 0)`,
          }}
        >
          Basics
        </div>
      </div>
      <div style={{ marginTop: 56 }}>
        <Words text="Tu stack técnico en una carpeta de notas Markdown." start={26} size={52} weight={500} tint="#c9d2e3" />
      </div>
    </AbsoluteFill>
  );
}

export function Outro() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 14, stiffness: 110 } });
  const command = "npx @marcozvd/basics init";
  const typed = Math.min(command.length, Math.max(0, Math.floor((frame - 22) * 1.1)));
  const pill = spring({ frame: frame - 16, fps, config: { damping: 200 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          position: "absolute",
          width: 900,
          height: 900,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(26,124,255,0.35) 0%, transparent 65%)",
          filter: "blur(50px)",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 30, transform: `scale(${0.7 + pop * 0.3})`, opacity: pop }}>
        <Logo size={120} />
        <div style={{ fontFamily: sans, fontSize: 120, fontWeight: 700, letterSpacing: -5, color: color.text }}>Basics</div>
      </div>
      <div
        style={{
          marginTop: 60,
          padding: "26px 44px",
          borderRadius: 22,
          background: "rgba(12,14,19,0.85)",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.5), 0 0 60px rgba(26,124,255,0.25)",
          fontFamily: mono,
          fontSize: 50,
          color: color.text,
          opacity: pill,
          transform: `translateY(${(1 - pill) * 30}px)`,
          minWidth: 900,
        }}
      >
        <span style={{ color: color.green }}>❯ </span>
        {command.slice(0, typed)}
        <span style={{ opacity: Math.floor(frame / 15) % 2 ? 0 : 1, background: color.text, color: "transparent" }}>_</span>
      </div>
      <div style={{ marginTop: 44 }}>
        <Words text="Tus notas. Tu stack. Tus agentes." start={56} size={40} weight={500} tint={color.muted} />
      </div>
    </AbsoluteFill>
  );
}
