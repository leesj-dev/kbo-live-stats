// Pure chart math and formatting shared by MarginChart and DetailChart.
// Everything here is framework-free; React-specific pieces (hover/tooltip
// hooks) live in components/charts.

import type { ChartPayload } from "./stats";

export type XAxis = "date" | "game";
export type YAxis = "margin" | "winRate";

// Result accents shared across charts and the standings sidebar.
export const WIN_COLOR = "#f0584e"; // 승 (red)
export const LOSS_COLOR = "#4c8dff"; // 패 (blue)
export const POSITIVE_COLOR = "#5ad19a"; // above .500 / positive margin
export const NEGATIVE_COLOR = "#f0746e"; // below .500 / negative margin
export const NEUTRAL_COLOR = "var(--color-muted)";

// ".XXX" win-rate formatting (e.g. 0.625 → ".625").
export const fmtRate = (v: number) => v.toFixed(3).replace(/^0/, "");

// Signed margin formatting (e.g. 3 → "+3").
export const fmtSigned = (v: number) => (v > 0 ? `+${v}` : String(v));

// "2025-04-05" → "4/5"
export const fmtMonthDay = (iso: string) =>
  `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

export const fmtYTick = (t: number, yAxis: YAxis) =>
  yAxis === "margin" ? fmtSigned(t) : fmtRate(t);

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

export type ChartGeometry = ReturnType<typeof chartGeometry>;

export function niceTicks(min: number, max: number, count: number): number[] {
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

// Margin ticks must land on whole games; win rate gets the plain nice scale.
export function buildYTicks(yMin: number, yMax: number, yAxis: YAxis): number[] {
  return yAxis === "margin"
    ? niceTicks(yMin, yMax, 8).filter((t) => Number.isInteger(t))
    : niceTicks(yMin, yMax, 6);
}

export type XTick = { x: number; label: string };

// Evenly spread integer ticks across [lo, hi], always including both ends.
function spreadTicks(lo: number, hi: number, targetCount: number): number[] {
  if (hi - lo + 1 <= targetCount) {
    const all: number[] = [];
    for (let v = lo; v <= hi; v++) all.push(v);
    return all;
  }
  const ticks = [lo];
  const step = (hi - lo) / (targetCount - 1);
  for (let i = 1; i < targetCount - 1; i++) ticks.push(Math.round(lo + i * step));
  ticks.push(hi);
  return ticks;
}

// X-axis ticks for the current zoom range: game numbers on the game axis,
// "M/D" date labels (indexes into `dates`) on the date axis.
export function buildXTicks(
  xAxis: XAxis,
  rMin: number,
  rMax: number,
  dates: string[],
  narrow: boolean,
): XTick[] {
  if (xAxis === "game") {
    return spreadTicks(rMin, rMax, narrow ? 6 : 12).map((t) => ({ x: t, label: String(t) }));
  }
  const n = dates.length;
  if (n === 0) return [];
  const lo = Math.max(0, Math.ceil(rMin - 1));
  const hi = Math.min(n - 1, Math.floor(rMax));
  if (hi <= lo) return [{ x: lo, label: fmtMonthDay(dates[lo]) }];
  return spreadTicks(lo, hi, narrow ? 7 : 14).map((t) => ({ x: t, label: fmtMonthDay(dates[t]) }));
}

// Y-axis domain over the visible teams within the zoom range. Both axes hug the
// data range (margin is NOT pinned symmetric around zero, so there is no empty
// band when teams cluster on one side); win-rate stays inside [0, 1].
export function computeYDomain(
  payload: ChartPayload,
  visibleTeams: string[],
  xAxis: XAxis,
  yAxis: YAxis,
  rMin: number,
  rMax: number,
): { yMin: number; yMax: number } {
  let yLo = Infinity;
  let yHi = -Infinity;

  for (const team of visibleTeams) {
    if (xAxis === "game") {
      for (const p of payload.byGame[team] ?? []) {
        if (p.game < rMin || p.game > rMax) continue;
        const y = yAxis === "margin" ? p.margin : p.winRate;
        if (y < yLo) yLo = y;
        if (y > yHi) yHi = y;
      }
    } else {
      const arr = payload.byDate[team] ?? [];
      arr.forEach((p, i) => {
        if (i < rMin || i > rMax) return;
        const v = yAxis === "margin" ? p.margin : p.winRate;
        if (v == null) return;
        if (v < yLo) yLo = v;
        if (v > yHi) yHi = v;
      });
    }
  }

  if (!isFinite(yLo)) {
    yLo = yAxis === "margin" ? -1 : 0;
    yHi = 1;
  }
  if (yAxis === "margin") {
    const pad = Math.max(Math.ceil((yHi - yLo) * 0.12), 1);
    yLo -= pad;
    yHi += pad;
    // Guarantee a minimum visible span so a tightly-bunched field isn't a flat line.
    const minSpan = 8;
    if (yHi - yLo < minSpan) {
      const c = (yLo + yHi) / 2;
      yLo = c - minSpan / 2;
      yHi = c + minSpan / 2;
    }
  } else {
    const pad = Math.max((yHi - yLo) * 0.12, 0.02);
    yLo = Math.max(0, yLo - pad);
    yHi = Math.min(1, yHi + pad);
  }
  return { yMin: yLo, yMax: yHi };
}

export type HoverPick<P> = { team: string; pt: P; px: number; py: number };

// Nearest-point hit testing with sticky hysteresis: the previously locked team
// keeps the hover unless another line is clearly closer, and only loses it once
// the pointer strays well past the line. Coordinates are SVG viewBox units.
export function pickHoverPoint<P>(
  series: { team: string; pts: P[] }[],
  project: (p: P) => { px: number; py: number },
  mx: number,
  my: number,
  stickyTeam: string | null,
  narrow: boolean,
): HoverPick<P> | null {
  let best: HoverPick<P> | null = null;
  let bestD = Infinity;

  let cur: HoverPick<P> | null = null;
  let curDx = Infinity;
  let curD = Infinity;

  for (const s of series) {
    const isActive = s.team === stickyTeam;
    for (const p of s.pts) {
      const { px, py } = project(p);
      const dx = px - mx;
      const dy = py - my;
      const d = dx * dx + dy * dy;

      if (d < bestD) {
        bestD = d;
        best = { team: s.team, pt: p, px, py };
      }

      if (isActive) {
        const adx = Math.abs(dx);
        if (adx < curDx) {
          curDx = adx;
          curD = d;
          cur = { team: s.team, pt: p, px, py };
        }
      }
    }
  }

  const hitR = narrow ? 46 : 62; // acquire radius
  const sticky = narrow ? 42 : 56;
  const dropR = hitR * 2.6;

  if (cur && Math.sqrt(curD) <= dropR && Math.sqrt(curD) <= Math.sqrt(bestD) + sticky) {
    return cur;
  }
  if (best && bestD <= hitR * hitR) return best;
  return null;
}
