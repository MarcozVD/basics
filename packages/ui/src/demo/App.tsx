import { lazy, type ReactNode, Suspense } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import { Layout } from "@/components/layout";
import { Page } from "@/components/page";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useDocumentTitle } from "@/lib/page-title";
import { useTheme } from "@/lib/theme";
import { HomePage } from "@/pages/home";
import { demoCopy } from "./copy";
import { FullBridge } from "./FullBridge";

const Explore = lazy(() => import("@/pages/explore").then((module) => ({ default: module.ExplorePage })));
const Editor = lazy(() => import("@/pages/editor").then((module) => ({ default: module.EditorPage })));
const Graph = lazy(() => import("@/pages/graph").then((module) => ({ default: module.GraphPage })));
const Inbox = lazy(() => import("@/pages/inbox").then((module) => ({ default: module.InboxPage })));
const Proposal = lazy(() => import("@/pages/proposal").then((module) => ({ default: module.ProposalPage })));
const Recommend = lazy(() => import("./recommend"));
function DemoNotice() {
  const { language, setLanguage, t } = useI18n();
  const { resolvedTheme, setTheme } = useTheme();
  const copy = demoCopy[language];
  return (
    <div
      data-testid="demo-notice"
      className="mx-2 mt-2 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground"
    >
      <span className="max-sm:basis-full">{copy.badge}</span>
      <div className="ml-auto flex items-center gap-2">
        <select
          aria-label={t("nav.language")}
          value={language}
          onChange={(event) => void setLanguage(event.target.value as "en" | "es")}
          className="rounded border border-border bg-card px-1 py-1 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <option value="en">English</option>
          <option value="es">Español</option>
        </select>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          aria-label={resolvedTheme === "dark" ? copy.light : copy.dark}
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          {t("nav.theme")}
        </Button>
      </div>
    </div>
  );
}

function Unavailable() {
  const { language } = useI18n();
  const copy = demoCopy[language];
  useDocumentTitle(copy.title);
  return (
    <Page>
      <PageHeader title={copy.title} description={copy.unavailable} />
      <Button asChild className="mt-4 self-start" size="sm">
        <a href="/basics/guide/getting-started.html" target="_top">
          {copy.install}
        </a>
      </Button>
    </Page>
  );
}

function Loading() {
  const { t } = useI18n();
  return (
    <Page role="status">
      <span className="sr-only">{t("state.loading")}</span>
    </Page>
  );
}

const deferred = (page: ReactNode) => <Suspense fallback={<Loading />}>{page}</Suspense>;

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: (
        <>
          <FullBridge />
          <Layout notice={<DemoNotice />} />
        </>
      ),
      children: [
        { index: true, element: <HomePage /> },
        { path: "explore", element: deferred(<Explore />) },
        { path: "notes/:id", element: deferred(<Editor />) },
        { path: "graph", element: deferred(<Graph />) },
        { path: "inbox", element: deferred(<Inbox />) },
        { path: "inbox/:id", element: deferred(<Proposal />) },
        { path: "recommend", element: deferred(<Recommend />) },
        { path: "*", element: <Unavailable /> },
      ],
    },
  ],
  { basename: "/basics/demo/" },
);

export default function DemoApp() {
  return <RouterProvider router={router} />;
}
