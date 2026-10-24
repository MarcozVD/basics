"use client";

import {
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift,
  size,
} from "@floating-ui/dom";
import {
  type RefObject,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const VIEWPORT_PADDING = 8;

export type PanelSide = "top" | "bottom";

export interface AnchoredPanelState {
  x: number;
  y: number;
  width: number;
  side: PanelSide;
  /** Space the surface may use on the chosen side, in viewport pixels. */
  maxHeight: number;
}

/**
 * Viewport coordinates for a panel portalled to `document.body`.
 *
 * The surface is positioned with `@floating-ui/dom` so it can flip when the
 * trigger sits near an edge, shift sideways to stay on screen and shrink to the
 * space it actually has. The panel's own list scrolls, so an ancestor with
 * `overflow-y-auto` (the editor sidebar) can never clip its options.
 */
export function useAnchoredPanel({
  open,
  anchorRef,
  panelRef,
  gap = 8,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLElement | null>;
  gap?: number;
}) {
  const [panel, setPanel] = useState<AnchoredPanelState | null>(null);
  const version = useRef(0);

  const position = useCallback(() => {
    const anchor = anchorRef.current;
    const floating = panelRef.current;
    if (!anchor || !floating) return;
    const revision = ++version.current;
    void computePosition(anchor, floating, {
      strategy: "fixed",
      placement: "bottom-start",
      middleware: [
        offset(gap),
        flip({ padding: VIEWPORT_PADDING }),
        shift({ padding: VIEWPORT_PADDING }),
        size({
          padding: VIEWPORT_PADDING,
          apply({ availableHeight, elements }) {
            elements.floating.style.maxHeight = `${Math.max(0, Math.floor(availableHeight))}px`;
          },
        }),
      ],
    }).then(({ x, y, placement, middlewareData }) => {
      if (version.current !== revision || !floating.isConnected) return;
      setPanel({
        x,
        y,
        width: anchor.getBoundingClientRect().width,
        side: placement.startsWith("top") ? "top" : "bottom",
        maxHeight: Math.max(
          0,
          Math.floor(middlewareData.size?.availableHeight ?? floating.offsetHeight),
        ),
      });
    });
  }, [anchorRef, panelRef, gap]);

  useLayoutEffect(() => {
    if (!open) {
      version.current++;
      return;
    }
    position();
    const anchor = anchorRef.current;
    const floating = panelRef.current;
    if (!anchor || !floating) return;
    return autoUpdate(anchor, floating, position);
  }, [open, position, anchorRef, panelRef]);

  return panel;
}
