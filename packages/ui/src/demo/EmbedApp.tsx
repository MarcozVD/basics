import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate, RouterProvider, useParams } from "react-router";
import { EmbedFrame, EmbedLoading, type Part } from "./embed";
import "./embed.css";

const Explore = lazy(() => import("./embeds/explore"));
const Note = lazy(() => import("./embeds/note"));
const Graph = lazy(() => import("./embeds/graph"));
const Proposal = lazy(() => import("./embeds/proposal"));
const Recommend = lazy(() => import("./recommend"));
const parts = { explore: Explore, note: Note, graph: Graph, proposal: Proposal, recommend: Recommend };
function NoteRedirect() {
  const { id } = useParams();
  return <Navigate replace to={`/embed/note?id=${encodeURIComponent(id || "nextjs")}`} />;
}
const router = createBrowserRouter(
  [
    ...(Object.entries(parts) as [Part, typeof Explore][]).map(([part, Component]) => ({
      path: `/embed/${part}`,
      element: (
        <EmbedFrame key={part} part={part}>
          <Suspense fallback={<EmbedLoading />}>
            <Component />
          </Suspense>
        </EmbedFrame>
      ),
    })),
    { path: "/notes/:id", element: <NoteRedirect /> },
  ],
  { basename: "/basics/demo/" },
);

export default function EmbedApp() {
  return <RouterProvider router={router} />;
}
