import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Check, ChevronDown, Copy, Puzzle, RotateCcw, Search, SearchX } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/motion/collapsible";
import { Input } from "@/components/motion/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/motion/select";
import { PAGE_SECTIONS, Page, Reveal } from "@/components/page";
import { PageHeader } from "@/components/page-header";
import { ErrorState, Loading } from "@/components/state";
import { type TranslationKey, useT } from "@/i18n";
import { agentColor } from "@/lib/agent-color";
import { deleteSkillArea, putSkillArea, SKILL_AGENTS, SKILL_AREAS, type SkillAgentId, type SkillArea, type SkillEntry } from "@/lib/api";
import { useIntro } from "@/lib/intro";
import { useDocumentTitle } from "@/lib/page-title";
import { queryKeys, useConnectStatus, useSkills } from "@/lib/queries";
import { useRouteSearchParams } from "@/lib/route-query";
import { toast } from "@/lib/toast";
import { tintStyle } from "@/lib/type-color";
import { cn } from "@/lib/utils";

/**
 * Skills, read-only: what a coding agent loads on its own, grouped by the area of work it
 * covers. Basics scans the agent folders on the server and never writes a skill; the only
 * thing this page changes is the owner's area override, which lives in the Basics config.
 */

const AREA_LABEL: Record<SkillArea, TranslationKey> = {
  frontend: "skills.area.frontend",
  backend: "skills.area.backend",
  security: "skills.area.security",
  testing: "skills.area.testing",
  devops: "skills.area.devops",
  data: "skills.area.data",
  ai: "skills.area.ai",
  docs: "skills.area.docs",
  workflow: "skills.area.workflow",
  other: "skills.area.other",
};

const AREA_SENTENCE: Record<SkillArea, TranslationKey> = {
  frontend: "skills.area.frontend.description",
  backend: "skills.area.backend.description",
  security: "skills.area.security.description",
  testing: "skills.area.testing.description",
  devops: "skills.area.devops.description",
  data: "skills.area.data.description",
  ai: "skills.area.ai.description",
  docs: "skills.area.docs.description",
  workflow: "skills.area.workflow.description",
  other: "skills.area.other.description",
};

const AGENT_LABEL: Record<SkillAgentId, TranslationKey> = {
  "claude-code": "skills.agent.claude-code",
  opencode: "skills.agent.opencode",
  codex: "skills.agent.codex",
  shared: "skills.agent.shared",
};

const AGENT_FULL: Record<SkillAgentId, TranslationKey> = {
  "claude-code": "skills.agent.claude-code",
  opencode: "skills.agent.opencode",
  codex: "skills.agent.codex",
  shared: "skills.agent.sharedFull",
};

/** Product names stay untranslated, as in Settings > Agents. */
const CLIENT_NAMES: Record<string, string> = {
  "claude-code": "Claude Code",
  opencode: "opencode",
  codex: "Codex",
  cursor: "Cursor",
  "claude-desktop": "Claude Desktop",
};

const LINKS = {
  skills: "https://marcozvd.github.io/basics/guide/skills.html",
  agentSkills: "https://agentskills.io",
};

type AgentFilter = "all" | SkillAgentId;
/** `all` shows every area; any other value narrows the page to one group. */
type AreaFilter = "all" | SkillArea;

/** In the All view a group shows this many rows before its own "Show all" button. */
const GROUP_PREVIEW = 5;

function isSkillArea(value: string | null): value is SkillArea {
  return value !== null && (SKILL_AREAS as readonly string[]).includes(value);
}

/** `diseño` and `diseno` match the same query; search never looks at paths. */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function matchesQuery(skill: SkillEntry, query: string): boolean {
  if (!query) return true;
  return normalize(`${skill.name} ${skill.description}`).includes(query);
}

/** One group of rows: a single card with hairline separators, like Settings. */
function Rows({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-muted/30">{children}</div>;
}

function Chip({ tone, children }: { tone: "primary" | "muted"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tone === "primary" && "border-primary/30 bg-primary/10 text-primary-text",
        tone === "muted" && "border-border bg-muted/60 text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function AgentChip({ agent }: { agent: SkillAgentId }) {
  const t = useT();
  const name = t(AGENT_LABEL[agent]);
  return (
    <span
      title={t(AGENT_FULL[agent])}
      className="inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[10px] font-medium"
      style={tintStyle(agentColor(name))}
    >
      {name}
    </span>
  );
}

function CopyPathButton({ value, label }: { value: string; label: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error(t("skills.copyFailed"));
    }
  };

  const text = copied ? t("skills.copied") : label;

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={text}
      title={text}
      className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
    </button>
  );
}

/** A filter chip with its count; the selected one is a solid segment like the rest of the app. */
function FilterChip({
  selected,
  count,
  children,
  onClick,
  disabled,
  hint,
}: {
  selected: boolean;
  count: number;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <motion.button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      title={hint}
      onClick={onClick}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        selected
          ? "border-foreground/15 bg-foreground/[0.07] text-foreground"
          : "border-border text-muted-foreground hover:text-foreground",
        disabled && "cursor-not-allowed hover:text-muted-foreground",
      )}
    >
      {children}
      <span className="font-mono text-[10px] tabular-nums">{count}</span>
    </motion.button>
  );
}

/** Area control on each row: picks the override, and a reset once the owner changed it. */
function AreaControl({
  skill,
  busy,
  onChange,
  onReset,
}: {
  skill: SkillEntry;
  busy: boolean;
  onChange: (key: string, area: SkillArea) => void;
  onReset: (key: string) => void;
}) {
  const t = useT();
  const overridden = skill.areaSource === "override";
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Select value={skill.area} onValueChange={(value) => onChange(skill.key, value as SkillArea)} disabled={busy}>
        <SelectTrigger
          aria-label={t("skills.changeArea", { name: skill.name })}
          title={t("skills.changeArea", { name: skill.name })}
          className="h-6 rounded-full border-border bg-muted/60 px-2 py-0 text-[11px]"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="w-48">
          {SKILL_AREAS.map((area) => (
            <SelectItem key={area} value={area}>
              {t(AREA_LABEL[area])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {overridden ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onReset(skill.key)}
          aria-label={t("skills.resetArea", { name: skill.name })}
          title={t("skills.resetArea", { name: skill.name })}
          className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
        >
          <RotateCcw className="size-3" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

function SkillRow({
  skill,
  open,
  busy,
  onToggle,
  onChangeArea,
  onResetArea,
}: {
  skill: SkillEntry;
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onChangeArea: (key: string, area: SkillArea) => void;
  onResetArea: (key: string) => void;
}) {
  const t = useT();
  const reduce = useReducedMotion();

  return (
    <Collapsible
      open={open}
      onOpenChange={(next) => {
        if (next !== open) onToggle();
      }}
    >
      <div className="flex flex-col">
        <div className="flex items-start gap-2 px-4 py-3">
          <CollapsibleTrigger
            aria-label={t(open ? "skills.collapse" : "skills.expand", { name: skill.name })}
            className="min-h-0 flex-1 items-start gap-2 rounded-lg px-1 py-0.5"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[13px] font-medium break-all">{skill.name}</span>
                {skill.agents.map((agent) => (
                  <AgentChip key={agent} agent={agent} />
                ))}
                {skill.plugin ? <Chip tone="muted">{t("skills.plugin", { plugin: skill.plugin })}</Chip> : null}
              </div>
              {skill.error ? (
                <p className="mt-1 max-w-[72ch] text-xs text-destructive">{t("skills.rowError", { message: skill.error })}</p>
              ) : (
                <p
                  className={cn(
                    "mt-1 max-w-[72ch] text-xs leading-relaxed text-muted-foreground",
                    open ? "whitespace-pre-line" : "line-clamp-2",
                  )}
                >
                  {skill.description || t("skills.noDescription")}
                </p>
              )}
            </div>
            <span className="ml-auto flex shrink-0 items-center gap-1 pt-0.5 text-[11px] whitespace-nowrap text-muted-foreground">
              {t(open ? "skills.less" : "skills.more")}
              <ChevronDown
                aria-hidden="true"
                className={cn("size-3.5 transition-transform duration-200", open && "rotate-180", reduce && "transition-none")}
              />
            </span>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <div className="px-4 pb-3">
            <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-[11px] font-medium text-muted-foreground">{t("skills.path")}</span>
                  <code title={skill.path} className="min-w-0 flex-1 truncate font-mono text-[11px]">
                    {skill.path}
                  </code>
                  <CopyPathButton value={skill.path} label={t("skills.copyPath")} />
                </div>
                {skill.version ? (
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-[11px] font-medium text-muted-foreground">{t("skills.version")}</span>
                    <span className="font-mono text-[11px]">{skill.version}</span>
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-2">
                <span className="shrink-0 text-[11px] font-medium text-muted-foreground">{t("skills.area")}</span>
                <AreaControl skill={skill} busy={busy} onChange={onChangeArea} onReset={onResetArea} />
                {skill.areaSource === "override" ? <Chip tone="primary">{t("skills.changedByYou")}</Chip> : null}
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function EmptyState({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-dashed px-4 py-10 text-center">
      <span className="mb-1 text-muted-foreground" aria-hidden="true">
        {icon}
      </span>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-[56ch] text-sm text-muted-foreground">{description}</p>
      {children ? <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{children}</div> : null}
    </div>
  );
}

const linkClass =
  "inline-flex items-center gap-1 rounded-sm text-sm font-medium text-primary-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * One line for the Basics skill itself: it is the thing that teaches an agent to read this
 * vault, so its absence is worth naming here, where the person is already looking at skills.
 */
function BasicsSkillNotice() {
  const t = useT();
  const status = useConnectStatus();
  const missing = (status.data?.clients ?? [])
    .filter((client) => client.detected && client.skill === false)
    .map((client) => CLIENT_NAMES[client.client])
    .filter((name): name is string => Boolean(name));

  if (!missing.length) return null;

  return (
    <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      <Puzzle className="size-3.5 shrink-0" aria-hidden="true" />
      {t("skills.basicsSkill", { agents: missing.join(", ") })}
      <Link
        to="/settings?section=agents"
        className="rounded-sm font-medium text-primary-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {t("skills.basicsSkill.action")}
      </Link>
    </p>
  );
}

export function SkillsPage() {
  const t = useT();
  useDocumentTitle(t("page.skills.title"));
  const queryClient = useQueryClient();
  const skillsQuery = useSkills();
  const [searchParams, setSearchParams] = useRouteSearchParams();
  const [agent, setAgent] = useState<AgentFilter>("all");
  const [query, setQuery] = useState("");
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const [expandedAreas, setExpandedAreas] = useState<SkillArea[]>([]);
  const searchId = useId();

  // The area lives in the URL (`?area=frontend`) so reload, back and forward keep the view.
  const areaParam = searchParams.get("area");
  const area: AreaFilter = isSkillArea(areaParam) ? areaParam : "all";

  const skills = useMemo(() => skillsQuery.data?.skills ?? [], [skillsQuery.data]);
  const detected = useMemo(() => (skillsQuery.data?.agents ?? []).filter((entry) => entry.detected), [skillsQuery.data]);
  const normalizedQuery = normalize(query.trim());
  // No skills installed is the empty state; once any exist, the intro moves behind the `?`.
  const intro = useIntro("skills", skillsQuery.isSuccess ? skills.length > 0 : true);

  /** Agent chips count what the search leaves, whatever agent is selected. */
  const counts = useMemo(() => {
    const source = skills.filter((skill) => matchesQuery(skill, normalizedQuery));
    const map: Record<AgentFilter, number> = {
      all: source.length,
      "claude-code": 0,
      opencode: 0,
      codex: 0,
      shared: 0,
    };
    for (const skill of source) {
      for (const id of skill.agents) map[id] += 1;
    }
    return map;
  }, [skills, normalizedQuery]);

  /** Area chips count what the search and the agent chips leave; the selected one stays visible at 0. */
  const areaCounts = useMemo(() => {
    const scope = skills.filter((skill) => (agent === "all" || skill.agents.includes(agent)) && matchesQuery(skill, normalizedQuery));
    const map = Object.fromEntries(SKILL_AREAS.map((id) => [id, 0])) as Record<SkillArea, number>;
    for (const skill of scope) map[skill.area] += 1;
    return map;
  }, [skills, agent, normalizedQuery]);

  /** Only areas with something to show get a chip; the selected one stays so it can be switched off. */
  const visibleAreas = useMemo(() => SKILL_AREAS.filter((id) => areaCounts[id] > 0 || id === area), [areaCounts, area]);
  const areaTotal = useMemo(() => SKILL_AREAS.reduce((sum, id) => sum + areaCounts[id], 0), [areaCounts]);

  const filtered = useMemo(
    () =>
      skills.filter(
        (skill) =>
          (agent === "all" || skill.agents.includes(agent)) &&
          (area === "all" || skill.area === area) &&
          matchesQuery(skill, normalizedQuery),
      ),
    [skills, agent, area, normalizedQuery],
  );

  const groups = useMemo(
    () =>
      SKILL_AREAS.filter((id) => id === area || area === "all")
        .map((id) => ({ area: id, skills: filtered.filter((skill) => skill.area === id) }))
        .filter((group) => group.skills.length > 0),
    [filtered, area],
  );

  const setArea = useMutation({
    mutationFn: async (input: { key: string; area?: SkillArea }) => {
      const result = input.area ? await putSkillArea(input.key, input.area) : await deleteSkillArea(input.key);
      return { key: result.key, area: result.area as SkillArea | null };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.skills });
      toast.success(t("skills.saved"));
    },
    onError: (error) => {
      toast.error(t("skills.saveFailed", { message: error instanceof Error ? error.message : String(error) }));
    },
  });

  const toggleRow = (key: string) => {
    setOpenKeys((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  };

  const setAreaFilter = (next: AreaFilter) => {
    const params = new URLSearchParams(searchParams);
    if (next === "all") params.delete("area");
    else params.set("area", next);
    setSearchParams(params);
  };

  const toggleAreaGroup = (id: SkillArea) => {
    setExpandedAreas((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const resetFilters = () => {
    setQuery("");
    setAgent("all");
    setAreaFilter("all");
  };

  const body = () => {
    if (skillsQuery.isPending) return <Loading />;
    if (skillsQuery.isError) return <ErrorState error={skillsQuery.error} />;
    if (detected.length === 0) {
      return (
        <EmptyState
          icon={<Puzzle className="size-5" />}
          title={t("skills.empty.noAgents.title")}
          description={t("skills.empty.noAgents.description")}
        >
          <Link to="/settings?section=agents" className={linkClass}>
            {t("skills.empty.noAgents.action")}
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </Link>
        </EmptyState>
      );
    }
    if (skills.length === 0) {
      return (
        <EmptyState
          icon={<Puzzle className="size-5" />}
          title={t("skills.empty.noSkills.title")}
          description={t("skills.empty.noSkills.description")}
        >
          <a href={LINKS.skills} target="_blank" rel="noreferrer" className={linkClass}>
            {t("skills.empty.noSkills.link")}
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </a>
          <a href={LINKS.agentSkills} target="_blank" rel="noreferrer" className={linkClass}>
            {t("skills.empty.noSkills.format")}
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </a>
        </EmptyState>
      );
    }
    if (filtered.length === 0) {
      const title = normalizedQuery
        ? t("skills.empty.noResults.title")
        : agent !== "all"
          ? t("skills.empty.noAgentSkills.title")
          : t("skills.empty.noAreaSkills.title");
      const description = normalizedQuery
        ? t("skills.empty.noResults.description", { query: query.trim() })
        : agent !== "all"
          ? t("skills.empty.noAgentSkills.description", { agent: t(AGENT_LABEL[agent]) })
          : t("skills.empty.noAreaSkills.description", { area: area === "all" ? "" : t(AREA_LABEL[area]) });
      return (
        <EmptyState icon={<SearchX className="size-5" />} title={title} description={description}>
          <button
            type="button"
            onClick={resetFilters}
            className="rounded-full border border-border px-3 py-1 text-xs font-medium transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {t("skills.empty.clear")}
          </button>
        </EmptyState>
      );
    }
    return (
      <div className="flex flex-col gap-6">
        {groups.map((group) => {
          const titleId = `skills-area-${group.area}`;
          const expanded = expandedAreas.includes(group.area);
          const previewing = area === "all" && !expanded && group.skills.length > GROUP_PREVIEW;
          const shown = previewing ? group.skills.slice(0, GROUP_PREVIEW) : group.skills;
          return (
            <section key={group.area} aria-labelledby={titleId} className="flex min-w-0 flex-col gap-2">
              <div className="flex flex-col gap-0.5">
                <h2 id={titleId} className="flex items-baseline gap-2 text-sm font-semibold tracking-tight">
                  {t(AREA_LABEL[group.area])}
                  <span className="font-mono text-[11px] font-normal text-muted-foreground">{group.skills.length}</span>
                </h2>
                <p className="max-w-[68ch] text-xs text-muted-foreground">{t(AREA_SENTENCE[group.area])}</p>
              </div>
              <Rows>
                {shown.map((skill) => (
                  <SkillRow
                    key={skill.key}
                    skill={skill}
                    open={openKeys.includes(skill.key)}
                    busy={setArea.isPending && setArea.variables?.key === skill.key}
                    onToggle={() => toggleRow(skill.key)}
                    onChangeArea={(key, next) => setArea.mutate({ key, area: next })}
                    onResetArea={(key) => setArea.mutate({ key })}
                  />
                ))}
              </Rows>
              {area === "all" && group.skills.length > GROUP_PREVIEW ? (
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-label={
                    expanded
                      ? t("skills.showFewer.label", { area: t(AREA_LABEL[group.area]) })
                      : t("skills.showAll.label", { area: t(AREA_LABEL[group.area]), count: group.skills.length })
                  }
                  onClick={() => toggleAreaGroup(group.area)}
                  className="flex h-8 w-fit items-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {expanded ? t("skills.showFewer") : t("skills.showAll", { count: group.skills.length })}
                  <ChevronDown aria-hidden="true" className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
                </button>
              ) : null}
            </section>
          );
        })}
      </div>
    );
  };

  return (
    <Page className={PAGE_SECTIONS}>
      <Reveal index={0}>
        <PageHeader
          title={t("page.skills.title")}
          description={intro.showIntro ? t("skills.description") : undefined}
          hint={intro.showIntro ? undefined : t("skills.description")}
          onDismissDescription={intro.showIntro ? intro.dismiss : undefined}
        >
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="search"
                value={query}
                onChange={setQuery}
                placeholder={t("skills.searchPlaceholder")}
                aria-label={t("skills.searchPlaceholder")}
                id={searchId}
                leftIcon={<Search />}
                className="w-full sm:w-64"
                classNames={{
                  field: "h-8 bg-muted/60",
                  input: "text-[13px] [&::-webkit-search-cancel-button]:hidden",
                  leftIcon: "left-2.5",
                }}
              />

              {detected.length > 0 && skills.length > 0 ? (
                <Select value={agent} onValueChange={(value) => setAgent(value as AgentFilter)} className="w-full sm:w-48">
                  <SelectTrigger
                    aria-label={t("skills.filters")}
                    title={t("skills.filters")}
                    className="h-8 rounded-full border-border bg-muted/60 px-3 py-0 text-[13px]"
                  >
                    <span className="truncate">{agent === "all" ? t("skills.filter.allAgents") : t(AGENT_LABEL[agent])}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{`${t("skills.filter.allAgents")} (${counts.all})`}</SelectItem>
                    {SKILL_AGENTS.map((id) => (
                      <SelectItem key={id} value={id} disabled={counts[id] === 0 && agent !== id}>
                        {`${t(AGENT_LABEL[id])} (${counts[id]})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </div>

            {visibleAreas.length > 0 ? (
              <fieldset className="m-0 flex min-w-0 flex-wrap items-center gap-1.5 border-0 p-0" aria-label={t("skills.filters.areas")}>
                <FilterChip selected={area === "all"} count={areaTotal} onClick={() => setAreaFilter("all")}>
                  {t("skills.filter.allAreas")}
                </FilterChip>
                {visibleAreas.map((id) => (
                  <FilterChip
                    key={id}
                    selected={area === id}
                    count={areaCounts[id]}
                    disabled={areaCounts[id] === 0 && area !== id}
                    onClick={() => setAreaFilter(id)}
                  >
                    {t(AREA_LABEL[id])}
                  </FilterChip>
                ))}
              </fieldset>
            ) : null}
          </div>

          <BasicsSkillNotice />

          <p role="status" aria-live="polite" className="sr-only">
            {t("skills.results", { count: filtered.length })}
          </p>
        </PageHeader>
      </Reveal>

      <Reveal index={1}>{body()}</Reveal>
    </Page>
  );
}
