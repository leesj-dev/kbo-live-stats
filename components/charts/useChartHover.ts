"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pickHoverPoint, type HoverPick } from "@/lib/chart";

// Pointer tracking shared by both SVG charts: nearest-point hit testing with
// sticky hysteresis (lib/chart.ts), highlight syncing, and hover reset when
// the axes change (a hover captured under the previous axes is meaningless,
// so the tooltip must never show stale values).
export function useChartHover<P>({
  series,
  project,
  viewWidth,
  narrow,
  onHighlight,
  resetKey,
}: {
  series: { team: string; pts: P[] }[];
  project: (p: P) => { px: number; py: number };
  viewWidth: number;
  narrow: boolean;
  onHighlight: (team: string | null) => void;
  resetKey: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const stickyTeamRef = useRef<string | null>(null);
  const pointerRef = useRef<{ mx: number; my: number } | null>(null);
  const seriesRef = useRef(series);
  const projectRef = useRef(project);
  const narrowRef = useRef(narrow);
  const [hover, setHover] = useState<HoverPick<P> | null>(null);

  seriesRef.current = series;
  projectRef.current = project;
  narrowRef.current = narrow;

  const clearHover = useCallback(() => {
    setHover((prev) => (prev === null ? prev : null));
    if (stickyTeamRef.current !== null) {
      stickyTeamRef.current = null;
      onHighlight(null);
    }
  }, [onHighlight]);

  const clearPointer = useCallback(() => {
    pointerRef.current = null;
    clearHover();
  }, [clearHover]);

  const syncHover = useCallback(
    (mx: number, my: number) => {
      const chosen = pickHoverPoint(seriesRef.current, projectRef.current, mx, my, stickyTeamRef.current, narrowRef.current);
      if (chosen) {
        setHover((prev) =>
          prev && prev.team === chosen.team && prev.pt === chosen.pt && prev.px === chosen.px && prev.py === chosen.py
            ? prev
            : chosen,
        );
        if (stickyTeamRef.current !== chosen.team) {
          onHighlight(chosen.team);
        }
        stickyTeamRef.current = chosen.team;
      } else {
        clearHover();
      }
    },
    [onHighlight, clearHover],
  );

  useEffect(() => {
    clearPointer();
  }, [resetKey, clearPointer]);

  useEffect(() => {
    const pointer = pointerRef.current;
    if (pointer) syncHover(pointer.mx, pointer.my);
  }, [series, narrow, syncHover]);

  const onMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const scale = viewWidth / rect.width;
      const mx = (e.clientX - rect.left) * scale;
      const my = (e.clientY - rect.top) * scale;

      pointerRef.current = { mx, my };
      syncHover(mx, my);
    },
    [viewWidth, syncHover],
  );

  return { svgRef, hover, onMove, onLeave: clearPointer };
}
