"use client";

import { useCallback, useMemo } from "react";
import { candleOutcome, type Candle, type CandlePayload } from "@/lib/candles";
import type { ChartPayload } from "@/lib/stats";
import { TEAM_COLORS } from "@/lib/teams";
import { buildXTicks, buildYTicks, chartGeometry, computeYDomain, type XAxis, type YAxis } from "@/lib/chart";
import { ChartAxes, HoverMarker, SeriesEndLabel } from "./ChartElements";
import { CandleTooltip } from "./CandleTooltip";
import { useChartHover } from "./useChartHover";
import { useSmoothedDomain } from "./useSmoothedDomain";

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

// Central moving average smoothing function (window size = 11)
function smoothSeries(arr: number[], windowSize = 11): number[] {
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

// Cumulative wins/losses/margin accumulated while walking a team's games.
type CumState = { wins: number; losses: number; margin: number };

function applyOutcome(state: CumState, wpClose: number) {
  const outcome = candleOutcome(wpClose);
  if (outcome === "w") {
    state.wins++;
    state.margin++;
  } else if (outcome === "l") {
    state.losses++;
    state.margin--;
  }
}

// Append one slot's worth of points (a game on the game axis, a date — possibly
// a doubleheader — on the date axis). The win-probability percentages are mapped
// onto the cumulative y-axis: with `k` decided games in the slot and the team at
// `prev` beforehand, 100% counts all k as wins, 0% as losses, linear in between.
function appendCandlePoints(opts: {
  pts: Point[];
  team: string;
  candle: Candle; // tooltip anchor (the combined candle on the date axis)
  games: Candle[]; // sub-games making up this slot
  xStart: number; // left edge of the slot
  gameNo: number | null;
  prev: CumState; // cumulative state before this slot — read before mutating
  yAxis: YAxis;
  rMin: number;
  rMax: number;
  maxPtsPerSlot: number; // cap on points emitted per slot (≈ 1 per pixel)
}) {
  const { pts, team, candle, games, xStart, gameNo, prev, yAxis, rMin, rMax, maxPtsPerSlot } = opts;

  const k = games.filter((g) => candleOutcome(g.wpClose) !== "d").length;
  const decided = prev.wins + prev.losses + k;
  const mapPct = (pctValue: number) =>
    yAxis === "margin" ? prev.margin - k + (pctValue / 100) * (2 * k) : decided > 0 ? (prev.wins + k * (pctValue / 100)) / decided : 0;

  // Merge doubleheader series into one path across the slot.
  const allWp = games.flatMap((g) => g.series);
  const allInnings = games.flatMap((g) => g.innings);
  const n = allWp.length;

  if (n >= 2) {
    const smoothed = smoothSeries(allWp, 11);
    // Decimate to roughly screen resolution. A smoothed line needs at most ~1
    // vertex per horizontal pixel, but a per-pitch series packs 100+ samples
    // into a slot that may be only a few pixels wide. Keeping the original
    // density made the total vertex count grow with the visible range, so
    // playback got progressively heavier (the late-segment stutter). Capping
    // per-slot points keeps the total ≈ chart width regardless of zoom, with
    // no visible change — and zooming in raises the cap so detail returns.
    const keep = Math.min(n, Math.max(2, maxPtsPerSlot));
    for (let i = 0; i < keep; i++) {
      const p = keep === n ? i : Math.round((i * (n - 1)) / (keep - 1));
      const x = xStart + (p + 1) / n;
      if (x < rMin - 1 || x > rMax + 1) continue;
      pts.push({
        x,
        y: mapPct(smoothed[p]),
        wp: allWp[p],
        smoothWp: smoothed[p],
        inning: allInnings[p],
        game: gameNo,
        date: candle.date,
        c: candle,
        team,
      });
    }
  } else {
    // Fallback for an empty or single-point series: one point at the slot end.
    const x = xStart + 1;
    if (x >= rMin - 1 && x <= rMax + 1) {
      pts.push({
        x,
        y: mapPct(candle.wpClose),
        wp: candle.wpClose,
        smoothWp: candle.wpClose,
        inning: 9,
        game: gameNo,
        date: candle.date,
        c: candle,
        team,
      });
    }
  }
}

function buildSeriesList(
  candles: CandlePayload,
  visibleTeams: string[],
  xAxis: XAxis,
  yAxis: YAxis,
  rMin: number,
  rMax: number,
  maxPtsPerSlot: number,
): Series[] {
  const list: Series[] = [];

  for (const team of visibleTeams) {
    const pts: Point[] = [];
    const cum: CumState = { wins: 0, losses: 0, margin: 0 };

    if (xAxis === "game") {
      for (const c of candles.byGame[team] ?? []) {
        appendCandlePoints({
          pts,
          team,
          candle: c,
          games: [c],
          xStart: c.game - 1,
          gameNo: c.game,
          prev: cum,
          yAxis,
          rMin,
          rMax,
          maxPtsPerSlot,
        });
        applyOutcome(cum, c.wpClose);
      }
    } else {
      let lastPlayed: Candle | null = null;
      (candles.byDate[team] ?? []).forEach((c, j) => {
        if (c) {
          const games = c.subGames ?? [c];
          appendCandlePoints({
            pts,
            team,
            candle: c,
            games,
            xStart: j - 1,
            gameNo: null,
            prev: cum,
            yAxis,
            rMin,
            rMax,
            maxPtsPerSlot,
          });
          for (const g of games) applyOutcome(cum, g.wpClose);
          lastPlayed = c;
        } else if (lastPlayed && j >= rMin - 1 && j <= rMax + 1) {
          // Flat carry-over point for a day without a game, anchored to the
          // last played candle so the tooltip still has something to show.
          const decided = cum.wins + cum.losses;
          pts.push({
            x: j,
            y: yAxis === "margin" ? cum.margin : decided > 0 ? cum.wins / decided : 0,
            wp: lastPlayed.wpClose,
            smoothWp: lastPlayed.wpClose,
            inning: 9,
            game: null,
            date: candles.dates[j],
            c: lastPlayed,
            team,
          });
        }
      });
    }

    if (pts.length) {
      list.push({ team, pts });
    }
  }

  return list;
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
  const dates = candles.dates;

  const geo = chartGeometry(width);
  const { W, narrow, M, H } = geo;
  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;

  const [rMin, rMax] = xRange;

  const visibleTeams = useMemo(() => candles.teams.filter((t) => !hidden.has(t)), [candles.teams, hidden]);

  // Quantize rMax to the next integer for expensive computations so they only
  // recalculate when crossing a game/date boundary, not 60× per second.
  // The actual float rMax is still used for x-axis scaling and line clipping.
  const rMaxCeil = Math.ceil(rMax);

  // The y-domain follows the line chart's data so both modes share a scale.
  const rawDomain = useMemo(
    () => computeYDomain(payload, visibleTeams, xAxis, yAxis, rMin, rMaxCeil),
    [payload, visibleTeams, xAxis, yAxis, rMin, rMaxCeil],
  );
  const { yMin, yMax } = useSmoothedDomain(rawDomain, `${xAxis}:${yAxis}:${payload.season}`);

  // Cap points per slot to ~1 per horizontal pixel. The visible span widens as
  // playback advances, so this keeps the total vertex count roughly constant
  // (≈ chart width) instead of growing with the accumulated per-pitch samples.
  const visibleSpan = Math.max(1, rMaxCeil - (rMin - 1));
  const maxPtsPerSlot = Math.max(2, Math.ceil(innerW / visibleSpan));

  const seriesList = useMemo(
    () => buildSeriesList(candles, visibleTeams, xAxis, yAxis, rMin, rMaxCeil, maxPtsPerSlot),
    [candles, visibleTeams, xAxis, yAxis, rMin, rMaxCeil, maxPtsPerSlot],
  );

  const xMin = rMin - 1;
  const xMax = rMax; // stable integer scale — no sub-frame coordinate jitter
  const sx = (x: number) => M.left + ((x - xMin) / (xMax - xMin || 1)) * innerW;
  const sy = (y: number) => M.top + (1 - (y - yMin) / (yMax - yMin || 1)) * innerH;

  const yTicks = useMemo(() => buildYTicks(yMin, yMax, yAxis), [yMin, yMax, yAxis]);
  const xTicks = useMemo(() => buildXTicks(xAxis, rMin, rMax, dates, narrow), [xAxis, rMin, rMax, dates, narrow]);

  // Clip a series to the (continuous) rMax. Rather than stopping at the last
  // data point ≤ rMax, we interpolate an endpoint exactly at rMax. On the date
  // axis a rest day contributes only a single point per slot, so without this
  // the line would freeze for a whole date unit and then jump when rMax crosses
  // the next point. Interpolating keeps the line (and end label) advancing
  // smoothly during playback. Returns the path and its interpolated endpoint.
  const clipSeries = useCallback(
    (pts: Point[]): { d: string; ex: number; ey: number } | null => {
      const cmds: string[] = [];
      let ex = NaN;
      let ey = NaN;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (p.x <= rMax) {
          cmds.push(`${cmds.length === 0 ? "M" : "L"}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`);
          ex = p.x;
          ey = p.y;
        } else {
          const prev = pts[i - 1];
          if (prev && p.x !== prev.x) {
            const t = (rMax - prev.x) / (p.x - prev.x);
            ex = rMax;
            ey = prev.y + (p.y - prev.y) * t;
            cmds.push(`L${sx(ex).toFixed(1)} ${sy(ey).toFixed(1)}`);
          }
          break;
        }
      }
      if (cmds.length === 0) return null;
      return { d: cmds.join(" "), ex, ey };
    },
    [sx, sy, rMax],
  );

  const { svgRef, hover, onMove, onLeave } = useChartHover<Point>({
    series: seriesList,
    project: (p) => ({ px: sx(p.x), py: sy(p.y) }),
    viewWidth: W,
    narrow,
    onHighlight,
    resetKey: `${xAxis}:${yAxis}`,
  });

  // Vertical shaded highlight interval for the hovered game/date.
  const shadedInterval = useMemo<[number, number] | null>(() => {
    if (!hover) return null;
    if (xAxis === "game") {
      const g = hover.pt.game;
      return g === null ? null : [g - 1, g];
    }
    const idx = dates.indexOf(hover.pt.date);
    return idx === -1 ? null : [idx - 1, idx];
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
        <ChartAxes
          geo={geo}
          sx={sx}
          sy={sy}
          yTicks={yTicks}
          xTicks={xTicks}
          yAxis={yAxis}
        />

        {seriesList.map((s, idx) => {
          const color = TEAM_COLORS[s.team];
          const isHi = highlight === s.team;
          const dim = highlight != null && !isHi;

          // Path clipped to the continuous rMax, with an interpolated endpoint
          // so the line and its end label track smoothly during playback.
          const clipped = clipSeries(s.pts);
          if (!clipped) return null;

          return (
            <g
              key={s.team}
              style={{ opacity: dim ? 0.18 : 1 }}
              className="transition-opacity duration-150"
            >
              <path
                d={clipped.d}
                fill="none"
                stroke={color}
                strokeWidth={isHi ? (narrow ? 2.2 : 2.8) : narrow ? 1.2 : 1.6}
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
              <SeriesEndLabel
                x={sx(clipped.ex)}
                y={sy(clipped.ey)}
                color={color}
                team={s.team}
                highlighted={isHi}
                narrow={narrow}
                animate={animate}
                delay={0.9 + idx * 0.04}
              />
            </g>
          );
        })}

        {/* Dashed borders marking the hovered game/date slot */}
        {shadedInterval &&
          shadedInterval.map((xVal, i) => (
            <line
              key={i}
              x1={sx(xVal)}
              x2={sx(xVal)}
              y1={M.top}
              y2={H - M.bottom}
              stroke="var(--color-line-strong)"
              strokeWidth={1.5}
              strokeDasharray="2 3"
              className="pointer-events-none"
            />
          ))}

        {hover && (
          <HoverMarker
            px={hover.px}
            py={hover.py}
            color={TEAM_COLORS[hover.team]}
            geo={geo}
            r={4.5}
            strokeWidth={1.5}
          />
        )}
      </svg>

      {hover && (
        <CandleTooltip
          c={hover.pt.c}
          team={hover.team}
          color={TEAM_COLORS[hover.team]}
          point={{ vx: hover.px, vy: hover.py }}
          view={{ W, H }}
        />
      )}
    </div>
  );
}
