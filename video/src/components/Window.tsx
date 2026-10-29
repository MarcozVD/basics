import type { ReactNode } from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { color, mono, sans } from "../theme";

/**
 * Floating window with its own chrome. `enter` plays a 3D settle on the first frames,
 * otherwise it simply holds; scenes overlap with fades, so the window never pops.
 */
export function Window({
  left,
  top,
  width,
  height,
  title,
  chip,
  enter = true,
  titleBar = 38,
  children,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
  title: string;
  chip?: string;
  enter?: boolean;
  titleBar?: number;
  children: ReactNode;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = enter ? spring({ frame, fps, config: { damping: 18, stiffness: 90, mass: 0.9 } }) : 1;
  const drift = Math.sin(frame / 90) * 0.4;
  return (
    <div style={{ position: "absolute", left, top, width, height: height + titleBar, perspective: 2200 }}>
      <div
        style={{
          width: "100%",
          height: "100%",
          transform: `translateY(${(1 - s) * 120}px) scale(${0.86 + 0.14 * s}) rotateX(${(1 - s) * 18 + drift}deg)`,
          transformOrigin: "50% 100%",
          opacity: interpolate(s, [0, 0.4], [0, 1], { extrapolateRight: "clamp" }),
          borderRadius: 16,
          overflow: "hidden",
          background: color.panel,
          border: `1px solid ${color.panelBorder}`,
          boxShadow: "0 50px 120px rgba(0,0,0,0.65), 0 0 0 1px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
      >
        <div
          style={{
            height: titleBar,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "0 16px",
            background: "linear-gradient(#1a1d24, #15171d)",
            borderBottom: `1px solid ${color.panelBorder}`,
            fontFamily: sans,
            fontSize: 15,
            color: color.muted,
          }}
        >
          {["#ff5f57", "#febc2e", "#28c840"].map((dot) => (
            <div key={dot} style={{ width: 13, height: 13, borderRadius: 7, background: dot }} />
          ))}
          <div style={{ flex: 1, textAlign: "center", fontWeight: 500, color: "#c9ced8", marginRight: 60 }}>
            {title}
            {chip ? (
              <span
                style={{
                  marginLeft: 12,
                  padding: "3px 10px",
                  borderRadius: 999,
                  background: "rgba(26,124,255,0.16)",
                  color: color.blueSoft,
                  fontFamily: mono,
                  fontSize: 13,
                }}
              >
                {chip}
              </span>
            ) : null}
          </div>
        </div>
        <div style={{ position: "relative", width: "100%", height, overflow: "hidden" }}>{children}</div>
      </div>
    </div>
  );
}
