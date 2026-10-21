"use client";
// Adapted from beui.dev/components/blocks/command-palette for Basics.

import {
  Copy,
  House,
  Inbox as InboxIcon,
  Languages,
  LayoutList,
  type LucideIcon,
  Moon,
  Package,
  Plus,
  Sparkles,
  Sun,
  Terminal,
  Waypoints,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { type TranslationKey, useI18n } from "@/i18n";
import { searchCommands } from "@/lib/command-search";
import { EASE_OUT } from "@/lib/ease";
import { useOnOpen } from "@/lib/hooks/use-on-open";
import { useRowCursor } from "@/lib/hooks/use-row-cursor";
import { PresenceGate } from "@/lib/presence-gate";
import { useHealth, useInbox, useNotes } from "@/lib/queries";
import { readRecentNotes } from "@/lib/recent-notes";
import { useReturnFocus } from "@/lib/return-focus";
import { useTheme } from "@/lib/theme";
import { toast } from "@/lib/toast";
import { tintStyle, typeColor } from "@/lib/type-color";
import { cn } from "@/lib/utils";

interface PaletteItem {
  id: string;
  group: string;
  label: string;
  hint?: string;
  keywords?: string[];
  badge?: ReactNode;
  icon?: LucideIcon;
  onSelect: () => void;
}

// Opened many times a day: the entrance must read as instant.
const ENTER = { duration: 0.16, ease: EASE_OUT };
const EXIT = { duration: 0.12, ease: EASE_OUT };
const MAX_PER_GROUP = 8;

function groupStarts(groups: [string, PaletteItem[]][]): number[] {
  const starts: number[] = [];
  let index = 0;
  for (const [, list] of groups) {
    starts.push(index);
    index += list.length;
  }
  return starts;
}

/** ⌘K palette: notes, pending proposals, navigation and actions. */
export function AppCommandPalette() {
  const { t, language, setLanguage } = useI18n();
  const { resolvedTheme, setTheme } = useTheme();
  const inbox = useInbox();
  const notes = useNotes();
  const health = useHealth();
  const vault = health.data?.vault ?? "";
  const navigate = useNavigate();
  const reduce = useReducedMotion();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  const uid = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);
  useReturnFocus(open);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      } else if (event.key === "Escape" && open) {
        event.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("basics:open-palette", onOpen);
    return () => window.removeEventListener("basics:open-palette", onOpen);
  }, []);

  useEffect(() => {
    if (open) setRecent(readRecentNotes());
  }, [open]);

  const copy = useCallback(
    async (value: string) => {
      try {
        await navigator.clipboard.writeText(value);
        toast.success(t("palette.copied"));
      } catch {
        toast.error(t("palette.copyFailed"));
      }
    },
    [t],
  );

  const close = () => setOpen(false);

  const items = useMemo<PaletteItem[]>(() => {
    const list: PaletteItem[] = [];
    const noteById = new Map((notes.data ?? []).map((note) => [note.id, note]));

    if (query.trim()) {
      const noteItems = [...(notes.data ?? [])]
        .sort((a, b) => (a.title || a.id).localeCompare(b.title || b.id) || a.id.localeCompare(b.id))
        .map<PaletteItem>((note) => ({
          id: `note:${note.id}`,
          group: t("palette.group.notes"),
          label: note.title || note.id,
          keywords: [note.id],
          badge: (
            <span
              className="inline-flex h-5 items-center gap-1 rounded-full px-2 text-[10px] font-medium"
              style={tintStyle(typeColor(note.type))}
            >
              {t(`type.${note.type}` as TranslationKey)}
            </span>
          ),
          onSelect: () => navigate(`/notes/${encodeURIComponent(note.id)}`),
        }));
      list.push(...noteItems);

      for (const proposal of inbox.data ?? []) {
        list.push({
          id: `proposal:${proposal.id}`,
          group: t("palette.group.proposals"),
          label: proposal.title || proposal.id,
          keywords: [proposal.id, t("palette.pending")],
          badge: (
            <span
              className="inline-flex h-5 items-center rounded-full px-2 text-[10px] font-medium"
              style={tintStyle(typeColor(proposal.type))}
            >
              {t(`type.${proposal.type}` as TranslationKey)}
            </span>
          ),
          onSelect: () => navigate(`/inbox/${encodeURIComponent(proposal.id)}`),
        });
      }
    } else {
      for (const id of recent) {
        const note = noteById.get(id);
        if (!note) continue;
        list.push({
          id: `note:${note.id}`,
          group: t("palette.group.recent"),
          label: note.title || note.id,
          keywords: [note.id],
          badge: (
            <span
              className="inline-flex h-5 items-center gap-1 rounded-full px-2 text-[10px] font-medium"
              style={tintStyle(typeColor(note.type))}
            >
              {t(`type.${note.type}` as TranslationKey)}
            </span>
          ),
          onSelect: () => navigate(`/notes/${encodeURIComponent(note.id)}`),
        });
      }
    }

    const routes: { to: string; labelKey: TranslationKey; icon: LucideIcon; hint: string }[] = [
      { to: "/", labelKey: "nav.home", icon: House, hint: "G H" },
      { to: "/explore", labelKey: "nav.explore", icon: LayoutList, hint: "G E" },
      { to: "/graph", labelKey: "nav.graph", icon: Waypoints, hint: "G G" },
      { to: "/inbox", labelKey: "nav.inbox", icon: InboxIcon, hint: "G I" },
      { to: "/recommend", labelKey: "nav.recommend", icon: Sparkles, hint: "G R" },
    ];
    for (const route of routes) {
      list.push({
        id: `go:${route.to}`,
        group: t("palette.group.go"),
        label: t(route.labelKey),
        hint: route.hint,
        icon: route.icon,
        onSelect: () => navigate(route.to),
      });
    }

    list.push(
      {
        id: "action:install-packs",
        group: t("palette.group.actions"),
        label: t("palette.action.installPacks"),
        keywords: ["starter", "onboarding", "setup", "packs"],
        icon: Package,
        onSelect: () => navigate("/?packs=1"),
      },
      {
        id: "action:new-note",
        group: t("palette.group.actions"),
        label: t("palette.action.newNote"),
        keywords: ["create"],
        icon: Plus,
        onSelect: () => window.dispatchEvent(new Event("basics:new-note")),
      },
      {
        id: "action:theme",
        group: t("palette.group.actions"),
        label: t("palette.action.theme"),
        keywords: ["dark", "light"],
        icon: resolvedTheme === "dark" ? Sun : Moon,
        onSelect: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
      },
      {
        id: "action:language",
        group: t("palette.group.actions"),
        label: t("palette.action.language", {
          language: t(language === "en" ? "palette.language.spanish" : "palette.language.english"),
        }),
        keywords: ["english", "español", "locale"],
        icon: Languages,
        onSelect: () => setLanguage(language === "en" ? "es" : "en"),
      },
      {
        id: "action:copy-vault",
        group: t("palette.group.actions"),
        label: t("palette.action.copyVault"),
        keywords: ["path", "folder"],
        icon: Copy,
        onSelect: () => void copy(vault),
      },
      {
        id: "action:copy-mcp",
        group: t("palette.group.actions"),
        label: t("palette.action.copyMcp"),
        keywords: ["claude", "mcp", "agent", "connect"],
        icon: Terminal,
        onSelect: () => void copy(`claude mcp add --transport http basics ${window.location.origin}/mcp`),
      },
    );

    return list;
  }, [query, notes.data, inbox.data, recent, t, language, resolvedTheme, vault, navigate, setLanguage, setTheme, copy]);

  const filtered = useMemo(() => searchCommands(items, query), [items, query]);
  const grouped = useMemo(() => {
    const groups = new Map<string, PaletteItem[]>();
    for (const item of filtered) {
      const list = groups.get(item.group) ?? [];
      if (list.length >= MAX_PER_GROUP) continue;
      list.push(item);
      groups.set(item.group, list);
    }
    return [...groups.entries()];
  }, [filtered]);
  const rows = useMemo(() => grouped.flatMap(([, list]) => list), [grouped]);
  const starts = useMemo(() => groupStarts(grouped), [grouped]);
  const { activeIndex, moveTo, moveActive } = useRowCursor(rows, query);
  const hasIcons = useMemo(() => rows.some((item) => item.icon), [rows]);

  useOnOpen(open, () => {
    setQuery("");
    moveTo(null);
  });

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const element = listRef.current?.querySelector<HTMLButtonElement>(`[data-index="${activeIndex}"]`);
    element?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const cycleGroup = (direction: 1 | -1) => {
    if (!starts.length) return;
    const current = starts.reduce((best, start, index) => (start <= activeIndex ? index : best), 0);
    const next = (Math.max(current, 0) + direction + starts.length) % starts.length;
    const row = rows[starts[next]];
    if (row) moveTo(row.id);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === "Tab") {
      event.preventDefault();
      cycleGroup(event.shiftKey ? -1 : 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = rows[activeIndex];
      if (!item) return;
      item.onSelect();
      close();
    }
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence initial={false}>
      {open ? (
        <PresenceGate key="backdrop">
          {({ gate }) => (
            <motion.button
              type="button"
              aria-label={t("palette.close")}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: EXIT }}
              transition={ENTER}
              {...gate}
              onClick={close}
              className="pointer-events-auto fixed inset-0 z-[100] bg-background/5 [backdrop-filter:blur(12px)_saturate(140%)] [-webkit-backdrop-filter:blur(12px)_saturate(140%)]"
            />
          )}
        </PresenceGate>
      ) : null}

      {open ? (
        <PresenceGate key="panel-layer">
          {({ isPresent, gate }) => (
            <div inert={!isPresent} className="pointer-events-none fixed inset-x-4 top-[20%] z-[100] flex items-start justify-center">
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-label={t("nav.palette")}
                initial={{ opacity: 0, y: reduce ? 0 : -8, scale: reduce ? 1 : 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: reduce ? 0 : -8, scale: reduce ? 1 : 0.98, transition: EXIT }}
                transition={reduce ? { duration: 0.1 } : ENTER}
                {...gate}
                onKeyDown={onKeyDown}
                className="pointer-events-auto w-full max-w-[640px] overflow-hidden rounded-2xl border border-border bg-popover/85 shadow-[0_8px_30px_rgba(0,0,0,0.25)] backdrop-blur-2xl will-change-transform"
              >
                <div className="flex items-center gap-3 border-b border-border px-4">
                  <span className="sr-only">{t("nav.palette")}</span>
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t("palette.placeholder")}
                    role="combobox"
                    aria-expanded="true"
                    aria-controls={`${uid}-list`}
                    aria-activedescendant={rows.length ? `${uid}-opt-${activeIndex}` : undefined}
                    aria-autocomplete="list"
                    className="h-12 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  />
                  <kbd className="hidden rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-block">
                    ESC
                  </kbd>
                </div>

                <div
                  ref={listRef}
                  id={`${uid}-list`}
                  role="listbox"
                  aria-label={t("nav.palette")}
                  className="max-h-[60vh] overflow-y-auto overscroll-contain p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {rows.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">{t("palette.empty")}</div>
                  ) : (
                    grouped.map(([group, list]) => (
                      <div key={group} className="mb-1 last:mb-0">
                        <div
                          aria-hidden="true"
                          className="px-2 py-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
                        >
                          {group}
                        </div>
                        {list.map((item) => {
                          const index = rows.indexOf(item);
                          const isActive = index === activeIndex;
                          const Icon = item.icon;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              id={`${uid}-opt-${index}`}
                              role="option"
                              aria-selected={isActive}
                              data-index={index}
                              onMouseEnter={() => moveTo(item.id)}
                              onClick={() => {
                                item.onSelect();
                                close();
                              }}
                              className={cn(
                                "relative isolate flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors",
                                isActive ? "text-foreground" : "text-muted-foreground",
                              )}
                            >
                              {isActive ? (
                                <motion.span
                                  layoutId={`${uid}-active`}
                                  className="absolute inset-0 z-0 rounded-lg bg-muted"
                                  transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 480, damping: 38 }}
                                />
                              ) : null}
                              {Icon ? (
                                <Icon className="relative z-10 size-4" aria-hidden="true" />
                              ) : hasIcons ? (
                                <span className="relative z-10 size-4" />
                              ) : null}
                              <span className="relative z-10 flex-1 truncate">{item.label}</span>
                              {item.badge ? <span className="relative z-10 shrink-0">{item.badge}</span> : null}
                              {item.hint ? (
                                <kbd className="relative z-10 rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                                  {item.hint}
                                </kbd>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </PresenceGate>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
