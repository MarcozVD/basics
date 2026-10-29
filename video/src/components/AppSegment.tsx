import { AbsoluteFill, interpolate, OffthreadVideo, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { cameraAt, clicks, cursorAt, keyBadges } from "../data/timeline";
import { APP, APP_H, APP_LEFT, APP_W, color, FOOTAGE, FPS, mono } from "../theme";
import { Caption } from "./Caption";
import { Window } from "./Window";

const badges = keyBadges();

function Cursor({ x, y, pressed }: { x: number; y: number; pressed: number }) {
  return (
    <svg
      width={30}
      height={30}
      viewBox="0 0 24 24"
      style={{
        position: "absolute",
        left: x - 3,
        top: y - 2,
        transform: `scale(${1 - pressed * 0.18})`,
        transformOrigin: "3px 2px",
        filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.55))",
      }}
    >
      <path
        d="M3 2 L3 19 L7.6 14.8 L10.6 21.6 L13.6 20.3 L10.7 13.6 L17 13.6 Z"
        fill="white"
        stroke="#0b0d12"
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * One scene of the Recordly footage: the webview is cropped out of the window capture,
 * placed in our own window, and a camera follows the recorded cursor with zooms on clicks.
 * `rate` speeds the clip up; every overlay is computed from source time, so it stays in sync.
 */
export function AppSegment({
  startMs,
  rate,
  caption,
  chapter,
  duration,
  enter = false,
}: {
  duration: number;
  startMs: number;
  rate: number;
  caption: string;
  chapter: string;
  enter?: boolean;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = startMs + (frame / fps) * 1000 * rate;

  const { center, zoom } = cameraAt(ms);
  const W = APP.width;
  const H = APP.height;
  const tx = Math.min(0, Math.max(W - W * zoom, W / 2 - center.x * zoom));
  const ty = Math.min(0, Math.max(H - H * zoom, H / 2 - center.y * zoom));

  const cursor = cursorAt(ms);
  const pressed = clicks.reduce((acc, click) => {
    const d = ms - click.t;
    return d > -90 && d < 160 ? Math.max(acc, 1 - Math.abs(d - 30) / 130) : acc;
  }, 0);

  const badge = badges.filter((b) => ms >= b.t && ms < b.t + 1100).pop();
  const badgeIn = badge ? spring({ frame: ((ms - badge.t) / 1000 / rate) * fps, fps, config: { damping: 14, stiffness: 160 } }) : 0;
  const badgeOut = badge ? interpolate(ms - badge.t, [850, 1100], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;

  return (
    <AbsoluteFill>
      <Window
        left={APP_LEFT}
        top={APP.top}
        width={APP_W}
        height={APP_H}
        title="Basics"
        chip={chapter}
        enter={enter}
        titleBar={APP.titleBar}
      >
        <div style={{ position: "absolute", width: W, height: H, transform: `scale(${APP.scale})`, transformOrigin: "0 0" }}>
          <div style={{ position: "absolute", width: W, height: H, overflow: "hidden" }}>
            <div
              style={{
                position: "absolute",
                width: W,
                height: H,
                transform: `translate(${tx}px, ${ty}px) scale(${zoom})`,
                transformOrigin: "0 0",
              }}
            >
              <OffthreadVideo
                src={staticFile(FOOTAGE.src)}
                muted
                trimBefore={Math.round((FOOTAGE.syncSeconds + startMs / 1000) * FPS)}
                playbackRate={rate}
                style={{
                  position: "absolute",
                  left: -FOOTAGE.contentX,
                  top: -FOOTAGE.contentY,
                  width: FOOTAGE.width,
                  height: FOOTAGE.height,
                  maxWidth: "none",
                }}
              />
              {clicks
                .filter((click) => ms - click.t >= 0 && ms - click.t < 650)
                .map((click) => {
                  const k = (ms - click.t) / 650;
                  return (
                    <div
                      key={click.t}
                      style={{
                        position: "absolute",
                        left: click.x - 34,
                        top: click.y - 34,
                        width: 68,
                        height: 68,
                        borderRadius: 34,
                        border: `3px solid ${color.blueSoft}`,
                        background: "rgba(26,124,255,0.18)",
                        transform: `scale(${0.3 + k * 1.1})`,
                        opacity: 1 - k,
                      }}
                    />
                  );
                })}
              <Cursor x={cursor.x} y={cursor.y} pressed={pressed} />
            </div>
          </div>
          {badge ? (
            <div
              style={{
                position: "absolute",
                left: "50%",
                bottom: 110,
                transform: `translateX(-50%) translateY(${(1 - badgeIn) * 20}px) scale(${0.9 + badgeIn * 0.1})`,
                opacity: Math.min(badgeIn, badgeOut),
                padding: "10px 20px",
                borderRadius: 14,
                background: "rgba(14,16,22,0.88)",
                border: "1px solid rgba(255,255,255,0.14)",
                boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
                fontFamily: mono,
                fontSize: 24,
                fontWeight: 600,
                color: color.text,
                whiteSpace: "pre",
              }}
            >
              {badge.label}
            </div>
          ) : null}
        </div>
      </Window>
      <Caption text={caption} duration={duration} top={APP.top + APP.titleBar + APP_H + 26} />
    </AbsoluteFill>
  );
}
