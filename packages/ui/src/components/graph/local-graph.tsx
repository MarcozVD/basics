import { lazy, Suspense, useMemo } from "react";
import { useNavigate } from "react-router";
import { Loading } from "@/components/state";
import { useT } from "@/i18n";
import { useGraph } from "@/lib/queries";
import { neighborhood } from "./graph-model";

// Loaded on demand so cytoscape stays out of the editor's bundle.
const GraphCanvas = lazy(() => import("./graph-canvas"));

const FRAME = "h-60 rounded-2xl border border-border bg-card";

/** Depth-1 mini graph around a note; clicking a neighbour opens it. */
export function LocalGraph({ id }: { id: string }) {
  const t = useT();
  const navigate = useNavigate();
  const graph = useGraph(false);
  const size = useMemo(() => (graph.data ? neighborhood(graph.data, id).size : 0), [graph.data, id]);

  const placeholder = (content: React.ReactNode) => <div className={`${FRAME} grid place-items-center`}>{content}</div>;

  if (graph.isPending) return placeholder(<Loading />);
  if (!graph.data) return null;
  if (size <= 1) return placeholder(<p className="text-xs text-muted-foreground">{t("graph.localEmpty")}</p>);

  return (
    <Suspense fallback={placeholder(<Loading />)}>
      <GraphCanvas
        data={graph.data}
        mode="local"
        centerId={id}
        onNodeClick={(target) => {
          if (target !== id) navigate(`/notes/${encodeURIComponent(target)}`);
        }}
        className={FRAME}
      />
    </Suspense>
  );
}
