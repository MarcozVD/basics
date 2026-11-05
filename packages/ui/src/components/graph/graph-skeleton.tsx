import { cn } from "@/lib/utils";

/**
 * The panel's blank slate while the graph page or the cytoscape chunk loads. It keeps the
 * exact box the canvas will fill (same border box, same toolbar slot), so nothing shifts
 * when the real canvas arrives. Deliberately not a spinner: a cold route shows this only
 * after 150ms, and a spinner would read as a stall.
 */
export function GraphSkeleton({ className, label }: { className?: string; label?: string }) {
  return (
    <div role="status" aria-busy="true" className={cn("relative min-h-0 flex-1", className)}>
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
        <div className="absolute top-3 left-3 flex h-11 w-72 max-w-[calc(100%-24px)] items-center gap-2 rounded-[22px] border border-border bg-card/70 px-3 motion-safe:animate-pulse">
          <div className="size-5 rounded-md bg-muted/70" />
          <div className="h-4 w-24 rounded-full bg-muted/60" />
          <div className="ml-auto size-6 rounded-full bg-muted/50" />
        </div>
        <div className="absolute inset-0 motion-safe:animate-pulse">
          {NODES.map((node) => (
            <div
              key={`${node.left}-${node.top}`}
              className="absolute rounded-full bg-muted/50"
              style={{ left: `${node.left}%`, top: `${node.top}%`, width: node.size, height: node.size }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** A few quiet dots to suggest the graph without drawing anything real. */
const NODES = [
  { left: 24, top: 34, size: 44 },
  { left: 45, top: 22, size: 28 },
  { left: 62, top: 44, size: 56 },
  { left: 38, top: 62, size: 36 },
  { left: 72, top: 70, size: 24 },
  { left: 55, top: 78, size: 32 },
];
