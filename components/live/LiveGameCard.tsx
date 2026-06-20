"use client";

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { LiveGameCard as Card } from "@/lib/live";
import type { PlayDetail } from "@/lib/plays";
import { TEAM_COLORS, TEAM_FULL_NAMES } from "@/lib/teams";

const LIVE_RED = "#f0584e";
const BALL_GREEN = "#46c46a";
const STRIKE_AMBER = "#f0b429";
const EMPTY_DOT = "var(--color-line-strong)";

function StatusPill({ c }: { c: Card }) {
  const live = c.status === "live";
  const text =
    c.status === "cancel"
      ? "취소"
      : c.status === "live"
        ? (c.inningText ?? "LIVE")
        : c.status === "final"
          ? "종료"
          : c.startTime
            ? c.startTime.slice(11, 16)
            : "예정";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 mt-0.5 text-[11px] font-semibold"
      style={live ? { background: `${LIVE_RED}1f`, color: LIVE_RED } : { background: "var(--color-panel-2)", color: "var(--color-muted)" }}
    >
      {live && (
        <span className="relative flex h-1.5 w-1.5">
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
            style={{ background: LIVE_RED }}
          />
          <span
            className="relative inline-flex h-1.5 w-1.5 rounded-full"
            style={{ background: LIVE_RED }}
          />
        </span>
      )}
      {text}
    </span>
  );
}

// One team's row in the header: color dot, name, score, current win prob.
function TeamLine({ team, score, wp, color }: { team: string; score: number | null; wp: number | null; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: color }}
      />
      <span className="flex-1 truncate text-[13px] font-semibold text-[var(--color-fg)]">{TEAM_FULL_NAMES[team] ?? team}</span>
      <span className="tnum text-[15px] font-bold text-[var(--color-fg)]">{score ?? "–"}</span>
      {wp != null && (
        <span
          className="tnum w-9 shrink-0 text-right text-[12px] font-semibold"
          style={{ color }}
        >
          {Math.round(wp)}%
        </span>
      )}
    </div>
  );
}

// Baseball diamond — 1st (right), 2nd (top), 3rd (left); filled when occupied.
function BaseDiamond({ bases }: { bases: [boolean, boolean, boolean] }) {
  const s = 5;
  const sq = (cx: number, cy: number) => `${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}`;
  const pos: [number, number][] = [
    [21, 14], // 1st
    [13, 6], // 2nd
    [5, 14], // 3rd
  ];
  return (
    <svg
      viewBox="0 0 26 21"
      width={34}
      height={28}
      className="shrink-0"
    >
      {pos.map(([cx, cy], i) => (
        <polygon
          key={i}
          points={sq(cx, cy)}
          fill={bases[i] ? "var(--color-muted)" : "transparent"}
          stroke="var(--color-muted)"
          strokeWidth={1.1}
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

function InningMark({ inn, isTop }: { inn: number; isTop: boolean }) {
  return (
    <div className="flex shrink-0 flex-col items-center leading-none">
      <span
        className="text-[7px]"
        style={{ color: isTop ? LIVE_RED : EMPTY_DOT }}
      >
        ▲
      </span>
      <span className="tnum text-[17px] font-bold text-[var(--color-fg)]">{inn}</span>
      <span
        className="text-[7px]"
        style={{ color: isTop ? EMPTY_DOT : LIVE_RED }}
      >
        ▼
      </span>
    </div>
  );
}

function CountRow({ label, filled, total, color }: { label: string; filled: number; total: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-2 text-[9px] font-bold text-[var(--color-muted)]">{label}</span>
      <div className="flex gap-[3px]">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className="h-[7px] w-[7px] rounded-full"
            style={{ background: i < filled ? color : EMPTY_DOT }}
          />
        ))}
      </div>
    </div>
  );
}

// Pitcher / batter glyphs (baseball, bat) — replace the 투/타 text labels. Both
// are solid; the baseball's stitches are carved out in the tooltip background.
function BallIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="13"
      height="13"
      className="shrink-0"
    >
      <circle
        cx="8"
        cy="8"
        r="6.3"
        fill="currentColor"
      />
      <path
        d="M4.4 4.4 Q6.6 8 4.4 11.6"
        fill="none"
        stroke="var(--color-panel-2)"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      <path
        d="M11.6 4.4 Q9.4 8 11.6 11.6"
        fill="none"
        stroke="var(--color-panel-2)"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}
function BatIcon() {
  // Baseball-bat silhouette: fat rounded barrel (top-right) tapering down a
  // shaft to a thin handle with a flared knob (bottom-left).
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      className="shrink-0"
      fill="currentColor"
    >
      <path d="M20.41 7.41 L16.56 10.56 L11.92 13.92 L7.57 17.57 L5.13 21.13 A1.6 1.6 0 0 1 2.87 18.87 L6.43 16.43 L10.08 12.08 L13.44 7.44 L16.59 3.59 A2.7 2.7 0 0 1 20.41 7.41 Z" />
    </svg>
  );
}

const TOOLTIP_W = 227;

function PlayTooltip({
  play,
  loading,
  leftPx,
  awayTeam,
  homeTeam,
  awayColor,
  homeColor,
  fallbackAwayWp,
  fallbackHomeWp,
}: {
  play: PlayDetail | null;
  loading: boolean;
  leftPx: number;
  awayTeam: string;
  homeTeam: string;
  awayColor: string;
  homeColor: string;
  fallbackAwayWp: number;
  fallbackHomeWp: number;
}) {
  const awayWp = play ? play.awayWp : fallbackAwayWp;
  const homeWp = play ? play.homeWp : fallbackHomeWp;

  return (
    <div
      className="pointer-events-none absolute top-[calc(100%+6px)] z-50 rounded-xl border border-[var(--color-line-strong)] bg-[var(--color-panel-2)]/95 px-3.5 py-3 backdrop-blur"
      style={{ left: `${leftPx}px`, width: `${TOOLTIP_W}px` }}
    >
      {/* scoreboard headline: win% flanks a prominent score */}
      <div className="flex items-center justify-between tnum text-[12px] font-semibold">
        <span>
          <span className="text-[var(--color-fg)]">{awayTeam}</span> <span style={{ color: awayColor }}>{Math.round(awayWp)}%</span>
        </span>
        <span className="text-[18px] font-bold leading-none text-[var(--color-fg)]">{play ? `${play.awayScore} : ${play.homeScore}` : "–"}</span>
        <span>
          <span style={{ color: homeColor }}>{Math.round(homeWp)}%</span> <span className="text-[var(--color-fg)]">{homeTeam}</span>
        </span>
      </div>

      {!play ? (
        <div className="mt-2.5 text-center text-[11px] text-[var(--color-muted)]">{loading ? "불러오는 중…" : "정보 없음"}</div>
      ) : (
        <>
          <div className="my-2.5 flex items-center gap-3 border-y border-[var(--color-line)] py-2.5 pl-2">
            <InningMark
              inn={play.inn}
              isTop={play.isTop}
            />
            <BaseDiamond bases={play.bases} />
            <div className="flex flex-col">
              <CountRow
                label="B"
                filled={Math.min(play.balls, 3)}
                total={3}
                color={BALL_GREEN}
              />
              <CountRow
                label="S"
                filled={Math.min(play.strikes, 2)}
                total={2}
                color={STRIKE_AMBER}
              />
              <CountRow
                label="O"
                filled={Math.min(play.outs, 2)}
                total={2}
                color={LIVE_RED}
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 text-[11px]">
              <span className="flex items-center gap-1.5 text-[var(--color-muted)]">
                <BallIcon />
                <span className="truncate font-medium text-[var(--color-fg)]">{play.pitcher ?? "—"}</span>
              </span>
              <span className="flex items-center gap-1.5 text-[var(--color-muted)]">
                <BatIcon />
                <span className="truncate font-medium text-[var(--color-fg)]">{play.batter ?? "—"}</span>
              </span>
            </div>
          </div>

          {play.result && <div className="text-[12px] font-medium text-[var(--color-fg)]">{play.result}</div>}
          {play.scoring.map((s, i) => (
            <div
              key={i}
              className="mt-0.5 text-[12px] font-bold"
              style={{ color: STRIKE_AMBER }}
            >
              {s}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function GameGraph({ c }: { c: Card }) {
  const { homeSeries: home, awaySeries: away, innings } = c;
  const n = home.length;
  const W = 340;
  const H = 132;
  const P = { l: 6, r: 6, t: 8, b: 16 };
  const iw = W - P.l - P.r;
  const ih = H - P.t - P.b;
  const nTotal = n + (c.status === "live" ? c.livePad : 0);
  const maxIdx = Math.max(1, nTotal - 1);
  const sx = (i: number) => P.l + (i / maxIdx) * iw;
  const sy = (p: number) => P.t + (1 - p / 100) * ih;
  const path = (s: number[]) => s.map((p, i) => `${i === 0 ? "M" : "L"}${sx(i).toFixed(1)},${sy(p).toFixed(1)}`).join(" ");

  // Inning labels — only for innings that have actually been played. The first
  // point carries the opening inning's number (no separator line), matching the
  // detail-chart tooltip; later innings get a dashed separator + number.
  const bounds: { i: number; inn: number }[] = [];
  if (n > 0) bounds.push({ i: 0, inn: innings[0] });
  for (let i = 1; i < n; i++) if (innings[i] !== innings[i - 1]) bounds.push({ i, inn: innings[i] });

  const homeColor = TEAM_COLORS[c.homeTeam] ?? "#888";
  const awayColor = TEAM_COLORS[c.awayTeam] ?? "#888";

  // Per-plate detail, fetched lazily on first hover (re-fetched each hover while
  // live so the latest plate appearance is reflected).
  const [plays, setPlays] = useState<PlayDetail[] | null>(null);
  const [hover, setHover] = useState<{ idx: number; px: number; w: number } | null>(null);
  const fetchedRef = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const ensurePlays = useCallback(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetch(`/api/live/game/${c.gameId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.plays && setPlays(d.plays as PlayDetail[]))
      .catch(() => {});
  }, [c.gameId]);

  const onEnter = () => {
    if (c.status === "live") fetchedRef.current = false; // refresh live detail
    ensurePlays();
  };
  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const fracPx = (e.clientX - rect.left) / rect.width;
    const idx = Math.max(0, Math.min(n - 1, Math.round(((fracPx * W - P.l) / iw) * maxIdx)));
    setHover({ idx, px: e.clientX - rect.left, w: rect.width });
  };
  const onLeave = () => setHover(null);

  const hoverPlay =
    hover && plays && plays.length ? plays[plays.length === n ? hover.idx : Math.round((hover.idx / Math.max(1, n - 1)) * (plays.length - 1))] : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full"
        style={{ height: "auto", touchAction: "none" }}
        onPointerEnter={onEnter}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
      >
        {/* inning separators */}
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
              y={H - 3}
              textAnchor="middle"
              fontSize={8}
              fill="var(--color-muted)"
            >
              {b.inn}
            </text>
          </g>
        ))}

        {/* 0% / 100% bounds — faint, uncoloured */}
        <line
          x1={P.l}
          x2={P.l + iw}
          y1={sy(0)}
          y2={sy(0)}
          stroke="var(--color-line)"
          strokeWidth={1}
        />
        <line
          x1={P.l}
          x2={P.l + iw}
          y1={sy(100)}
          y2={sy(100)}
          stroke="var(--color-line)"
          strokeWidth={1}
        />

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

        {/* both teams' win-probability paths */}
        <path
          d={path(away)}
          fill="none"
          stroke={awayColor}
          strokeWidth={1.6}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d={path(home)}
          fill="none"
          stroke={homeColor}
          strokeWidth={1.6}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* hovered plate marker */}
        {hover && (
          <g pointerEvents="none">
            <line
              x1={sx(hover.idx)}
              x2={sx(hover.idx)}
              y1={P.t}
              y2={P.t + ih}
              stroke="var(--color-line-strong)"
              strokeWidth={1}
            />
            <circle
              cx={sx(hover.idx)}
              cy={sy(away[hover.idx])}
              r={3}
              fill={awayColor}
              stroke="var(--color-panel)"
              strokeWidth={1}
            />
            <circle
              cx={sx(hover.idx)}
              cy={sy(home[hover.idx])}
              r={3}
              fill={homeColor}
              stroke="var(--color-panel)"
              strokeWidth={1}
            />
          </g>
        )}

        {/* current value dots (hidden while hovering to avoid doubling up) */}
        {!hover && (
          <>
            <circle
              cx={sx(n - 1)}
              cy={sy(away[n - 1])}
              r={2.6}
              fill={awayColor}
            />
            <circle
              cx={sx(n - 1)}
              cy={sy(home[n - 1])}
              r={2.6}
              fill={homeColor}
            />
          </>
        )}
      </svg>

      {hover && (
        <PlayTooltip
          play={hoverPlay}
          loading={plays === null}
          leftPx={Math.max(4, Math.min(hover.w - TOOLTIP_W - 4, hover.px - TOOLTIP_W / 2))}
          awayTeam={c.awayTeam}
          homeTeam={c.homeTeam}
          awayColor={awayColor}
          homeColor={homeColor}
          fallbackAwayWp={away[hover.idx]}
          fallbackHomeWp={home[hover.idx]}
        />
      )}
    </div>
  );
}

export function LiveGameCard({ card }: { card: Card }) {
  const cancelled = card.status === "cancel";
  const hasSeries = card.homeSeries.length >= 2;
  const homeColor = TEAM_COLORS[card.homeTeam] ?? "#888";
  const awayColor = TEAM_COLORS[card.awayTeam] ?? "#888";

  // Current win prob (away/home) for the header; only meaningful with series.
  const homeWp = hasSeries ? card.homeSeries[card.homeSeries.length - 1] : null;
  const awayWp = hasSeries ? card.awaySeries[card.awaySeries.length - 1] : null;

  return (
    <div className={`relative rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)]/60 p-4 ${cancelled ? "opacity-50" : ""}`}>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 flex flex-col gap-0.5">
          <TeamLine
            team={card.awayTeam}
            score={card.awayScore}
            wp={awayWp}
            color={awayColor}
          />
          <TeamLine
            team={card.homeTeam}
            score={card.homeScore}
            wp={homeWp}
            color={homeColor}
          />
        </div>
        <StatusPill c={card} />
      </div>

      {cancelled ? (
        <div className="flex h-[120px] items-center justify-center rounded-lg bg-[var(--color-panel-2)]/40 text-[13px] font-semibold text-[var(--color-muted)]">
          취소
        </div>
      ) : hasSeries ? (
        <GameGraph c={card} />
      ) : (
        <div className="flex h-[120px] items-center justify-center rounded-lg bg-[var(--color-panel-2)]/40 text-[13px] font-medium text-[var(--color-muted)]">
          {card.status === "scheduled" ? "경기 전" : "데이터 없음"}
        </div>
      )}
    </div>
  );
}
