import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { color, mono } from "../theme";
import { Caption } from "./Caption";
import { Window } from "./Window";

export type TermLine =
  /** A command typed at the prompt, `cps` characters per second. */
  | { kind: "cmd"; at: number; text: string; cps?: number; prompt?: string }
  /** Output that appears at once. */
  | { kind: "out"; at: number; text: string; tone?: "muted" | "green" | "blue" | "amber" | "violet" | "text" }
  /** A tool call row, the way Claude Code prints them. */
  | { kind: "tool"; at: number; name: string; args?: string; result?: string }
  /** Prose from the agent, revealed word by word. */
  | { kind: "say"; at: number; text: string; bullet?: boolean };

const tones = { muted: color.muted, green: color.green, blue: color.blueSoft, amber: color.amber, violet: "#b794ff", text: color.text };

export function Terminal({
  title,
  lines,
  caption,
  duration,
  width = 1360,
  height = 760,
  fontSize = 24,
}: {
  title: string;
  lines: TermLine[];
  caption: string;
  duration: number;
  width?: number;
  height?: number;
  fontSize?: number;
}) {
  const frame = useCurrentFrame();
  const visible = lines.filter((line) => frame >= line.at);
  const last = visible[visible.length - 1];
  const typing = last?.kind === "cmd" && frame - last.at < last.text.length / ((last.cps ?? 26) / 30);
  const blink = Math.floor(frame / 16) % 2 === 0 || typing;
  const lineHeight = fontSize * 1.6;
  // Keep the newest line in view once the log outgrows the window.
  const contentHeight = visible.reduce((sum, line) => sum + (line.kind === "say" ? Math.ceil(line.text.length / 70) : 1) * lineHeight, 0);
  const scroll = Math.max(0, contentHeight - (height - 80));

  return (
    <AbsoluteFill>
      <Window left={(1920 - width) / 2} top={(1000 - height) / 2 - 20} width={width} height={height} title={title}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            padding: "28px 36px",
            fontFamily: mono,
            fontSize,
            lineHeight: `${lineHeight}px`,
            color: color.text,
            background: "radial-gradient(ellipse at top, #141822, #0c0e13)",
          }}
        >
          <div style={{ transform: `translateY(${-interpolate(scroll, [0, 2000], [0, 2000])}px)` }}>
            {visible.map((line, index) => {
              const age = frame - line.at;
              const fade = interpolate(age, [0, 6], [0, 1], { extrapolateRight: "clamp" });
              if (line.kind === "cmd") {
                const chars = Math.min(line.text.length, Math.floor((age * (line.cps ?? 26)) / 30));
                const isLast = line === last;
                return (
                  <div key={index}>
                    <span style={{ color: color.green }}>{line.prompt ?? "❯"} </span>
                    <span>{line.text.slice(0, chars)}</span>
                    {isLast && blink ? <span style={{ background: color.text, color: "transparent" }}>_</span> : null}
                  </div>
                );
              }
              if (line.kind === "out") {
                return (
                  <div key={index} style={{ opacity: fade, color: tones[line.tone ?? "muted"], whiteSpace: "pre" }}>
                    {line.text}
                  </div>
                );
              }
              if (line.kind === "tool") {
                const done = age > 14;
                return (
                  <div key={index} style={{ opacity: fade, transform: `translateX(${(1 - fade) * -12}px)` }}>
                    <span style={{ color: done ? color.green : color.amber }}>⏺ </span>
                    <span style={{ color: "#b794ff", fontWeight: 600 }}>basics</span>
                    <span style={{ color: color.muted }}> · </span>
                    <span style={{ fontWeight: 600 }}>{line.name}</span>
                    {line.args ? <span style={{ color: color.muted }}>({line.args})</span> : null}
                    {line.result && done ? <span style={{ color: color.green }}> → {line.result}</span> : null}
                  </div>
                );
              }
              const words = line.text.split(" ");
              const shown = Math.floor(age * 1.6);
              return (
                <div key={index} style={{ color: color.text, paddingLeft: line.bullet ? 28 : 0, textIndent: line.bullet ? -28 : 0 }}>
                  {line.bullet ? <span style={{ color: color.blueSoft }}>• </span> : null}
                  {words.map((word, w) => (
                    <span key={w} style={{ opacity: w < shown ? 1 : 0 }}>
                      {word}{" "}
                    </span>
                  ))}
                </div>
              );
            })}
            {last && last.kind !== "cmd" && blink ? <span style={{ background: color.text, color: "transparent" }}>_</span> : null}
          </div>
        </div>
      </Window>
      <Caption text={caption} duration={duration} top={990} />
    </AbsoluteFill>
  );
}
