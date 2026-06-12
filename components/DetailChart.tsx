"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CandlePayload, Candle } from "@/lib/candles";
import type { ChartPayload } from "@/lib/stats";
import { TEAM_COLORS, TEAM_FULL_NAMES } from "@/lib/teams";
import { chartGeometry, niceTicks, fmtRate, computeYDomain, type XAxis, type YAxis } from "./MarginChart";

type Point = {
  x: number;
  y: number;
  wp: number;
  smoothWp: number;
  inning: number;
  game: number | null;
  date: string;
  c: Candle;
  team: string;
};

type Series = {
  team: string;
  pts: Point[];
};

type Hover = {
  team: string;
  pt: Point;
  px: number;
  py: number;
};

const pct = (v: number) => `${v.toFixed(1).replace(/\.0$/, "")}%`;
const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

// Central moving average smoothing function (window size = 7)
function smoothSeries(arr: number[], windowSize = 7): number[] {
  if (arr.length <= windowSize) return arr;
  const out: number[] = [];
  const half = Math.floor(windowSize / 2);
  for (let i = 0; i < arr.length; i++) {
    let sum = 0;
    let count = 0;
    for (let w = -half; w <= half; w++) {
      const idx = i + w;
      if (idx >= 0 && idx < arr.length) {
        sum += arr[idx];
        count++;
      }
    }
    out.push(sum / count);
  }
  return out;
}

export function DetailChart({
  candles,
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
  candles: CandlePayload;
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
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const dates = candles.dates;

  // Team the pointer is currently "locked" onto, for sticky hover.
  const stickyTeamRef = useRef<string | null>(null);

  // Clear hover and highlights when axis/view toggles
  useEffect(() => {
    setHover(null);
    stickyTeamRef.current = null;
    onHighlight(null);
  }, [xAxis, yAxis, onHighlight]);

  const { W, narrow, M, H } = chartGeometry(width);
  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;
  const tickSize = narrow ? 11 : 12.5;

  const [rMin, rMax] = xRange;

  const visibleTeams = useMemo(
    () => candles.teams.filter((t) => !hidden.has(t)),
    [candles.teams, hidden],
  );

  const { yMin, yMax } = useMemo(
    () => computeYDomain(payload, visibleTeams, xAxis, yAxis, rMin, rMax),
    [payload, visibleTeams, xAxis, yAxis, rMin, rMax],
  );

  // Compute all series, mapping the plate appearance win-probabilities to the cumulative axis.
  const seriesList = useMemo(() => {
    const list: Series[] = [];

    for (const team of visibleTeams) {
      // 1. Precompute cumulative statistics before each game for this team
      const teamCandles = candles.byGame[team] ?? [];
      const cumulativeGame: { wins: number; losses: number; margin: number }[] = [];
      let wins = 0;
      let losses = 0;
      let margin = 0;
      for (let i = 0; i < teamCandles.length; i++) {
        cumulativeGame.push({ wins, losses, margin });
        const c = teamCandles[i];
        if (c.wpClose >= 99) {
          wins++;
          margin++;
        } else if (c.wpClose <= 1) {
          losses++;
          margin--;
        }
      }

      // Precompute cumulative statistics before each date for this team
      const teamDateCandles = candles.byDate[team] ?? [];
      const cumulativeDate: { wins: number; losses: number; margin: number }[] = [];
      wins = 0;
      losses = 0;
      margin = 0;
      for (let j = 0; j < candles.dates.length; j++) {
        cumulativeDate.push({ wins, losses, margin });
        const c = teamDateCandles[j];
        if (c) {
          const games = c.subGames ?? [c];
          for (const g of games) {
            if (g.wpClose >= 99) {
              wins++;
              margin++;
            } else if (g.wpClose <= 1) {
              losses++;
              margin--;
            }
          }
        }
      }

      // 2. Map win probability boundaries to target yAxis
      const pts: Point[] = [];
      if (xAxis === "game") {
        for (let i = 0; i < teamCandles.length; i++) {
          const c = teamCandles[i];
          const stats = cumulativeGame[i];
          const wins_prev = stats.wins;
          const losses_prev = stats.losses;
          const margin_prev = stats.margin;

          const isDecided = c.wpClose >= 99 || c.wpClose <= 1;
          const k = isDecided ? 1 : 0;
          const D = wins_prev + losses_prev + k;

          const mapPct = (pctValue: number) => {
            if (yAxis === "margin") {
              return margin_prev - k + (pctValue / 100) * (2 * k);
            } else {
              return D > 0 ? (wins_prev + k * (pctValue / 100)) / D : 0;
            }
          };

          const pCount = c.series.length;
          if (pCount >= 2) {
            const smoothed = smoothSeries(c.series, 7);
            for (let p = 0; p < pCount; p++) {
              const x = c.game - 1 + (p + 1) / pCount;
              if (x < rMin - 1 || x > rMax + 1) continue;

              const smoothWp = smoothed[p];
              const y = mapPct(smoothWp);

              pts.push({
                x,
                y,
                wp: c.series[p],
                smoothWp,
                inning: c.innings[p],
                game: c.game,
                date: c.date,
                c,
                team,
              });
            }
          } else {
            // Fallback for single outcome or empty series
            const x = c.game;
            if (x >= rMin - 1 && x <= rMax + 1) {
              const y = mapPct(c.wpClose);
              pts.push({
                x,
                y,
                wp: c.wpClose,
                smoothWp: c.wpClose,
                inning: 9,
                game: c.game,
                date: c.date,
                c,
                team,
              });
            }
          }
        }
      } else {
        teamDateCandles.forEach((c, j) => {
          const stats = cumulativeDate[j];
          const wins_prev = stats.wins;
          const losses_prev = stats.losses;
          const margin_prev = stats.margin;

          if (c) {
            const games = c.subGames ?? [c];
            const k = games.filter((g) => g.wpClose >= 99 || g.wpClose <= 1).length;
            const D = wins_prev + losses_prev + k;

            const mapPct = (pctValue: number) => {
              if (yAxis === "margin") {
                return margin_prev - k + (pctValue / 100) * (2 * k);
              } else {
                return D > 0 ? (wins_prev + k * (pctValue / 100)) / D : 0;
              }
            };

            // Merge doubleheader series
            const allWp = games.flatMap((g) => g.series);
            const allInns = games.flatMap((g) => g.innings);
            const pCount = allWp.length;

            if (pCount >= 2) {
              const smoothed = smoothSeries(allWp, 7);
              for (let p = 0; p < pCount; p++) {
                const x = j - 1 + (p + 1) / pCount;
                if (x < rMin - 1 || x > rMax + 1) continue;

                const smoothWp = smoothed[p];
                const y = mapPct(smoothWp);

                pts.push({
                  x,
                  y,
                  wp: allWp[p],
                  smoothWp,
                  inning: allInns[p],
                  game: null,
                  date: c.date,
                  c,
                  team,
                });
              }
            } else {
              const x = j;
              if (x >= rMin - 1 && x <= rMax + 1) {
                const y = mapPct(c.wpClose);
                pts.push({
                  x,
                  y,
                  wp: c.wpClose,
                  smoothWp: c.wpClose,
                  inning: 9,
                  game: null,
                  date: c.date,
                  c,
                  team,
                });
              }
            }
          } else {
            // Flat line for date with no game
            const x = j;
            if (x >= rMin - 1 && x <= rMax + 1) {
              const y = yAxis === "margin" ? margin_prev : wins_prev + losses_prev > 0 ? wins_prev / (wins_prev + losses_prev) : 0;
              // Find the last played game to attach metadata if needed
              let lastGameCandle = null;
              for (let idx = j - 1; idx >= 0; idx--) {
                if (teamDateCandles[idx]) {
                  lastGameCandle = teamDateCandles[idx];
                  break;
                }
              }
              if (lastGameCandle) {
                pts.push({
                  x,
                  y,
                  wp: lastGameCandle.wpClose,
                  smoothWp: lastGameCandle.wpClose,
                  inning: 9,
                  game: null,
                  date: dates[j],
                  c: lastGameCandle,
                  team,
                });
              }
            }
          }
        });
      }

      if (pts.length) {
        list.push({ team, pts });
      }
    }

    return list;
  }, [candles, visibleTeams, xAxis, yAxis, rMin, rMax, dates]);

  const xMin = rMin - 1;
  const xMax = rMax;
  const sx = (x: number) => M.left + ((x - xMin) / (xMax - xMin || 1)) * innerW;
  const sy = (y: number) => M.top + (1 - (y - yMin) / (yMax - yMin || 1)) * innerH;

  const yTicks = useMemo(
    () => (yAxis === "margin" ? niceTicks(yMin, yMax, 8).filter((t) => Number.isInteger(t)) : niceTicks(yMin, yMax, 6)),
    [yMin, yMax, yAxis],
  );

  const xTicks = useMemo(() => {
    if (xAxis === "game") {
      const targetCount = narrow ? 6 : 12;
      const count = rMax - rMin + 1;
      const ticks: number[] = [];
      if (count <= targetCount) {
        for (let g = rMin; g <= rMax; g++) ticks.push(g);
      } else {
        ticks.push(rMin);
        const step = (rMax - rMin) / (targetCount - 1);
        for (let i = 1; i < targetCount - 1; i++) {
          ticks.push(Math.round(rMin + i * step));
        }
        ticks.push(rMax);
      }
      return ticks.map((t) => ({ x: t, label: String(t) }));
    }
    const n = dates.length;
    if (n === 0) return [];
    const lo = Math.max(0, Math.ceil(xMin));
    const hi = Math.min(n - 1, Math.floor(xMax));
    const span = hi - lo;
    if (span <= 0) return [{ x: lo, label: md(dates[lo]) }];

    const targetCount = narrow ? 7 : 14;
    const ticks: number[] = [];
    if (span + 1 <= targetCount) {
      for (let i = lo; i <= hi; i++) ticks.push(i);
    } else {
      ticks.push(lo);
      const step = span / (targetCount - 1);
      for (let i = 1; i < targetCount - 1; i++) {
        ticks.push(Math.round(lo + i * step));
      }
      ticks.push(hi);
    }
    return ticks.map((t) => ({ x: t, label: md(dates[t]) }));
  }, [xAxis, rMin, rMax, xMin, xMax, dates, narrow]);

  const linePath = useCallback(
    (pts: Point[]) => pts.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(" "),
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

      const active = stickyTeamRef.current;
      let cur: Hover | null = null;
      let curDx = Infinity;
      let curD = Infinity;

      for (const s of seriesList) {
        const isActive = s.team === active;
        for (const p of s.pts) {
          const px = sx(p.x);
          const py = sy(p.y);

          const dx = px - mx;
          const dy = py - my;
          const d = dx * dx + dy * dy;

          if (d < bestD) {
            bestD = d;
            best = {
              team: s.team,
              pt: p,
              px,
              py,
            };
          }

          if (isActive) {
            const adx = Math.abs(dx);
            if (adx < curDx) {
              curDx = adx;
              curD = d;
              cur = {
                team: s.team,
                pt: p,
                px,
                py,
              };
            }
          }
        }
      }
      const hitR = narrow ? 46 : 62; // acquire radius
      // Keep the locked team unless another is clearly closer (hysteresis), and
      // drop it only once the pointer strays well past the line.
      const sticky = narrow ? 42 : 56;
      const dropR = hitR * 2.6;

      let chosen: Hover | null = null;
      if (cur && Math.sqrt(curD) <= dropR && Math.sqrt(curD) <= Math.sqrt(bestD) + sticky) {
        chosen = cur;
      } else if (best && bestD <= hitR * hitR) {
        chosen = best;
      }

      if (chosen) {
        setHover(chosen);
        stickyTeamRef.current = chosen.team;
        onHighlight(chosen.team);
      } else {
        setHover(null);
        stickyTeamRef.current = null;
        onHighlight(null);
      }
    },
    [seriesList, sx, sy, W, narrow, onHighlight],
  );

  const onLeave = useCallback(() => {
    setHover(null);
    stickyTeamRef.current = null;
    onHighlight(null);
  }, [onHighlight]);

  // Determine vertical shaded highlight interval for the hovered game/date
  const shadedInterval = useMemo<[number, number] | null>(() => {
    if (!hover) return null;
    if (xAxis === "game") {
      const g = hover.pt.game;
      if (g === null) return null;
      return [g - 1, g];
    } else {
      // Find date index
      const dateStr = hover.pt.date;
      const idx = dates.indexOf(dateStr);
      if (idx === -1) return null;
      return [idx - 1, idx];
    }
  }, [hover, xAxis, dates]);

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
        aria-label={`${candles.season} KBO 승리확률 상세차트`}
      >
        {yTicks.map((t) => {
          const y = sy(t);
          const isZero = yAxis === "margin" && t === 0;
          const isHalf = yAxis === "winRate" && Math.abs(t - 0.5) < 1e-9;
          const isHighlightLine = isZero || isHalf;
          return (
            <g key={`y${t}`}>
              <line
                x1={M.left}
                x2={W - M.right}
                y1={y}
                y2={y}
                stroke={isHighlightLine ? "rgba(244,194,13,0.35)" : "var(--color-line)"}
                strokeWidth={isHighlightLine ? 1.5 : 1}
                strokeDasharray={isHighlightLine ? "none" : "2 5"}
              />
              <text
                x={M.left - 8}
                y={y}
                textAnchor="end"
                dominantBaseline="central"
                className="tnum"
                fontFamily="var(--font-sans)"
                fontSize={tickSize}
                fill={isHighlightLine ? "var(--color-amber)" : "var(--color-muted)"}
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
            y={H - M.bottom + 24}
            textAnchor="middle"
            className="tnum"
            fontFamily="var(--font-sans)"
            fontSize={tickSize}
            fill="var(--color-muted)"
          >
            {t.label}
          </text>
        ))}

        {seriesList.map((s, idx) => {
          const color = TEAM_COLORS[s.team];
          const isHi = highlight === s.team;
          const dim = highlight != null && !isHi;
          const labelSize = narrow ? 10 : 11;

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
                strokeWidth={isHi ? 2.8 : 1.6}
                strokeLinejoin="round"
                strokeLinecap="round"
                pathLength={animate ? 1 : undefined}
                style={
                  animate
                    ? {
                        strokeDasharray: 1,
                        strokeDashoffset: 1,
                        animation: `draw 1.1s cubic-bezier(0.4,0,0.1,1) forwards`,
                        animationDelay: `${0.05 + idx * 0.04}s`,
                      }
                    : undefined
                }
              />
              {s.pts.length > 0 &&
                (() => {
                  // Find the last point within the visible x-range (x <= rMax)
                  let last = s.pts[s.pts.length - 1];
                  for (let pIdx = s.pts.length - 1; pIdx >= 0; pIdx--) {
                    if (s.pts[pIdx].x <= rMax) {
                      last = s.pts[pIdx];
                      break;
                    }
                  }
                  return (
                    <g
                      className={animate ? "animate-rise" : undefined}
                      style={animate ? { animationDelay: `${0.9 + idx * 0.04}s` } : undefined}
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

        {/* Highlight borders for the active range on hover */}
        {shadedInterval &&
          (() => {
            const xStartPx = sx(shadedInterval[0]);
            const xEndPx = sx(shadedInterval[1]);
            return (
              <>
                {/* Highlight borders for the active range */}
                <line
                  x1={xStartPx}
                  x2={xStartPx}
                  y1={M.top}
                  y2={H - M.bottom}
                  stroke="var(--color-line-strong)"
                  strokeWidth={1.5}
                  strokeDasharray="2 3"
                  className="pointer-events-none"
                />
                <line
                  x1={xEndPx}
                  x2={xEndPx}
                  y1={M.top}
                  y2={H - M.bottom}
                  stroke="var(--color-line-strong)"
                  strokeWidth={1.5}
                  strokeDasharray="2 3"
                  className="pointer-events-none"
                />
              </>
            );
          })()}

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

        {hover && (
          <circle
            cx={hover.px}
            cy={hover.py}
            r={4.5}
            fill={TEAM_COLORS[hover.team]}
            stroke="var(--color-ink)"
            strokeWidth={1.5}
          />
        )}
      </svg>

      {hover && (
        <CandleTooltip
          c={hover.pt.c}
          team={hover.team}
          color={TEAM_COLORS[hover.team]}
          left={(hover.px / W) * 100}
          top={(hover.py / H) * 100}
        />
      )}
    </div>
  );
}

// Sparkline inside tooltip (win probability 0-100%)
function Sparkline({ series, innings, color, bullish }: { series: number[]; innings: number[]; color: string; bullish: boolean }) {
  const W = 224;
  const H = 80;
  const P = { l: 4, r: 4, t: 6, b: 14 };
  const iw = W - P.l - P.r;
  const ih = H - P.t - P.b;
  const n = series.length;
  const sx = (i: number) => P.l + (n <= 1 ? 0 : (i / (n - 1)) * iw);
  const sy = (p: number) => P.t + (1 - p / 100) * ih;

  const path = series.map((p, i) => `${i === 0 ? "M" : "L"}${sx(i).toFixed(1)},${sy(p).toFixed(1)}`).join(" ");
  const area = `${path} L${sx(n - 1).toFixed(1)},${sy(0).toFixed(1)} L${sx(0).toFixed(1)},${sy(0).toFixed(1)} Z`;

  const bounds: { i: number; inn: number }[] = [];
  if (n > 0) {
    bounds.push({ i: 0, inn: innings[0] });
  }
  for (let i = 1; i < n; i++) if (innings[i] !== innings[i - 1]) bounds.push({ i, inn: innings[i] });

  const endColor = bullish ? "#f0584e" : "#4c8dff";
  const gid = `wpfill-${color.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      className="block"
    >
      <defs>
        <linearGradient
          id={gid}
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop
            offset="0%"
            stopColor={color}
            stopOpacity={0.28}
          />
          <stop
            offset="100%"
            stopColor={color}
            stopOpacity={0}
          />
        </linearGradient>
      </defs>

      {/* Inning separators */}
      {bounds.map((b) => (
        <g key={b.i}>
          {b.i > 0 && (
            <line
              x1={sx(b.i)}
              x2={sx(b.i)}
              y1={P.t}
              y2={P.t + ih}
              stroke="var(--color-line)"
              strokeWidth={1}
              strokeDasharray="1 3"
            />
          )}
          <text
            x={sx(b.i)}
            y={H - 2}
            textAnchor="middle"
            fontFamily="var(--font-sans)"
            fontSize={7.5}
            fill="var(--color-muted)"
          >
            {b.inn}
          </text>
        </g>
      ))}

      {/* 50% toss-up baseline */}
      <line
        x1={P.l}
        x2={P.l + iw}
        y1={sy(50)}
        y2={sy(50)}
        stroke="rgba(244,194,13,0.4)"
        strokeWidth={1}
        strokeDasharray="2 3"
      />

      <path
        d={area}
        fill={`url(#${gid})`}
      />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Final outcome dot */}
      <circle
        cx={sx(n - 1)}
        cy={sy(series[n - 1])}
        r={2.4}
        fill={endColor}
      />
    </svg>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span className="text-[11px] text-[var(--color-muted)]">{label}</span>
      <span
        className="tnum text-[12px] font-semibold"
        style={{ color: accent ?? "var(--color-fg)" }}
      >
        {value}
      </span>
    </div>
  );
}

function CandleTooltip({ c, team, color, left, top }: { c: Candle; team: string; color: string; left: number; top: number }) {
  const games = c.subGames ?? [c];
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({
    left: `${left}%`,
    top: `${top}%`,
    transform: "translate(-50%, calc(-100% - 14px))",
    opacity: 0,
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const parent = el.offsetParent as HTMLElement;
    if (!parent) return;

    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const pW = parent.clientWidth;
    const pH = parent.clientHeight;

    const targetX = (left / 100) * pW;
    const targetY = (top / 100) * pH;

    // Horizontally center, but clamp to parent bounds
    let posX = targetX - w / 2;
    posX = Math.max(4, Math.min(pW - w - 4, posX));

    // Vertically place above the point, flip below if it overflows the top
    let posY = targetY - h - 24;
    if (posY < 4) {
      posY = targetY + 24;
    }
    posY = Math.max(4, Math.min(pH - h - 4, posY));

    setStyle({
      left: `${posX}px`,
      top: `${posY}px`,
      opacity: 1,
    });
  }, [left, top]);

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute z-40 flex w-max flex-col gap-1 whitespace-nowrap rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-panel-2)]/95 px-3.5 py-2.5 backdrop-blur transition-opacity duration-100"
      style={style}
    >
      <div className="mb-0.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: color }}
          />
          <span className="text-[13px] font-semibold text-[var(--color-fg)]">{TEAM_FULL_NAMES[team]}</span>
          <span className="ml-1 text-[11px] text-[var(--color-muted)]">{c.date}</span>
        </div>
        {games.length === 1 && (
          <span
            className="text-[14px] font-bold"
            style={{
              color: games[0].wpClose >= 99 ? "#f0584e" : games[0].wpClose > 1 && games[0].wpClose < 99 ? "var(--color-muted)" : "#4c8dff",
            }}
          >
            {games[0].teamScore !== undefined &&
            games[0].teamScore !== null &&
            games[0].opponentScore !== undefined &&
            games[0].opponentScore !== null
              ? `${games[0].teamScore}:${games[0].opponentScore} ${games[0].wpClose >= 99 ? "승" : games[0].wpClose > 1 && games[0].wpClose < 99 ? "무" : "패"}`
              : `${games[0].game}경기 ${games[0].wpClose >= 99 ? "승" : games[0].wpClose > 1 && games[0].wpClose < 99 ? "무" : "패"}`}
          </span>
        )}
      </div>

      {games.map((g, idx) => {
        const won = g.wpClose >= 99;
        const draw = g.wpClose > 1 && g.wpClose < 99;
        const result = won ? "승" : draw ? "무" : "패";
        const resultColor = won ? "#f0584e" : draw ? "var(--color-muted)" : "#4c8dff";

        // Single game title defaults to "X경기", doubleheader defaults to "DH1", "DH2" etc.
        const title = games.length > 1 ? `DH${idx + 1}` : `${g.game}경기`;

        // Format: "12:8 승" or "DH1 12:8 승" if score is loaded; fall back to "50경기 승" if no score.
        const labelPrefix = games.length > 1 ? `DH${idx + 1} ` : "";
        const scoreText =
          g.teamScore !== undefined && g.teamScore !== null && g.opponentScore !== undefined && g.opponentScore !== null
            ? `${labelPrefix}${g.teamScore}:${g.opponentScore} ${result}`
            : `${title} ${result}`;

        return (
          <div
            key={idx}
            className={idx > 0 ? "mt-1.5 border-t border-[var(--color-line)] pt-1.5 flex flex-col gap-1" : "flex flex-col gap-1"}
          >
            {games.length > 1 && (
              <div className="flex items-center gap-1.5 mb-0.5">
                <span
                  className="text-[14px] font-bold"
                  style={{ color: resultColor }}
                >
                  {scoreText}
                </span>
              </div>
            )}

            {g.series.length >= 2 && (
              <div className="mb-1 -mx-0.5">
                <Sparkline
                  series={g.series}
                  innings={g.innings}
                  color={color}
                  bullish={g.bullish}
                />
              </div>
            )}
            <Row
              label="최고 승리확률"
              value={pct(g.wpHigh)}
              accent="#f0584e"
            />
            <Row
              label="최저 승리확률"
              value={pct(g.wpLow)}
              accent="#4c8dff"
            />
          </div>
        );
      })}
    </div>
  );
}
