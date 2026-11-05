import { lazy, type ReactNode, Suspense, useEffect } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import { GraphSkeleton } from "@/components/graph/graph-skeleton";
import { Layout } from "@/components/layout";
import { Page } from "@/components/page";
import { DelayedMount } from "@/components/state";
import { useT } from "@/i18n";
import { useVaultEvents } from "@/lib/events";
// Home is the landing page and ships in the main chunk; every other route loads on first visit.
// Route modules are also prefetched once the browser is idle (and on sidebar hover), so later
// navigation stays instant.
import { routeModules } from "@/lib/prefetch";
import { HomePage } from "@/pages/home";
import { NotFoundPage } from "@/pages/not-found";

const ExplorePage = lazy(() => routeModules.explore().then((module) => ({ default: module.ExplorePage })));
const EditorPage = lazy(() => routeModules.editor().then((module) => ({ default: module.EditorPage })));
const GraphPage = lazy(() => routeModules.graph().then((module) => ({ default: module.GraphPage })));
const InboxPage = lazy(() => routeModules.inbox().then((module) => ({ default: module.InboxPage })));
const ProjectsPage = lazy(() => routeModules.projects().then((module) => ({ default: module.ProjectsPage })));
const ProposalPage = lazy(() => routeModules.proposal().then((module) => ({ default: module.ProposalPage })));
const RecommendPage = lazy(() => routeModules.recommend().then((module) => ({ default: module.RecommendPage })));
const SkillsPage = lazy(() => routeModules.skills().then((module) => ({ default: module.SkillsPage })));
const SettingsPage = lazy(() => routeModules.settings().then((module) => ({ default: module.SettingsPage })));

/**
 * Quiet placeholder shown only on a cold load of a route: the panel's own frame, a title bar
 * and the first rows at their real heights, so turning it into content moves nothing.
 */
function RouteSkeleton() {
  const t = useT();
  return (
    <Page role="status" aria-busy="true" className="pt-4">
      <span className="sr-only">{t("state.loading")}</span>
      <div aria-hidden="true" className="flex w-full flex-col gap-3 motion-safe:animate-pulse">
        <div className="h-7 w-40 rounded-full bg-muted/70" />
        <div className="h-4 w-full max-w-xl rounded-full bg-muted/50" />
        <div className="mt-1 flex flex-wrap gap-2">
          <div className="h-7 w-24 rounded-full bg-muted/50" />
          <div className="h-7 w-20 rounded-full bg-muted/50" />
          <div className="h-7 w-28 rounded-full bg-muted/50" />
          <div className="ml-auto h-8 w-44 rounded-full bg-muted/40" />
        </div>
        <div className="mt-2 flex flex-col gap-2">
          {SKELETON_ROWS.map((key) => (
            <div key={key} className="h-[52px] rounded-xl border border-border/50 bg-muted/30" />
          ))}
        </div>
      </div>
    </Page>
  );
}

const SKELETON_ROWS = [0, 1, 2, 3, 4, 5];

function Lazy({ children, fallback = <RouteSkeleton /> }: { children: ReactNode; fallback?: ReactNode }) {
  return <Suspense fallback={<DelayedMount>{fallback}</DelayedMount>}>{children}</Suspense>;
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      {
        path: "explore",
        element: (
          <Lazy>
            <ExplorePage />
          </Lazy>
        ),
      },
      {
        path: "projects",
        element: (
          <Lazy>
            <ProjectsPage />
          </Lazy>
        ),
      },
      {
        path: "graph",
        element: (
          <Lazy fallback={<GraphSkeleton />}>
            <GraphPage />
          </Lazy>
        ),
      },
      {
        path: "notes/:id",
        element: (
          <Lazy>
            <EditorPage />
          </Lazy>
        ),
      },
      {
        path: "inbox",
        element: (
          <Lazy>
            <InboxPage />
          </Lazy>
        ),
      },
      {
        path: "inbox/:id",
        element: (
          <Lazy>
            <ProposalPage />
          </Lazy>
        ),
      },
      {
        path: "recommend",
        element: (
          <Lazy>
            <RecommendPage />
          </Lazy>
        ),
      },
      {
        path: "skills",
        element: (
          <Lazy>
            <SkillsPage />
          </Lazy>
        ),
      },
      {
        path: "settings",
        element: (
          <Lazy>
            <SettingsPage />
          </Lazy>
        ),
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

function usePrefetchRoutes() {
  useEffect(() => {
    const prefetch = () => {
      for (const load of Object.values(routeModules)) void load().catch(() => undefined);
    };
    if ("requestIdleCallback" in window) {
      const handle = window.requestIdleCallback(prefetch, { timeout: 3000 });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = setTimeout(prefetch, 1500);
    return () => clearTimeout(timer);
  }, []);
}

export default function App() {
  useVaultEvents();
  usePrefetchRoutes();
  return <RouterProvider router={router} />;
}
