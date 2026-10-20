import { lazy, Suspense } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import { Layout } from "@/components/layout";
import { Loading } from "@/components/state";
import { useVaultEvents } from "@/lib/events";
import { EditorPage } from "@/pages/editor";
import { ExplorePage } from "@/pages/explore";
import { HomePage } from "@/pages/home";
import { InboxPage } from "@/pages/inbox";
import { NotFoundPage } from "@/pages/not-found";
import { ProposalPage } from "@/pages/proposal";
import { RecommendPage } from "@/pages/recommend";

// Cytoscape is heavy; the graph page and its canvas load on first visit.
const GraphPage = lazy(() => import("@/pages/graph").then((module) => ({ default: module.GraphPage })));

function LazyGraph() {
  return (
    <Suspense
      fallback={
        <div className="grid h-[calc(100dvh-3rem-78px)] place-items-center">
          <Loading />
        </div>
      }
    >
      <GraphPage />
    </Suspense>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "explore", element: <ExplorePage /> },
      { path: "graph", element: <LazyGraph /> },
      { path: "notes/:id", element: <EditorPage /> },
      { path: "inbox", element: <InboxPage /> },
      { path: "inbox/:id", element: <ProposalPage /> },
      { path: "recommend", element: <RecommendPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

export default function App() {
  useVaultEvents();
  return <RouterProvider router={router} />;
}
