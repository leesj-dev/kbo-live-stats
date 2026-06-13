"use client";

import { useCallback, useMemo } from "react";
import type { ChartPayload } from "@/lib/stats";
import { TEAM_COLORS, TEAM_FULL_NAMES } from "@/lib/teams";
import {
  buildXTicks,
  buildYTicks,
  chartGeometry,
  computeYDomain,
  fmtRate,
  fmtSigned,
  type XAxis,
  type YAxis,
} from "@/lib/chart";
import { ChartAxes, HoverMarker, SeriesEndLabel } from "./ChartElements";
import { useChartHover } from "./useChartHover";
import { useTooltipPosition } from "./useTooltipPosition";
import { useSmoothedDomain } from "./useSmoothedDomain";

type Pt = { x: number; y: number; date: string; game: number | null };
type Series = { team: string; pts: Pt[] };

export function MarginChart({
  payload,
  xAxis,
  yAxis,
  hidden,
  highlight,
  onHighlight,
  width,
  xRange,
  animate = true,
}: {
  payload: ChartPayload;
  xAxis: XAxis;
  yAxis: YAxis;
  hidden: Set<string>;
  highlight: string | null;
  onHighlight: (team: string | null) => void;
  width: number;
  xRange: [number, number];
  animate?: boolean;
}) {
  // Responsive coordinate system: W tracks the real container width (≈1 unit per
  // px) and the SVG scales via viewBox + height:auto, so there is no letterbox.
  const geo = chartGeometry(width);
  const { W, narrow, M, H } = geo;
  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;

  const [rMin, rMax] = xRange;

  const visibleTeams = useMemo(
    () => payload.teams.filter((t) => !hidden.has(t)),
    [payload.teams, hidden],
  );

  // Quantize rMax so yDomain only recalculates at integer boundaries.
  const rMaxCeil = Math.ceil(rMax);

  const rawDomain = useMemo(
    () => computeYDomain(payload, visibleTeams, xAxis, yAxis, rMin, rMaxCeil),
    [payload, visibleTeams, xAxis, yAxis, rMin, rMaxCeil],
  );
  const { yMin, yMax } = useSmoothedDomain(rawDomain, `${xAxis}:${yAxis}:${payload.season}`);

  const series = useMemo(() => {
    const out: Series[] = [];
    for (const team of visibleTeams) {
      // 1. Accumulate all candidate points
      const allPts: Pt[] = [];
      if (xAxis === "game") {
        for (const p of payload.byGame[team] ?? []) {
          const y = yAxis === "margin" ? p.margin : p.winRate;
          allPts.push({ x: p.game, y, date: p.date, game: p.game });
        }
      } else {
        const arr = payload.byDate[team] ?? [];
        arr.forEach((p, i) => {
          const v = yAxis === "margin" ? p.margin : p.winRate;
          if (v == null) return; // skip leading gap before first game
          allPts.push({ x: i, y: v, date: p.date, game: null });
        });
      }

      // 2. Filter and interpolate the last point to draw a continuous line to rMax
      const pts: Pt[] = [];
      for (const p of allPts) {
        if (p.x < rMin - 1) continue;
        if (p.x <= rMax) {
          pts.push(p);
        } else {
          // If the last added point exists, interpolate a point at rMax towards this next point
          const p1 = pts[pts.length - 1];
          if (p1 && rMax > p1.x) {
            const dx = p.x - p1.x;
            const pct = dx > 0 ? (rMax - p1.x) / dx : 0;
            const interpolatedY = p1.y + (p.y - p1.y) * pct;
            pts.push({
              x: rMax,
              y: interpolatedY,
              date: p.date,
              game: p.game,
            });
          }
          break; // Stop after interpolating the end point
        }
      }

      if (pts.length) out.push({ team, pts });
    }
    return out;
  }, [payload, visibleTeams, xAxis, yAxis, rMin, rMax]);

  const xMin = rMin - 1;
  const xMax = rMax;
  const sx = (x: number) => M.left + ((x - xMin) / (xMax - xMin || 1)) * innerW;
  const sy = (y: number) => M.top + (1 - (y - yMin) / (yMax - yMin || 1)) * innerH;

  const yTicks = useMemo(() => buildYTicks(yMin, yMax, yAxis), [yMin, yMax, yAxis]);
  const xTicks = useMemo(
    () => buildXTicks(xAxis, rMin, rMax, payload.dates, narrow),
    [xAxis, rMin, rMax, payload.dates, narrow],
  );

  const linePath = useCallback(
    (pts: Pt[]) => pts.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(" "),
    [sx, sy],
  );

  const { svgRef, hover, onMove, onLeave } = useChartHover<Pt>({
    series,
    project: (p) => ({ px: sx(p.x), py: sy(p.y) }),
    viewWidth: W,
    narrow,
    onHighlight,
    resetKey: `${xAxis}:${yAxis}`,
  });

  const { ref: tooltipRef, style: tooltipStyle } = useTooltipPosition(
    hover ? { vx: hover.px, vy: hover.py } : null,
    { W, H },
  );

  return (
    <div className="relative w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full select-none"
        style={{ height: "auto", touchAction: "none" }}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        role="img"
        aria-label={`${payload.season} KBO ${yAxis === "margin" ? "승패마진" : "승률"} ${xAxis === "game" ? "경기별" : "날짜별"} 추이`}
      >
        <ChartAxes
          geo={geo}
          sx={sx}
          sy={sy}
          yTicks={yTicks}
          xTicks={xTicks}
          yAxis={yAxis}
        />

        {series.map((s, i) => {
          const color = TEAM_COLORS[s.team];
          const isHi = highlight === s.team;
          const dim = highlight != null && !isHi;
          const last = s.pts[s.pts.length - 1];
          return (
            <g
              key={s.team}
              style={{ opacity: dim ? 0.18 : 1 }}
              className="transition-opacity duration-150"
            >
              <path
                d={linePath(s.pts)}
                fill="none"
                stroke={color}
                strokeWidth={isHi ? (narrow ? 2.4 : 3) : (narrow ? 1.4 : 1.9)}
                strokeLinejoin="round"
                strokeLinecap="round"
                pathLength={animate ? 1 : undefined}
                style={
                  animate
                    ? {
                        strokeDasharray: 1,
                        strokeDashoffset: 1,
                        animation: `draw 1.1s cubic-bezier(0.4,0,0.1,1) forwards`,
                        animationDelay: `${0.05 + i * 0.04}s`,
                      }
                    : undefined
                }
              />
              {last && (
                <SeriesEndLabel
                  x={sx(last.x)}
                  y={sy(last.y)}
                  color={color}
                  team={s.team}
                  highlighted={isHi}
                  narrow={narrow}
                  animate={animate}
                  delay={0.9 + i * 0.04}
                />
              )}
            </g>
          );
        })}

        {hover && (
          <HoverMarker
            px={hover.px}
            py={hover.py}
            color={TEAM_COLORS[hover.team]}
            geo={geo}
            r={5.5}
            strokeWidth={2}
          />
        )}
      </svg>

      {hover && (
        <div
          ref={tooltipRef}
          className="pointer-events-none absolute z-40 flex w-max flex-col items-center whitespace-nowrap rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-panel-2)]/95 px-4 py-2 text-center backdrop-blur transition-opacity duration-100"
          style={tooltipStyle}
        >
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: TEAM_COLORS[hover.team] }}
            />
            <span className="text-[13px] font-semibold text-[var(--color-fg)]">{TEAM_FULL_NAMES[hover.team]}</span>
          </div>
          <span className="mt-1.5 text-xl font-semibold leading-none text-[var(--color-fg)]">
            {yAxis === "margin" ? fmtSigned(hover.pt.y) : fmtRate(hover.pt.y)}
          </span>
          <span className="mt-1.5 text-[11px] text-[var(--color-muted)]">
            {hover.pt.game != null ? `${hover.pt.game}경기 · ` : ""}
            {hover.pt.date}
          </span>
        </div>
      )}
    </div>
  );
}
