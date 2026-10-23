import { lazy, type ReactNode, Suspense, useEffect } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import { Layout } from "@/components/layout";
import { Page } from "@/components/page";
import { Loading } from "@/components/state";
import { useT } from "@/i18n";
import { useVaultEvents } from "@/lib/events";
import { HomePage } from "@/pages/home";
import { NotFoundPage } from "@/pages/not-found";

// Home is the landing page and ships in the main chunk; every other route loads on first visit.
// Route modules are also prefetched once the browser is idle, so later navigation stays instant.
const routeModules = {
  explore: () => import("@/pages/explore"),
  editor: () => import("@/pages/editor"),
  // Cytoscape is heavy; the graph page and its canvas stay out of the main chunk.
  graph: () => import("@/pages/graph"),
  inbox: () => import("@/pages/inbox"),
  projects: () => import("@/pages/projects"),
  proposal: () => import("@/pages/proposal"),
  recommend: () => import("@/pages/recommend"),
};

const ExplorePage = lazy(() => routeModules.explore().then((module) => ({ default: module.ExplorePage })));
const EditorPage = lazy(() => routeModules.editor().then((module) => ({ default: module.EditorPage })));
const GraphPage = lazy(() => routeModules.graph().then((module) => ({ default: module.GraphPage })));
const InboxPage = lazy(() => routeModules.inbox().then((module) => ({ default: module.InboxPage })));
const ProjectsPage = lazy(() => routeModules.projects().then((module) => ({ default: module.ProjectsPage })));
const ProposalPage = lazy(() => routeModules.proposal().then((module) => ({ default: module.ProposalPage })));
const RecommendPage = lazy(() => routeModules.recommend().then((module) => ({ default: module.RecommendPage })));

/** Quiet placeholder shown only on a cold load of a route: a title bar and a few rows, no spinner jump. */
function RouteSkeleton() {
  const t = useT();
  return (
    <Page role="status" aria-busy="true">
      <span className="sr-only">{t("state.loading")}</span>
      <div aria-hidden="true" className="flex flex-col gap-3 motion-safe:animate-pulse">
        <div className="h-7 w-40 rounded-full bg-muted/70" />
        <div className="h-8 w-full max-w-xl rounded-full bg-muted/50" />
        <div className="mt-2 flex flex-col gap-2">
          <div className="h-11 rounded-xl bg-muted/40" />
          <div className="h-11 rounded-xl bg-muted/40" />
          <div className="h-11 rounded-xl bg-muted/40" />
        </div>
      </div>
    </Page>
  );
}

/** The graph fills the viewport; its fallback keeps the same box so nothing shifts when the canvas arrives. */
function GraphSkeleton() {
  return (
    <div className="grid h-[calc(100dvh-3rem-78px)] place-items-center">
      <Loading />
    </div>
  );
}

function Lazy({ children, fallback = <RouteSkeleton /> }: { children: ReactNode; fallback?: ReactNode }) {
  return <Suspense fallback={fallback}>{children}</Suspense>;
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
