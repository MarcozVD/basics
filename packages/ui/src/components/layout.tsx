import { cn } from "cn";
import { Check, Compass, FolderClosed, Inbox, Monitor, Moon, Sparkles, Sun } from "lucide-react";
import { Link, NavLink, Outlet } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Toaster } from "@/components/ui/sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/i18n";
import { useHealth, useInbox } from "@/lib/queries";
import { type Theme, useTheme } from "@/lib/theme";

const navItems = [
  { to: "/", labelKey: "nav.explore", icon: Compass, end: true },
  { to: "/inbox", labelKey: "nav.inbox", icon: Inbox },
  { to: "/recommend", labelKey: "nav.recommend", icon: Sparkles },
] as const;

const themeOptions: { value: Theme; labelKey: "theme.light" | "theme.dark" | "theme.system"; icon: typeof Sun }[] = [
  { value: "light", labelKey: "theme.light", icon: Sun },
  { value: "dark", labelKey: "theme.dark", icon: Moon },
  { value: "system", labelKey: "theme.system", icon: Monitor },
];

function ThemeToggle() {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  const CurrentIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t("nav.theme")} title={t("nav.theme")}>
          <CurrentIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-36">
        {themeOptions.map((option) => {
          const Icon = option.icon;
          return (
            <DropdownMenuItem key={option.value} onSelect={() => setTheme(option.value)} className="gap-2">
              <Icon aria-hidden="true" />
              <span>{t(option.labelKey)}</span>
              {theme === option.value && <Check className="ml-auto" aria-hidden="true" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Layout() {
  const { t, language, setLanguage } = useI18n();
  const { resolvedTheme } = useTheme();
  const health = useHealth();
  const inbox = useInbox();
  const pending = inbox.data?.length ?? 0;
  const vault = health.data?.vault;

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="flex h-12 items-center gap-2 border-b border-sidebar-border px-4">
          <Link
            to="/"
            className="rounded-sm text-[15px] font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {t("app.name")}
          </Link>
          {health.data && <span className="ml-auto font-mono text-[11px] text-muted-foreground">v{health.data.version}</span>}
        </div>

        <nav aria-label={t("nav.primary")} className="flex flex-col gap-0.5 p-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={"end" in item ? item.end : false}
                className={({ isActive }) =>
                  cn(
                    "flex h-8 items-center gap-2 rounded-md px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                    isActive && "bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary",
                  )
                }
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span>{t(item.labelKey)}</span>
                {item.to === "/inbox" && pending > 0 && (
                  <Badge variant="secondary" className="ml-auto h-5 min-w-5 rounded px-1 font-mono text-[10px] tabular-nums">
                    {pending}
                  </Badge>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-sidebar-border p-2">
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`${t("nav.vault")}: ${vault ?? t("nav.vaultUnavailable")}`}
                  className="flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                >
                  <FolderClosed className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{vault ?? t("nav.vaultUnavailable")}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" align="start" className="max-w-80 font-mono text-[11px] break-all">
                {vault ?? t("nav.vaultUnavailable")}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="mt-1 flex items-center justify-between px-1">
            <fieldset
              aria-label={t("nav.language")}
              className="m-0 flex min-w-0 items-center gap-0.5 rounded-md border border-sidebar-border p-0.5"
            >
              {(["en", "es"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setLanguage(option)}
                  aria-pressed={language === option}
                  className={cn(
                    "h-6 rounded px-1.5 text-[11px] font-medium text-muted-foreground uppercase transition-colors hover:text-foreground",
                    "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                    language === option && "bg-sidebar-accent text-foreground",
                  )}
                >
                  {option}
                </button>
              ))}
            </fieldset>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>

      <Toaster theme={resolvedTheme} position="bottom-right" />
    </div>
  );
}
