import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { AbsoluteFill } from "remotion";
import { AppSegment } from "./components/AppSegment";
import { Background } from "./components/Background";
import { Terminal, type TermLine } from "./components/Terminal";
import { Intro, Outro } from "./components/Titles";
import { sceneRange } from "./data/timeline";
import { FPS } from "./theme";

const T = 14; // transition frames

/** Footage scenes: recorded order, playback rate, chapter chip and narration (VIDEO.md). */
const app = {
  home: { rate: 1.2, chapter: "Home", caption: "Home muestra la salud del vault y lo pendiente." },
  explore: { rate: 1.2, chapter: "Explore", caption: "Capas, tecnologías, prácticas, checks y perfiles." },
  editor: { rate: 1.3, chapter: "Editor", caption: "Archivos planos, wikilinks, compatible con Obsidian y git." },
  graph: { rate: 1.1, chapter: "Graph", caption: "Todo el vault como grafo." },
  inbox: { rate: 1.15, chapter: "Inbox", caption: "Cada escritura del agente llega como propuesta con diff. Tú apruebas." },
  recommend: { rate: 1.65, chapter: "Recommend", caption: "Del stack al proyecto en un clic." },
  palette: { rate: 1, chapter: "⌘K", caption: "Paleta de comandos, tema claro u oscuro." },
} as const;
type AppScene = keyof typeof app;

function appFrames(id: AppScene, tailMs = 0) {
  const [start, end] = sceneRange(id);
  return Math.round(((end - start + tailMs) / 1000 / app[id].rate) * FPS) + T;
}

const initLines: TermLine[] = [
  { kind: "cmd", at: 10, text: "npx @marcozvd/basics init ~/basics-demo --yes" },
  { kind: "out", at: 70, text: "core-layers: 5 installed, 0 skipped", tone: "text" },
  { kind: "out", at: 78, text: "web-typescript: 9 installed, 0 skipped", tone: "text" },
  { kind: "out", at: 86, text: "python-api: 9 installed, 0 skipped", tone: "text" },
  { kind: "out", at: 94, text: "profiles: 2 installed, 0 skipped", tone: "text" },
  { kind: "out", at: 104, text: "Vault: ~/basics-demo", tone: "green" },
  { kind: "out", at: 112, text: "Next steps:", tone: "muted" },
  { kind: "out", at: 116, text: "  basics ui", tone: "blue" },
  { kind: "out", at: 120, text: "  claude mcp add --transport http basics http://127.0.0.1:4747/mcp", tone: "blue" },
];

const uiLines: TermLine[] = [
  { kind: "cmd", at: 8, text: "npx @marcozvd/basics --vault ~/basics-demo ui" },
  { kind: "out", at: 62, text: "Basics UI: http://127.0.0.1:4747  (vault: ~/basics-demo)", tone: "text" },
  { kind: "out", at: 72, text: "MCP over HTTP: http://127.0.0.1:4747/mcp", tone: "violet" },
  { kind: "out", at: 92, text: "", tone: "muted" },
  { kind: "out", at: 96, text: "# o abre la app de escritorio Basics: misma UI, mismo servidor MCP", tone: "muted" },
];

// Condensed from a real `claude -p` run against the demo vault over MCP.
const claudeLines: TermLine[] = [
  {
    kind: "cmd",
    at: 8,
    prompt: ">",
    cps: 48,
    text: "Recomiéndame un stack para una app web de reservas con pagos y propón una nota de práctica sobre validación de formularios.",
  },
  { kind: "tool", at: 100, name: "get_vault_overview" },
  { kind: "tool", at: 118, name: "recommend_stack", args: '"App web de reservas con pagos online…"' },
  { kind: "tool", at: 134, name: "search_vault", args: '"validación formularios"' },
  { kind: "tool", at: 148, name: "get_note", args: '"saas-web"' },
  { kind: "tool", at: 160, name: "get_note", args: '"fastapi-structure"' },
  { kind: "say", at: 178, text: "Perfil saas-web encaja. No hay nota de validación ni de pagos: propongo ambas al Inbox." },
  { kind: "tool", at: 214, name: "propose_note", args: "form-validation · practice", result: "pending_review" },
  { kind: "tool", at: 232, name: "propose_note", args: "stripe · tech", result: "pending_review" },
  { kind: "say", at: 262, bullet: true, text: "React + TypeScript · FastAPI · PostgreSQL · Stripe" },
  { kind: "say", at: 284, bullet: true, text: "Propuestas en el Inbox. Nada se aplica hasta que las apruebes." },
];

const checkLines: TermLine[] = [
  { kind: "cmd", at: 8, text: "cd ~/demo-app && basics check" },
  { kind: "out", at: 52, text: "CHECK                 STATUS  DURATION", tone: "muted" },
  { kind: "out", at: 82, text: "typescript-typecheck  pass    2243 ms", tone: "green" },
];

export const scenes = {
  intro: 120,
  init: 165,
  ui: 150,
  claude: 360,
  check: 130,
  outro: 150,
};

export function totalFrames() {
  const ids: AppScene[] = ["home", "explore", "editor", "graph", "inbox", "recommend"];
  const appTotal = ids.reduce((sum, id) => sum + appFrames(id), 0) + appFrames("palette", 1000);
  const fixed = Object.values(scenes).reduce((a, b) => a + b, 0);
  const transitions = 13 * T + 4 * 6; // four of them use longTiming
  return appTotal + fixed - transitions;
}

function AppScene({ id, enter = false, tailMs = 0 }: { id: AppScene; enter?: boolean; tailMs?: number }) {
  const [start] = sceneRange(id);
  return (
    <AppSegment
      startMs={start}
      rate={app[id].rate}
      caption={app[id].caption}
      chapter={app[id].chapter}
      duration={appFrames(id, tailMs)}
      enter={enter}
    />
  );
}

export function Demo() {
  const timing = linearTiming({ durationInFrames: T });
  const longTiming = linearTiming({ durationInFrames: T + 6 });
  return (
    <AbsoluteFill>
      <Background />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={scenes.intro}>
          <Intro duration={scenes.intro} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={scenes.init}>
          <Terminal
            title="Terminal — basics init"
            lines={initLines}
            caption="Un comando crea tu vault con packs de notas."
            duration={scenes.init}
            height={560}
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={scenes.ui}>
          <Terminal
            title="Terminal — basics ui"
            lines={uiLines}
            caption="Un comando y tienes UI local más servidor MCP."
            duration={scenes.ui}
            height={480}
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={longTiming} />
        <TransitionSeries.Sequence durationInFrames={appFrames("home")}>
          <AppScene id="home" enter />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={appFrames("explore")}>
          <AppScene id="explore" />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={appFrames("editor")}>
          <AppScene id="editor" />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={appFrames("graph")}>
          <AppScene id="graph" />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={longTiming} />
        <TransitionSeries.Sequence durationInFrames={scenes.claude}>
          <Terminal
            title="Claude Code — conectado a Basics por MCP"
            lines={claudeLines}
            caption="Tu agente lee el vault por MCP… y lo que escribe no entra directo."
            duration={scenes.claude}
            width={1480}
            height={800}
            fontSize={23}
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={longTiming} />
        <TransitionSeries.Sequence durationInFrames={appFrames("inbox")}>
          <AppScene id="inbox" />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={appFrames("recommend")}>
          <AppScene id="recommend" />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={scenes.check}>
          <Terminal
            title="Terminal — ~/demo-app"
            lines={checkLines}
            caption="Y los checks del stack corren en tu proyecto."
            duration={scenes.check}
            height={520}
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={appFrames("palette", 1000)}>
          <AppScene id="palette" tailMs={1000} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={longTiming} />
        <TransitionSeries.Sequence durationInFrames={scenes.outro}>
          <Outro />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
}
