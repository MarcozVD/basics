import { createBrowserRouter, RouterProvider } from "react-router";
import { Layout } from "@/components/layout";
import { useVaultEvents } from "@/lib/events";
import { EditorPage } from "@/pages/editor";
import { ExplorePage } from "@/pages/explore";
import { InboxPage } from "@/pages/inbox";
import { NotFoundPage } from "@/pages/not-found";
import { ProposalPage } from "@/pages/proposal";
import { RecommendPage } from "@/pages/recommend";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <ExplorePage /> },
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
