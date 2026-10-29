import raw from "./timeline.json";

export type Point = { x: number; y: number };
type Move = { type: "move"; t: number; dur: number; from: Point; to: Point };
type Click = { type: "click"; t: number; x: number; y: number; label: string };
type Key = { type: "key"; t: number; key: string };
type Typed = { type: "type"; t: number; text: string; dur: number };
export type TimelineEvent = Move | Click | Key | Typed;

export const timeline = raw as { width: number; height: number; scenes: { id: string; t: number }[]; events: TimelineEvent[] };

const moves = timeline.events.filter((e): e is Move => e.type === "move");
export const clicks = timeline.events.filter((e): e is Click => e.type === "click");
export const keys = timeline.events.filter((e): e is Key => e.type === "key");
const typed = timeline.events.filter((e): e is Typed => e.type === "type");

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};

export function sceneRange(id: string): [number, number] {
  const index = timeline.scenes.findIndex((scene) => scene.id === id);
  return [timeline.scenes[index].t, timeline.scenes[index + 1]?.t ?? timeline.scenes[index].t + 5000];
}

/** Cursor position at a source time, replaying the exact easing the recorder used. */
export function cursorAt(ms: number): Point {
  let last = moves[0];
  if (ms <= last.t) return last.from;
  for (const move of moves) {
    if (move.t > ms) break;
    last = move;
  }
  const k = last.dur > 0 ? clamp01((ms - last.t) / last.dur) : 1;
  const e = ease(k);
  return { x: last.from.x + (last.to.x - last.from.x) * e, y: last.from.y + (last.to.y - last.from.y) * e };
}

/** Camera: averaged cursor for a calm pan, zoom bumps around clicks, keys and typing. */
export function cameraAt(ms: number): { center: Point; zoom: number } {
  let x = 0;
  let y = 0;
  const samples = 12;
  for (let i = 0; i < samples; i++) {
    const p = cursorAt(ms - 700 + (i / (samples - 1)) * 1000);
    x += p.x;
    y += p.y;
  }
  let focus = 0;
  const bump = (start: number, end: number) => {
    const rise = smooth((ms - (start - 700)) / 700);
    const fall = 1 - smooth((ms - (end + 1300)) / 900);
    focus = Math.max(focus, Math.min(rise, fall));
  };
  for (const click of clicks) bump(click.t, click.t);
  for (const entry of typed) bump(entry.t, entry.t + entry.dur);
  return { center: { x: x / samples, y: y / samples }, zoom: 1 + 0.38 * focus };
}

/** Labels for the keystroke badge: `g` then `g` within a beat reads as one chord. */
export function keyBadges(): { t: number; label: string }[] {
  const pretty = (key: string) =>
    key
      .replace("Control", "Ctrl")
      .replace("ArrowDown", "↓")
      .replace("ArrowUp", "↑")
      .replace("Enter", "Enter")
      .replace("Escape", "Esc")
      .replace("+", " + ")
      .replace(/ \+ ([a-z])$/, (_, letter: string) => ` + ${letter.toUpperCase()}`);
  const out: { t: number; label: string }[] = [];
  for (const key of keys) {
    const previous = out[out.length - 1];
    if (previous && key.t - previous.t < 500 && key.key.length === 1) {
      previous.label = `${previous.label}  ${key.key}`;
      continue;
    }
    out.push({ t: key.t, label: pretty(key.key) });
  }
  return out;
}
