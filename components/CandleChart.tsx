"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CandlePayload, Candle } from "@/lib/candles";
import { TEAM_COLORS, TEAM_FULL_NAMES } from "@/lib/teams";
import { chartGeometry, type XAxis } from "./MarginChart";

// Korean stock-chart convention: 양봉(상승=승) red, 음봉(하락=패) blue.
const UP = "#f0584e"; // bullish — team won
const DOWN = "#4c8dff"; // bearish — team lost

type Plotted = { c: Candle; xi: number };
type Hover = { c: Candle; px: number };

const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
const pct = (v: number) => `${v.toFixed(1).replace(/\.0$/, "")}%`;

export function CandleChart({
  candles,
  team,
  xAxis,
  width,
  xRange,
}: {
  candles: CandlePayload;
  team: string;
  xAxis: XAxis;
  width: number;
  xRange: [number, number];
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);

  useEffect(() => {
    setHover(null);
  }, [xAxis, team]);

  const { W, narrow, M, H } = chartGeometry(width);
  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;
  const tickSize = narrow ? 11 : 12.5;
  const color = TEAM_COLORS[team];

  const [rMin, rMax] = xRange;

  // One plotted entry per game in range, carrying its x-slot index.
  const plotted = useMemo<Plotted[]>(() => {
    const out: Plotted[] = [];
    if (xAxis === "game") {
      for (const c of candles.byGame[team] ?? []) {
        if (c.game < rMin || c.game > rMax) continue;
        out.push({ c, xi: c.game });
      }
    } else {
      (candles.byDate[team] ?? []).forEach((c, i) => {
        if (i < rMin || i > rMax || !c) return;
        out.push({ c, xi: i });
      });
    }
    return out;
  }, [candles, team, xAxis, rMin, rMax]);

  // Win-probability axis, fixed 0–100 so candles are comparable game to game.
  const yMin = 0;
  const yMax = 100;
  const xMin = rMin;
  const xMax = rMax;
  const sx = (x: number) => M.left + ((x - xMin) / (xMax - xMin || 1)) * innerW;
  const sy = (p: number) => M.top + (1 - (p - yMin) / (yMax - yMin)) * innerH;

  // Body width scales with how many slots are visible, clamped to stay legible.
  const slot = innerW / Math.max(1, xMax - xMin);
  const bodyW = Math.max(1.5, Math.min(narrow ? 9 : 13, slot * 0.6));

  const yTicks = [0, 25, 50, 75, 100];
  const xTicks = useMemo(() => {
    if (xAxis === "game") {
      const span = xMax - xMin;
      const target = narrow ? 5 : 8;
      const step = Math.max(1, Math.round(span / target));
      const out: { x: number; label: string }[] = [];
      for (let g = Math.ceil(xMin); g <= xMax; g += step) out.push({ x: g, label: String(g) });
      return out;
    }
    const n = candles.dates.length;
    if (n === 0) return [];
    const lo = Math.max(0, Math.ceil(xMin));
    const hi = Math.min(n - 1, Math.floor(xMax));
    const span = hi - lo;
    if (span <= 0) return [{ x: lo, label: md(candles.dates[lo]) }];
    const step = Math.max(1, Math.round(span / (narrow ? 7 : 14)));
    const out: { x: number; label: string }[] = [];
    for (let i = lo; i <= hi; i += step) out.push({ x: i, label: md(candles.dates[i]) });
    return out;
  }, [xAxis, xMin, xMax, candles.dates, narrow]);

  const onMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const scale = W / rect.width;
      const mx = (e.clientX - rect.left) * scale;
      let best: Hover | null = null;
      let bestD = Infinity;
      for (const p of plotted) {
        const px = sx(p.xi);
        const d = Math.abs(px - mx);
        if (d < bestD) {
          bestD = d;
          best = { c: p.c, px };
        }
      }
      const hit = Math.max(bodyW, narrow ? 18 : 22);
      setHover(best && bestD < hit ? best : null);
    },
    [plotted, sx, W, bodyW, narrow],
  );

  const onLeave = useCallback(() => setHover(null), []);

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
        aria-label={`${candles.season} ${team} 경기별 승리확률 캔들차트`}
      >
        {yTicks.map((t) => {
          const y = sy(t);
          const isMid = t === 50;
          return (
            <g key={`y${t}`}>
              <line
                x1={M.left}
                x2={W - M.right}
                y1={y}
                y2={y}
                stroke={isMid ? "rgba(244,194,13,0.35)" : "var(--color-line)"}
                strokeWidth={isMid ? 1.5 : 1}
                strokeDasharray={isMid ? "none" : "2 5"}
              />
              <text
                x={M.left - 8}
                y={y}
                textAnchor="end"
                dominantBaseline="central"
                className="tnum"
                fontFamily="var(--font-sans)"
                fontSize={tickSize}
                fill={isMid ? "var(--color-amber)" : "var(--color-muted)"}
              >
                {t}%
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

        {plotted.map((p, i) => {
          const { c } = p;
          const x = sx(p.xi);
          const col = c.bullish ? UP : DOWN;
          const yHigh = sy(c.wpHigh);
          const yLow = sy(c.wpLow);
          const yOpen = sy(c.wpOpen);
          const yClose = sy(c.wpClose);
          const top = Math.min(yOpen, yClose);
          const bodyH = Math.max(1.5, Math.abs(yClose - yOpen));
          const isHover = hover?.c === c;
          return (
            <g
              key={`${c.date}-${c.game}`}
              style={{
                opacity: 0,
                animation: "candleIn 0.5s ease-out forwards",
                animationDelay: `${Math.min(0.5, i * 0.012)}s`,
              }}
            >
              {/* wick (high–low) */}
              <line
                x1={x}
                x2={x}
                y1={yHigh}
                y2={yLow}
                stroke={col}
                strokeWidth={isHover ? 2 : 1.2}
              />
              {/* body (open–close) */}
              <rect
                x={x - bodyW / 2}
                y={top}
                width={bodyW}
                height={bodyH}
                fill={col}
                stroke={col}
                strokeWidth={isHover ? 1.5 : 0}
                rx={1}
              />
            </g>
          );
        })}
      </svg>

      {hover && (
        <CandleTooltip
          c={hover.c}
          team={team}
          color={color}
          left={(hover.px / W) * 100}
          top={(sy(Math.max(hover.c.wpHigh, hover.c.wpClose)) / H) * 100}
        />
      )}
    </div>
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

function CandleTooltip({
  c,
  team,
  color,
  left,
  top,
}: {
  c: Candle;
  team: string;
  color: string;
  left: number;
  top: number;
}) {
  const won = c.wpClose >= 99;
  const draw = c.wpClose > 1 && c.wpClose < 99;
  const result = won ? "승" : draw ? "무" : "패";
  const resultColor = won ? UP : draw ? "var(--color-muted)" : DOWN;
  return (
    <div
      className="pointer-events-none absolute z-10 flex w-max flex-col gap-1 whitespace-nowrap rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-panel-2)]/95 px-3.5 py-2.5 backdrop-blur"
      style={{ left: `${left}%`, top: `${top}%`, transform: "translate(-50%, calc(-100% - 14px))" }}
    >
      <div className="mb-0.5 flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
        <span className="text-[13px] font-semibold text-[var(--color-fg)]">{TEAM_FULL_NAMES[team]}</span>
        <span className="ml-1 text-[12px] font-bold" style={{ color: resultColor }}>
          {result}
        </span>
        <span className="ml-1 text-[11px] text-[var(--color-muted)]">
          {c.game}경기 · {c.date}
        </span>
      </div>
      <Row label="시가 (경기 시작)" value={pct(c.wpOpen)} />
      <Row label="고가 (최고 승률) ▲" value={pct(c.wpHigh)} accent={UP} />
      <Row label="저가 (최저 승률) ▼" value={pct(c.wpLow)} accent={DOWN} />
      <Row label="종가 (경기 결과)" value={pct(c.wpClose)} />
      <div className="mt-1 border-t border-[var(--color-line)] pt-1">
        <Row label="상대 최고 승률" value={pct(c.oppPeak)} accent={DOWN} />
      </div>
    </div>
  );
}
