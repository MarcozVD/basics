import type { AgentId } from "@marcozvd/basics-core";
import { useQueryClient } from "@tanstack/react-query";
import { Inbox, MessageSquareText, Play, Square, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/motion/button/base";
import { Input } from "@/components/motion/input";
import { Loader } from "@/components/motion/loader";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/motion/select";
import { MarkdownPreview } from "@/components/note-form/markdown-preview";
import { useT } from "@/i18n";
import { formatElapsed, mentionedTechIds, useAgentRun } from "@/lib/agent-run";
import { getInbox } from "@/lib/api";
import { queryKeys, useAgents, useNotes } from "@/lib/queries";
import { cn } from "@/lib/utils";

/** Sentinel value of the "Custom..." model option; never a real model id. */
const CUSTOM = "__custom__";
const MODEL_KEY = (agent: AgentId) => `basics:agent-model:${agent}`;

function readStoredModel(agent: AgentId): string | null {
  try {
    return localStorage.getItem(MODEL_KEY(agent));
  } catch {
    return null;
  }
}

function writeStoredModel(agent: AgentId, model: string): void {
  try {
    if (model) localStorage.setItem(MODEL_KEY(agent), model);
    else localStorage.removeItem(MODEL_KEY(agent));
  } catch {
    // Storage can be unavailable in private or restricted contexts.
  }
}

export interface AgentPanelProps {
  description: string;
  layers: string[];
  /** Select techs from the agent answer in the Recommend selection. */
  onSelectTechs: (ids: string[]) => void;
  onClose: () => void;
}

/**
 * "Ask an agent": run a detected coding-agent CLI headless with this description, stream its answer
 * here, and turn the tech notes it cites (`[[id]]`) into a Recommend selection. It runs on this
 * computer with the user's account; the agent reads the vault through the Basics MCP server it
 * already has and may propose missing notes to the Inbox.
 */
export function AgentPanel({ description, layers, onSelectTechs, onClose }: AgentPanelProps) {
  const t = useT();
  const queryClient = useQueryClient();
  const agentsQuery = useAgents();
  const notes = useNotes();
  const run = useAgentRun();

  const agents = useMemo(() => (agentsQuery.data?.agents ?? []).filter((agent) => agent.detected), [agentsQuery.data]);
  const [agentId, setAgentId] = useState<AgentId | null>(null);
  useEffect(() => {
    if (agents.length === 0) return;
    if (!agentId || !agents.some((agent) => agent.id === agentId)) setAgentId(agents[0].id);
  }, [agents, agentId]);
  const agent = agents.find((item) => item.id === agentId) ?? agents[0];

  const [modelByAgent, setModelByAgent] = useState<Record<string, string>>({});
  const [customByAgent, setCustomByAgent] = useState<Record<string, string>>({});
  // Seed an agent's model control the first time it is selected: its stored choice, else the first
  // model the CLI offers, else free text.
  useEffect(() => {
    if (!agent) return;
    setModelByAgent((prev) => {
      if (agent.id in prev) return prev;
      const stored = readStoredModel(agent.id);
      const choice = stored ? (agent.models.includes(stored) ? stored : CUSTOM) : (agent.models[0] ?? CUSTOM);
      return { ...prev, [agent.id]: choice };
    });
    setCustomByAgent((prev) => {
      if (agent.id in prev) return prev;
      const stored = readStoredModel(agent.id);
      return { ...prev, [agent.id]: stored && !agent.models.includes(stored) ? stored : "" };
    });
  }, [agent]);

  const choice = agent ? (modelByAgent[agent.id] ?? CUSTOM) : CUSTOM;
  const custom = agent ? (customByAgent[agent.id] ?? "") : "";
  const model = choice === CUSTOM ? custom.trim() : choice;
  useEffect(() => {
    if (agent && model) writeStoredModel(agent.id, model);
  }, [agent, model]);

  const knownIds = useMemo(() => new Set((notes.data ?? []).map((note) => note.id)), [notes.data]);
  const mentioned = useMemo(
    () => (run.state.status === "done" ? mentionedTechIds(run.state.text, knownIds) : []),
    [run.state.status, run.state.text, knownIds],
  );

  const snapshotRef = useRef<Set<string>>(new Set());
  const [proposed, setProposed] = useState<string[]>([]);
  useEffect(() => {
    if (run.state.status !== "done" || !run.state.runId) return;
    let alive = true;
    void (async () => {
      try {
        const inbox = await getInbox();
        if (!alive) return;
        setProposed(inbox.filter((proposal) => !snapshotRef.current.has(proposal.id)).map((proposal) => proposal.id));
        void queryClient.invalidateQueries({ queryKey: queryKeys.inbox });
      } catch {
        // The proposals line is best-effort; the answer already rendered.
      }
    })();
    return () => {
      alive = false;
    };
  }, [run.state.status, run.state.runId, queryClient]);

  const running = run.state.status === "starting" || run.state.status === "running";
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);
  const elapsed = run.state.startedAt ? (run.state.endedAt ?? now) - run.state.startedAt : 0;

  const start = async () => {
    if (!agent || !description.trim() || running) return;
    setProposed([]);
    try {
      snapshotRef.current = new Set((await getInbox()).map((proposal) => proposal.id));
    } catch {
      snapshotRef.current = new Set();
    }
    void run.start({ agent: agent.id, model: model || undefined, description: description.trim(), layers });
  };

  const close = () => {
    run.reset();
    onClose();
  };

  const status = () => {
    if (run.state.status === "starting") return t("recommend.agent.starting");
    if (run.state.status === "running") return t("recommend.agent.running", { agent: agent?.name ?? "" });
    if (run.state.status === "done") return t("recommend.agent.finished", { time: formatElapsed(elapsed) });
    if (run.state.status === "cancelled") return t("recommend.agent.cancelled");
    if (run.state.status === "error") return t("recommend.agent.failed");
    return null;
  };

  return (
    <section aria-label={t("recommend.agent.title")} className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <MessageSquareText className="size-4 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-sm font-semibold tracking-tight">{t("recommend.agent.title")}</h2>
        <button
          type="button"
          aria-label={t("recommend.agent.close")}
          disabled={running}
          onClick={close}
          className="ml-auto grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      {agents.length === 0 ? (
        <p className="max-w-[72ch] text-xs text-muted-foreground">{t("recommend.agent.noAgents")}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-40 flex-1 flex-col gap-1">
              <span className="text-xs text-muted-foreground">{t("recommend.agent.agentLabel")}</span>
              <Select value={agent?.id} onValueChange={(value) => setAgentId(value as AgentId)}>
                <SelectTrigger
                  aria-label={t("recommend.agent.agentLabel")}
                  className="h-8 rounded-full bg-background px-3 py-0 text-[13px]"
                >
                  <span className="truncate">{agent?.name}</span>
                </SelectTrigger>
                <SelectContent>
                  {agents.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex min-w-40 flex-1 flex-col gap-1">
              <span className="text-xs text-muted-foreground">{t("recommend.agent.modelLabel")}</span>
              {agent && agent.models.length > 0 ? (
                <>
                  <Select value={choice} onValueChange={(value) => agent && setModelByAgent((prev) => ({ ...prev, [agent.id]: value }))}>
                    <SelectTrigger
                      aria-label={t("recommend.agent.modelLabel")}
                      className="h-8 rounded-full bg-background px-3 py-0 text-[13px]"
                    >
                      <span className={cn("truncate", choice === CUSTOM && !custom && "text-muted-foreground")}>
                        {choice === CUSTOM ? custom || t("recommend.agent.custom") : choice}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {agent.models.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                      <SelectItem value={CUSTOM}>{t("recommend.agent.custom")}</SelectItem>
                    </SelectContent>
                  </Select>
                  {choice === CUSTOM ? (
                    <Input
                      aria-label={t("recommend.agent.customModel")}
                      value={custom}
                      onChange={(value) => agent && setCustomByAgent((prev) => ({ ...prev, [agent.id]: value }))}
                      placeholder={t("recommend.agent.customPlaceholder")}
                      classNames={{ field: "h-8 rounded-full" }}
                    />
                  ) : null}
                </>
              ) : (
                <Input
                  aria-label={t("recommend.agent.modelLabel")}
                  value={custom}
                  onChange={(value) => agent && setCustomByAgent((prev) => ({ ...prev, [agent.id]: value }))}
                  placeholder={t("recommend.agent.customPlaceholder")}
                  classNames={{ field: "h-8 rounded-full" }}
                />
              )}
            </div>

            <Button
              size="sm"
              pressScale={0.97}
              className="h-8"
              disabled={!agent || !description.trim() || running}
              onClick={() => void start()}
            >
              <Play className="size-3.5" aria-hidden="true" />
              {t("recommend.agent.run")}
            </Button>
            {running ? (
              <Button variant="secondary" size="sm" pressScale={0.97} className="h-8" onClick={run.cancel}>
                <Square className="size-3.5" aria-hidden="true" />
                {t("recommend.agent.cancel")}
              </Button>
            ) : null}
          </div>

          <p className="max-w-[72ch] text-xs text-muted-foreground">
            {t("recommend.agent.note", { agent: agent?.name ?? t("recommend.agent.agentFallback") })}
          </p>
          {agent && agent.connected !== true ? (
            <p className="max-w-[72ch] text-xs text-muted-foreground">{t("recommend.agent.connectHint", { agent: agent.name })}</p>
          ) : null}
        </>
      )}

      {run.state.status !== "idle" && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {running ? (
              <span aria-hidden="true" className="contents">
                <Loader variant="spinner" size={12} label={t("recommend.agent.running", { agent: agent?.name ?? "" })} />
              </span>
            ) : null}
            <span role="status">{status()}</span>
            {running ? <span aria-hidden="true">· {formatElapsed(elapsed)}</span> : null}
          </div>
          {run.state.text ? (
            <div className="max-h-72 overflow-y-auto rounded-xl border border-border bg-background p-3">
              <MarkdownPreview body={run.state.text} />
            </div>
          ) : null}
          {run.state.status === "error" && run.state.error ? (
            <p role="alert" className="whitespace-pre-wrap font-mono text-[11px] leading-4 text-destructive-text">
              {run.state.error}
            </p>
          ) : null}
        </div>
      )}

      {run.state.status === "done" ? (
        <div className="flex flex-wrap items-center gap-2">
          {mentioned.length > 0 ? (
            <Button variant="secondary" size="sm" pressScale={0.97} className="h-8" onClick={() => onSelectTechs(mentioned)}>
              {t("recommend.agent.selectThese", { count: mentioned.length })}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">{t("recommend.agent.noMentioned")}</p>
          )}
          {proposed.length > 0 ? (
            <Link
              to="/inbox"
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 font-mono text-[10.5px] text-primary-text hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Inbox className="size-3" aria-hidden="true" />
              {t("recommend.agent.proposals", { ids: proposed.join(", ") })}
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
