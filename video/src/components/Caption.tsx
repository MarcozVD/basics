import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { color, sans } from "../theme";

/** Narration line under the window: words rise in one by one, the whole line fades at the end. */
export function Caption({ text, duration, top = 1000, delay = 8 }: { text: string; duration: number; top?: number; delay?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const durationInFrames = duration;
  const words = text.split(" ");
  const out = interpolate(frame, [durationInFrames - 14, durationInFrames - 2], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        position: "absolute",
        top,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        flexWrap: "wrap",
        gap: "0 14px",
        fontFamily: sans,
        fontSize: 40,
        fontWeight: 600,
        letterSpacing: -0.6,
        color: color.text,
        opacity: out,
        textShadow: "0 4px 30px rgba(0,0,0,0.6)",
      }}
    >
      {words.map((word, index) => {
        const s = spring({ frame: frame - delay - index * 2.2, fps, config: { damping: 200 } });
        return (
          <span
            key={index}
            style={{ display: "inline-block", opacity: s, transform: `translateY(${(1 - s) * 18}px)`, filter: `blur(${(1 - s) * 6}px)` }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
}
