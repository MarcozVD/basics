import { Compass, FolderClosed, House, Inbox, Network, Search, Sparkles } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { Link, NavLink, useLocation, useOutlet } from "react-router";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { AnimatedToastStack } from "@/components/motion/animated-toast-stack";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { ThemeToggle } from "@/components/motion/theme-toggle";
import { Tooltip } from "@/components/motion/tooltip";
import { useI18n } from "@/i18n";
import { EASE_OUT, SPRING_LAYOUT } from "@/lib/ease";
import { useHealth, useInbox } from "@/lib/queries";
import { dismissToast, useToasts } from "@/lib/toast";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", labelKey: "nav.home", icon: House, end: true },
  { to: "/explore", labelKey: "nav.explore", icon: Compass },
  { to: "/graph", labelKey: "nav.graph", icon: Network },
  { to: "/inbox", labelKey: "nav.inbox", icon: Inbox },
  { to: "/recommend", labelKey: "nav.recommend", icon: Sparkles },
] as const;

export function Layout() {
  const { t, language, setLanguage } = useI18n();
  const location = useLocation();
  const outlet = useOutlet();
  const reduce = useReducedMotion();
  const health = useHealth();
  const inbox = useInbox();
  const toasts = useToasts();
  const pending = inbox.data?.length ?? 0;
  const vault = health.data?.vault;
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <aside className="flex w-[232px] shrink-0 flex-col p-2">
        <div className="flex h-10 items-center gap-2 px-1">
          <div
            aria-hidden="true"
            className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary font-mono text-[13px] font-semibold text-primary-foreground"
          >
            b
          </div>
          <Link
            to="/"
            className="rounded-full text-[15px] font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {t("app.name")}
          </Link>
          {health.data && <span className="ml-auto font-mono text-[11px] text-muted-foreground">v{health.data.version}</span>}
        </div>

        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("basics:open-palette"))}
          className="mt-3 flex h-9 w-full items-center gap-2 rounded-full bg-muted/60 px-3 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        >
          <Search className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{t("search.placeholder")}</span>
          <kbd className="ml-auto rounded-full border border-border px-1.5 py-px font-mono text-[10px] text-muted-foreground">⌘K</kbd>
        </button>

        <nav aria-label={t("nav.primary")} className="mt-2 flex flex-col gap-0.5" onMouseLeave={() => setHovered(null)}>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={"end" in item ? item.end : false}
                onMouseEnter={() => setHovered(item.to)}
                className={({ isActive }) =>
                  cn(
                    "relative flex h-9 items-center gap-2.5 rounded-full px-3 text-[13px] font-medium text-muted-foreground transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                    isActive && "text-primary",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive ? (
                      <motion.span
                        layoutId="nav-active"
                        transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
                        className="absolute inset-0 rounded-full bg-primary/12"
                      />
                    ) : hovered === item.to ? (
                      <motion.span
                        layoutId="nav-hover"
                        transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
                        className="absolute inset-0 rounded-full bg-muted/70"
                      />
                    ) : null}
                    <Icon className="relative size-4 shrink-0" aria-hidden="true" />
                    <span className="relative truncate">{t(item.labelKey)}</span>
                    {item.to === "/inbox" && pending > 0 && (
                      <span className="relative ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                        <AnimatedNumber value={pending} startOnView={false} duration={0.5} />
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-2 px-1">
          <Tooltip
            content={vault ?? t("nav.vaultUnavailable")}
            side="top"
            align="start"
            className="max-w-80 font-mono text-[11px] break-all"
          >
            <button
              type="button"
              aria-label={`${t("nav.vault")}: ${vault ?? t("nav.vaultUnavailable")}`}
              className="flex w-full min-w-0 items-center gap-1.5 rounded-full px-2 py-1.5 text-left text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            >
              <FolderClosed className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{vault ?? t("nav.vaultUnavailable")}</span>
            </button>
          </Tooltip>

          <div className="flex items-center justify-between">
            <fieldset className="m-0 min-w-0 border-0 p-0" aria-label={t("nav.language")}>
              <Tabs value={language} onValueChange={(value) => setLanguage(value as "en" | "es")} variant="segment">
                <TabsList>
                  {(["en", "es"] as const).map((option) => (
                    <TabsTrigger key={option} value={option} className="px-2.5 py-1 text-[11px] font-medium uppercase">
                      {option}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </fieldset>
            <ThemeToggle
              aria-label={t("nav.theme")}
              title={t("nav.theme")}
              className="size-8 rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              iconClassName="size-4"
            />
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1 p-2 pl-0">
        <main className="h-full overflow-y-auto rounded-2xl border border-border bg-card">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: reduce ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: EASE_OUT }}
              className="min-h-full"
            >
              {outlet}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <AnimatedToastStack toasts={toasts} onDismiss={dismissToast} position="bottom-right" fixed />
    </div>
  );
}
