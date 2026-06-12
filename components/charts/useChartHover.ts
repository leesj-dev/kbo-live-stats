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
  const [hover, setHover] = useState<HoverPick<P> | null>(null);

  const clear = useCallback(() => {
    setHover(null);
    stickyTeamRef.current = null;
    onHighlight(null);
  }, [onHighlight]);

  useEffect(() => {
    clear();
  }, [resetKey, clear]);

  const onMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const scale = viewWidth / rect.width;
      const mx = (e.clientX - rect.left) * scale;
      const my = (e.clientY - rect.top) * scale;

      const chosen = pickHoverPoint(series, project, mx, my, stickyTeamRef.current, narrow);
      if (chosen) {
        setHover(chosen);
        stickyTeamRef.current = chosen.team;
        onHighlight(chosen.team);
      } else {
        clear();
      }
    },
    [series, project, viewWidth, narrow, onHighlight, clear],
  );

  return { svgRef, hover, onMove, onLeave: clear };
}
