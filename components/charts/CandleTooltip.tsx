"use client";

import { candleOutcome, type Candle, type Outcome } from "@/lib/candles";
import { TEAM_FULL_NAMES } from "@/lib/teams";
import { LOSS_COLOR, WIN_COLOR } from "@/lib/chart";
import { useTooltipPosition } from "./useTooltipPosition";

const OUTCOME_LABEL: Record<Outcome, string> = { w: "승", d: "무", l: "패" };
const OUTCOME_COLOR: Record<Outcome, string> = {
  w: WIN_COLOR,
  d: "var(--color-muted)",
  l: LOSS_COLOR,
};

const pct = (v: number) => `${v.toFixed(1).replace(/\.0$/, "")}%`;

// "12:8 승" (score known) or "50경기 승" (score missing).
function resultText(g: Candle): string {
  const label = OUTCOME_LABEL[candleOutcome(g.wpClose)];
  return g.teamScore != null && g.opponentScore != null
    ? `${g.teamScore}:${g.opponentScore} ${label}`
    : `${g.game}경기 ${label}`;
}

// Win-probability path inside the tooltip (0–100%), with inning separators.
function Sparkline({
  series,
  innings,
  color,
  bullish,
}: {
  series: number[];
  innings: number[];
  color: string;
  bullish: boolean;
}) {
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

  const endColor = bullish ? WIN_COLOR : LOSS_COLOR;
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

export function CandleTooltip({
  c,
  team,
  color,
  point,
  view,
}: {
  c: Candle;
  team: string;
  color: string;
  point: { vx: number; vy: number };
  view: { W: number; H: number };
}) {
  const games = c.subGames ?? [c];
  const { ref, style } = useTooltipPosition(point, view);

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
            style={{ color: OUTCOME_COLOR[candleOutcome(games[0].wpClose)] }}
          >
            {resultText(games[0])}
          </span>
        )}
      </div>

      {games.map((g, idx) => (
        <div
          key={idx}
          className={idx > 0 ? "mt-1.5 border-t border-[var(--color-line)] pt-1.5 flex flex-col gap-1" : "flex flex-col gap-1"}
        >
          {games.length > 1 && (
            <div className="mb-0.5 flex items-center justify-between gap-6">
              <span className="text-[14px] font-bold text-white">{`DH${idx + 1}`}</span>
              <span
                className="text-[14px] font-bold"
                style={{ color: OUTCOME_COLOR[candleOutcome(g.wpClose)] }}
              >
                {resultText(g)}
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
            accent={WIN_COLOR}
          />
          <Row
            label="최저 승리확률"
            value={pct(g.wpLow)}
            accent={LOSS_COLOR}
          />
        </div>
      ))}
    </div>
  );
}
