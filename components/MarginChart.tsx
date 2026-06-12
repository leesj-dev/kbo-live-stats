"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChartPayload } from "@/lib/stats";
import { TEAM_COLORS, TEAM_FULL_NAMES } from "@/lib/teams";

export type XAxis = "date" | "game";
export type YAxis = "margin" | "winRate";

type Pt = { x: number; y: number; date: string; game: number | null };
type Series = { team: string; pts: Pt[] };

type Hover = {
  team: string;
  px: number;
  py: number;
  date: string;
  game: number | null;
  value: number;
};

function niceTicks(min: number, max: number, count: number): number[] {
  const span = max - min || 1;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + 1e-9; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

const fmtRate = (v: number) => v.toFixed(3).replace(/^0/, "");
const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

// Shared so the range slider can align its track exactly to the plot area
// (left edge = y-axis, right edge = line ends).
export function chartGeometry(width: number) {
  const W = Math.max(width, 300);
  const narrow = W < 520;
  // Left and right kept equal so the plot (and the slider aligned to it) is
  // symmetric; the left side still fits the widest y-axis label (e.g. "+50").
  const M = {
    top: 22,
    right: narrow ? 34 : 40,
    bottom: 32,
    left: narrow ? 34 : 40,
  };
  const H = Math.min(540, Math.max(346, Math.round(W * (narrow ? 0.96 : 0.58))));
  return { W, narrow, M, H };
}

export function MarginChart({
  payload,
  xAxis,
  yAxis,
  hidden,
  highlight,
  onHighlight,
  width,
  xRange,
}: {
  payload: ChartPayload;
  xAxis: XAxis;
  yAxis: YAxis;
  hidden: Set<string>;
  highlight: string | null;
  onHighlight: (team: string | null) => void;
  width: number;
  xRange: [number, number];
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);

  // A hover captured under the previous axes is meaningless after a toggle —
  // clear it (and the highlight) so the tooltip never shows stale values.
  useEffect(() => {
    setHover(null);
    onHighlight(null);
  }, [xAxis, yAxis, onHighlight]);

  // Responsive coordinate system: W tracks the real container width (≈1 unit per
  // px) and the SVG scales via viewBox + height:auto, so there is no letterbox.
  const { W, narrow, M, H } = chartGeometry(width);
  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;
  const labelSize = narrow ? 10 : 11;
  const tickSize = narrow ? 11 : 12.5;

  const visibleTeams = payload.teams.filter((t) => !hidden.has(t));

  const [rMin, rMax] = xRange;

  // Series clipped to the selected x-window; the y-domain auto-fits to whatever
  // is visible so narrowing the range rescales vertically and stays readable.
  const { series, yMin, yMax } = useMemo(() => {
    const out: Series[] = [];
    let yLo = Infinity;
    let yHi = -Infinity;

    for (const team of visibleTeams) {
      const pts: Pt[] = [];
      if (xAxis === "game") {
        for (const p of payload.byGame[team] ?? []) {
          if (p.game < rMin || p.game > rMax) continue;
          const y = yAxis === "margin" ? p.margin : p.winRate;
          pts.push({ x: p.game, y, date: p.date, game: p.game });
          if (y < yLo) yLo = y;
          if (y > yHi) yHi = y;
        }
      } else {
        const arr = payload.byDate[team] ?? [];
        arr.forEach((p, i) => {
          if (i < rMin || i > rMax) return;
          const v = yAxis === "margin" ? p.margin : p.winRate;
          if (v == null) return; // skip leading gap before first game
          pts.push({ x: i, y: v, date: p.date, game: null });
          if (v < yLo) yLo = v;
          if (v > yHi) yHi = v;
        });
      }
      if (pts.length) out.push({ team, pts });
    }

    if (!isFinite(yLo)) {
      yLo = yAxis === "margin" ? -1 : 0;
      yHi = 1;
    }
    if (yAxis === "margin") {
      const m = Math.max(Math.abs(yLo), Math.abs(yHi), 4);
      const pad = Math.ceil(m * 0.08) + 1;
      yLo = -m - pad;
      yHi = m + pad;
    } else {
      const pad = Math.max((yHi - yLo) * 0.12, 0.02);
      yLo = Math.max(0, yLo - pad);
      yHi = Math.min(1, yHi + pad);
    }
    return { series: out, yMin: yLo, yMax: yHi };
  }, [payload, visibleTeams, xAxis, yAxis, rMin, rMax]);

  const xMin = rMin;
  const xMax = rMax;
  const sx = (x: number) => M.left + ((x - xMin) / (xMax - xMin || 1)) * innerW;
  const sy = (y: number) => M.top + (1 - (y - yMin) / (yMax - yMin || 1)) * innerH;

  const yTicks = useMemo(
    () => (yAxis === "margin" ? niceTicks(yMin, yMax, 8).filter((t) => Number.isInteger(t)) : niceTicks(yMin, yMax, 6)),
    [yMin, yMax, yAxis],
  );

  const xTicks = useMemo(() => {
    if (xAxis === "game") {
      const ticks = niceTicks(xMin, xMax, narrow ? 5 : 8).filter((t) => t >= xMin && t <= xMax);
      return ticks.map((t) => ({ x: t, label: String(t) }));
    }
    const n = payload.dates.length;
    if (n === 0) return [];
    const lo = Math.max(0, Math.ceil(xMin));
    const hi = Math.min(n - 1, Math.floor(xMax));
    const span = hi - lo;
    if (span <= 0) return [{ x: lo, label: md(payload.dates[lo]) }];
    const target = Math.min(narrow ? 7 : 14, span + 1);
    const stepIdx = Math.max(1, Math.round(span / target));
    const ticks: { x: number; label: string }[] = [];
    for (let i = lo; i <= hi; i += stepIdx) ticks.push({ x: i, label: md(payload.dates[i]) });
    return ticks;
  }, [xAxis, xMin, xMax, payload.dates, narrow]);

  const linePath = useCallback(
    (pts: Pt[]) => pts.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(" "),
    [sx, sy],
  );

  const onMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const scale = W / rect.width;
      const mx = (e.clientX - rect.left) * scale;
      const my = (e.clientY - rect.top) * scale;

      let best: Hover | null = null;
      let bestD = Infinity;
      for (const s of series) {
        for (const p of s.pts) {
          const px = sx(p.x);
          const py = sy(p.y);
          const d = (px - mx) ** 2 + (py - my) ** 2;
          if (d < bestD) {
            bestD = d;
            best = { team: s.team, px, py, date: p.date, game: p.game, value: p.y };
          }
        }
      }
      const hitR = narrow ? 44 : 60;
      if (best && bestD < hitR * hitR) {
        setHover(best);
        onHighlight(best.team);
      } else {
        setHover(null);
        onHighlight(null);
      }
    },
    [series, sx, sy, W, narrow, onHighlight],
  );

  const onLeave = useCallback(() => {
    setHover(null);
    onHighlight(null);
  }, [onHighlight]);

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
        {yTicks.map((t) => {
          const y = sy(t);
          const isZero = yAxis === "margin" && t === 0;
          return (
            <g key={`y${t}`}>
              <line
                x1={M.left}
                x2={W - M.right}
                y1={y}
                y2={y}
                stroke={isZero ? "rgba(244,194,13,0.35)" : "var(--color-line)"}
                strokeWidth={isZero ? 1.5 : 1}
                strokeDasharray={isZero ? "none" : "2 5"}
              />
              <text
                x={M.left - 8}
                y={y}
                textAnchor="end"
                dominantBaseline="central"
                className="tnum"
                fontFamily="var(--font-sans)"
                fontSize={tickSize}
                fill={isZero ? "var(--color-amber)" : "var(--color-muted)"}
              >
                {yAxis === "margin" ? (t > 0 ? `+${t}` : t) : fmtRate(t)}
              </text>
            </g>
          );
        })}

        {xTicks.map((t, i) => (
          <text
            key={`x${i}`}
            x={sx(t.x)}
            y={H - M.bottom + 17}
            textAnchor="middle"
            className="tnum"
            fontFamily="var(--font-sans)"
            fontSize={tickSize}
            fill="var(--color-muted)"
          >
            {t.label}
          </text>
        ))}

        {hover && (
          <line
            x1={hover.px}
            x2={hover.px}
            y1={M.top}
            y2={H - M.bottom}
            stroke="var(--color-line-strong)"
            strokeWidth={1}
          />
        )}

        {series.map((s, i) => {
          const color = TEAM_COLORS[s.team];
          const isHi = highlight === s.team;
          const dim = highlight != null && !isHi;
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
                strokeWidth={isHi ? 3 : 1.9}
                strokeLinejoin="round"
                strokeLinecap="round"
                pathLength={1}
                style={{
                  strokeDasharray: 1,
                  strokeDashoffset: 1,
                  animation: `draw 1.1s cubic-bezier(0.4,0,0.1,1) forwards`,
                  animationDelay: `${0.05 + i * 0.04}s`,
                }}
              />
              {s.pts.length > 0 &&
                (() => {
                  const last = s.pts[s.pts.length - 1];
                  return (
                    <g
                      className="animate-rise"
                      style={{ animationDelay: `${0.9 + i * 0.04}s` }}
                    >
                      <circle
                        cx={sx(last.x)}
                        cy={sy(last.y)}
                        r={isHi ? 4 : 3}
                        fill={color}
                      />
                      <text
                        x={sx(last.x) + 7}
                        y={sy(last.y)}
                        dominantBaseline="central"
                        fontFamily="var(--font-sans)"
                        fontSize={labelSize}
                        fontWeight={isHi ? 600 : 500}
                        fill={color}
                      >
                        {s.team}
                      </text>
                    </g>
                  );
                })()}
            </g>
          );
        })}

        {hover && (
          <circle
            cx={hover.px}
            cy={hover.py}
            r={5.5}
            fill={TEAM_COLORS[hover.team]}
            stroke="var(--color-ink)"
            strokeWidth={2}
          />
        )}
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute z-10 flex w-max flex-col items-center whitespace-nowrap rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-panel-2)]/95 px-4 py-2 text-center backdrop-blur"
          style={{
            left: `${(hover.px / W) * 100}%`,
            top: `${(hover.py / H) * 100}%`,
            transform: `translate(-50%, calc(-100% - 14px))`,
          }}
        >
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: TEAM_COLORS[hover.team] }}
            />
            <span className="text-[13px] font-semibold text-[var(--color-fg)]">{TEAM_FULL_NAMES[hover.team]}</span>
          </div>
          <span className="mt-1.5 text-xl font-semibold leading-none text-[var(--color-fg)]">
            {yAxis === "margin" ? (hover.value > 0 ? `+${hover.value}` : hover.value) : fmtRate(hover.value)}
          </span>
          <span className="mt-1.5 text-[11px] text-[var(--color-muted)]">
            {hover.game != null ? `${hover.game}경기 · ` : ""}
            {hover.date}
          </span>
        </div>
      )}
    </div>
  );
}
