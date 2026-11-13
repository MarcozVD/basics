import { useCallback, useState } from "react";
import { useSearchParams } from "react-router";
import GraphCanvas from "@/components/graph/graph-canvas";
import { ErrorState, Loading } from "@/components/state";
import { useGraph } from "@/lib/queries";
import { useEmbedReady } from "../embed";

export default function GraphEmbed() {
  const [params, setParams] = useSearchParams();
  const graph = useGraph(false);
  const [painted, setPainted] = useState(false);
  const markReady = useCallback(() => setPainted(true), []);
  useEmbedReady(painted);
  if (graph.isPending) return <Loading />;
  if (graph.error) return <ErrorState error={graph.error} />;
  if (!graph.data) return null;
  const requested = params.get("focus") || "nextjs";
  const id = graph.data.nodes.some((node) => node.id === requested) ? requested : "nextjs";
  return (
    <GraphCanvas
      data={graph.data}
      mode="local"
      centerId={id}
      className="h-dvh min-h-60 w-full"
      onReady={markReady}
      onNodeClick={(target) => setParams({ focus: target }, { replace: true })}
    />
  );
}
