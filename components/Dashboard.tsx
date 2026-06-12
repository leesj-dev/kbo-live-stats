"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChartPayload } from "@/lib/stats";
import type { CandlePayload } from "@/lib/candles";
import { TEAM_COLORS } from "@/lib/teams";
import { chartGeometry, fmtMonthDay, fmtRate, fmtSigned, NEGATIVE_COLOR, NEUTRAL_COLOR, POSITIVE_COLOR, type XAxis, type YAxis } from "@/lib/chart";
import { MarginChart } from "./charts/MarginChart";
import { DetailChart } from "./charts/DetailChart";
import { RangeSlider } from "./RangeSlider";
import { Segmented } from "./Segmented";
import { SeasonDropdown } from "./SeasonDropdown";
import { InfoTooltip } from "./InfoTooltip";

type ChartKind = "basic" | "detailed";

// The detailed (win-probability) chart relies on per-pitch WP data, only
// available from the 2024 season onward.
const DETAIL_MIN_SEASON = 2024;

const signColor = (v: number) => (v > 0 ? POSITIVE_COLOR : v < 0 ? NEGATIVE_COLOR : NEUTRAL_COLOR);

export function Dashboard({ payload, candles, seasons }: { payload: ChartPayload; candles: CandlePayload; seasons: number[] }) {
  const [chartKind, setChartKind] = useState<ChartKind>("basic");
  const [xAxis, setXAxis] = useState<XAxis>("date");
  const [yAxis, setYAxis] = useState<YAxis>("margin");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [highlight, setHighlight] = useState<string | null>(null);
  const detailSupported = payload.season >= DETAIL_MIN_SEASON;
  const isDetailed = detailSupported && chartKind === "detailed";

  // Restore view state from the query string (written by SeasonDropdown), then
  // let the line-draw animation play once and settle.
  const [shouldAnimate, setShouldAnimate] = useState(true);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const kind = params.get("kind");
    const x = params.get("x");
    const y = params.get("y");
    if (kind === "basic" || (kind === "detailed" && detailSupported)) setChartKind(kind);
    if (x === "date" || x === "game") setXAxis(x);
    if (y === "margin" || y === "winRate") setYAxis(y);

    const timer = setTimeout(() => setShouldAnimate(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(960);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The active dataset drives the x-axis bounds and date labels.
  const activeDates = isDetailed ? candles.dates : payload.dates;
  const dateMaxIdx = Math.max(0, activeDates.length - 1);
  const gameMax = Math.max(1, isDetailed ? candles.maxGames : payload.maxGames);
  const [dateRange, setDateRange] = useState<[number, number]>([0, dateMaxIdx]);
  const [gameRange, setGameRange] = useState<[number, number]>([1, gameMax]);
  // A new season is a fresh dataset — reset the zoom to the full extent.
  useEffect(() => {
    setDateRange([0, dateMaxIdx]);
    setGameRange([1, gameMax]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload.season]);
  // Toggling 기본/상세 (or 승패마진/승률) keeps the current zoom; only clamp it
  // when the active dataset's extent shrinks so the range stays in bounds.
  useEffect(() => {
    setDateRange(([lo, hi]) => [Math.min(lo, dateMaxIdx), Math.min(hi, dateMaxIdx)]);
  }, [dateMaxIdx]);
  useEffect(() => {
    setGameRange(([lo, hi]) => [Math.min(Math.max(lo, 1), gameMax), Math.min(hi, gameMax)]);
  }, [gameMax]);

  const isGame = xAxis === "game";
  const range = isGame ? gameRange : dateRange;
  const setRange = isGame ? setGameRange : setDateRange;
  const sliderMin = isGame ? 1 : 0;
  const sliderMax = isGame ? gameMax : dateMaxIdx;
  const fmtRange = (v: number) => {
    if (isGame) return `${v}경기`;
    const d = activeDates[v] ?? activeDates[activeDates.length - 1];
    return d ? fmtMonthDay(d) : "—";
  };

  // Sidebar click: toggles a team on/off.
  const onTeamClick = (team: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(team)) {
        next.delete(team);
      } else {
        next.add(team);
      }
      return next;
    });
  };

  const hasActiveData = isDetailed ? candles.teams.length > 0 : payload.teams.length > 0;
  const geo = chartGeometry(width);

  // Standings reflect the slider's right endpoint (cumulative season-to-date up
  // to that game/date) using the real records, and are re-sorted by the visible
  // metric so the rank numbers match the selected point in time.
  const rangeHi = range[1];
  const endpointDate = isGame ? null : activeDates[rangeHi];
  const standings = useMemo(() => {
    const rows = payload.teams.map((team) => {
      const games = payload.byGame[team] ?? [];
      let rec: (typeof games)[number] | undefined;
      for (const g of games) {
        if (isGame ? g.game <= rangeHi : !endpointDate || g.date <= endpointDate) rec = g;
        else break;
      }
      return {
        team,
        margin: rec?.margin ?? 0,
        winRate: rec?.winRate ?? 0,
        games: rec?.game ?? 0,
      };
    });

    // 1. Calculate ranks based on winRate (official standings rank)
    const sortedByWinRate = [...rows].sort((a, b) => {
      const d = b.winRate - a.winRate;
      if (d !== 0) return d;
      const d2 = b.margin - a.margin; // tiebreak on margin
      if (d2 !== 0) return d2;
      return a.team.localeCompare(b.team);
    });

    const rankMap = new Map<string, number>();
    let currentRank = 1;
    sortedByWinRate.forEach((row, idx) => {
      if (idx > 0) {
        const prev = sortedByWinRate[idx - 1];
        const isTie = row.winRate === prev.winRate;
        if (!isTie) {
          currentRank = idx + 1;
        }
      }
      rankMap.set(row.team, currentRank);
    });

    // 2. Sort the rows for display according to the active yAxis metric
    rows.sort((a, b) => {
      const d = yAxis === "winRate" ? b.winRate - a.winRate : b.margin - a.margin;
      if (d !== 0) return d;
      const d2 = b.margin - a.margin; // tiebreak on the other metric
      if (d2 !== 0) return d2;
      return a.team.localeCompare(b.team);
    });

    return rows.map((row) => ({
      ...row,
      rank: rankMap.get(row.team) ?? 1,
    }));
  }, [payload, isGame, rangeHi, endpointDate, yAxis]);

  // Continuous FLIP: animate rows sliding to their new positions as the order
  // changes. The key for fast/repeated drags is to read each row's TRUE layout
  // position without disturbing any in-flight transform (we read the live
  // translate from the computed matrix and subtract it). That way the offset
  // can't compound (no off-screen fling) and we never reset `transition`
  // mid-tween (so the animation keeps playing while dragging) — each new tween
  // simply continues from wherever the row currently is on screen.
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const prevTops = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const rows = rowRefs.current;
    const liveTranslateY = (el: HTMLElement) => {
      const t = getComputedStyle(el).transform;
      return t && t !== "none" ? new DOMMatrixReadOnly(t).m42 : 0;
    };
    // Measure first (reads only), so styles flush once.
    const plan: { el: HTMLLIElement; top: number; from: number | null }[] = [];
    rows.forEach((el, team) => {
      const cur = liveTranslateY(el);
      const top = el.getBoundingClientRect().top - cur; // true layout top
      const old = prevTops.current.get(team);
      const dy = old == null ? 0 : old - top;
      prevTops.current.set(team, top);
      plan.push({ el, top, from: dy ? dy + cur : null });
    });
    // Invert: park each moved row at its current on-screen spot, no transition.
    for (const p of plan) {
      if (p.from == null) continue;
      p.el.style.transition = "none";
      p.el.style.transform = `translateY(${p.from}px)`;
    }
    // Play: next frame, transition back to the natural position.
    requestAnimationFrame(() => {
      for (const p of plan) {
        if (p.from == null) continue;
        p.el.style.transition = "transform 320ms cubic-bezier(0.4,0,0.2,1)";
        p.el.style.transform = "";
      }
    });
  }, [standings]);

  const updatedLabel = payload.updatedAt.slice(0, 10);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-8">
      <header className="animate-rise relative z-30 flex flex-wrap items-start justify-between gap-3 sm:gap-6 border-b border-[var(--color-line)] pb-3">
        <h1 className="mt-1 font-bold text-[34px] sm:text-5xl leading-[0.9] tracking-tight text-[var(--color-fg)]">
          <span className="text-[var(--color-muted)] font-normal">오늘의</span> 승패마진
        </h1>

        <div className="flex flex-col items-start gap-2 sm:items-end">
          <SeasonDropdown
            seasons={seasons}
            current={payload.season}
            chartKind={chartKind}
            xAxis={xAxis}
            yAxis={yAxis}
          />
          <span className="tracking-wide text-[11px] text-[var(--color-muted)]">최종 업데이트 {updatedLabel}</span>
        </div>
      </header>

      <div className="mt-7 flex flex-wrap items-end gap-x-2 min-[406px]:gap-x-4 min-[438px]:gap-x-8 gap-y-4">
        <Segmented
          label="차트"
          value={isDetailed ? "detailed" : "basic"}
          onChange={setChartKind}
          info={
            <InfoTooltip label="상세 차트 안내">
              <b className="font-semibold">상세</b> 차트는 경기 중 승리확률의 흐름까지 반영해서 보여줍니다. 2024 시즌부터 지원합니다.
            </InfoTooltip>
          }
          options={[
            { value: "basic", label: "기본" },
            { value: "detailed", label: "상세", disabled: !detailSupported },
          ]}
        />
        <Segmented
          label="가로축"
          value={xAxis}
          onChange={setXAxis}
          options={[
            { value: "date", label: "날짜별" },
            { value: "game", label: "경기별" },
          ]}
        />
        <Segmented
          label="세로축"
          value={yAxis}
          onChange={setYAxis}
          options={[
            { value: "margin", label: "승패마진" },
            { value: "winRate", label: "승률" },
          ]}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_192px]">
        <div
          ref={wrapRef}
          className="animate-rise rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)]/60 p-3 sm:p-4"
          style={{ animationDelay: "0.08s" }}
        >
          {hasActiveData ? (
            <>
              {isDetailed ? (
                <DetailChart
                  candles={candles}
                  payload={payload}
                  xAxis={xAxis}
                  yAxis={yAxis}
                  hidden={hidden}
                  highlight={highlight}
                  onHighlight={setHighlight}
                  width={width}
                  xRange={range}
                  animate={shouldAnimate}
                />
              ) : (
                <MarginChart
                  payload={payload}
                  xAxis={xAxis}
                  yAxis={yAxis}
                  hidden={hidden}
                  highlight={highlight}
                  onHighlight={setHighlight}
                  width={width}
                  xRange={range}
                  animate={shouldAnimate}
                />
              )}
              <div
                className="mt-1"
                style={{ paddingLeft: geo.M.left, paddingRight: geo.M.right }}
              >
                <RangeSlider
                  min={sliderMin}
                  max={sliderMax}
                  value={range}
                  onChange={setRange}
                  format={fmtRange}
                />
              </div>
            </>
          ) : (
            <div className="flex h-[360px] flex-col items-center justify-center gap-2 text-center">
              <span className="text-[var(--color-muted)]">
                {payload.season} 시즌 데이터가 {isDetailed ? "아직 " : ""}없습니다.
              </span>
            </div>
          )}
        </div>

        <aside
          className="animate-rise rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)]/60 p-3"
          style={{ animationDelay: "0.12s" }}
        >
          <div className="mb-2 flex items-baseline justify-between px-1">
            <span className="text-[16px] font-semibold text-[var(--color-fg)]">순위</span>
          </div>
          <ul className="scroll-thin flex flex-col gap-0.5">
            {standings.map((s, i) => {
              const noData = isDetailed && !candles.teams.includes(s.team);
              const off = hidden.has(s.team) || noData;
              const hi = highlight === s.team;
              return (
                <li
                  key={s.team}
                  ref={(el) => {
                    if (el) rowRefs.current.set(s.team, el);
                    else rowRefs.current.delete(s.team);
                  }}
                >
                  <button
                    onClick={() => onTeamClick(s.team)}
                    onPointerEnter={() => !noData && setHighlight(s.team)}
                    onPointerLeave={() => !noData && setHighlight(null)}
                    disabled={noData}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors ${
                      hi ? "bg-[var(--color-panel-2)]" : "hover:bg-[var(--color-panel-2)]/60"
                    } ${off ? "opacity-40" : ""} ${noData ? "cursor-not-allowed" : ""}`}
                  >
                    <span className="w-4 font-mono text-[12px] font-medium tabular-nums text-[var(--color-muted)]">{s.rank}</span>
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        background: TEAM_COLORS[s.team],
                        boxShadow: off ? "none" : `0 0 6px ${TEAM_COLORS[s.team]}66`,
                      }}
                    />
                    <span className="flex-1 truncate text-[13px] font-medium text-[var(--color-fg)]">{s.team}</span>
                    <span
                      className="font-mono text-[12px] font-semibold tabular-nums"
                      style={{ color: signColor(yAxis === "winRate" ? s.winRate - 0.5 : s.margin) }}
                    >
                      {yAxis === "winRate" ? fmtRate(s.winRate) : fmtSigned(s.margin)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
      <footer>
        <div className="mt-8 flex flex-col items-center gap-2 text-center text-sm text-[var(--color-muted)]">
          <span>
            © 2026&nbsp;
            <a
              href="https://github.com/leesj-dev"
              target="_blank"
              rel="noopener noreferrer"
              className="no-underline hover:underline"
            >
              leesj-dev
            </a>
            . All rights reserved.
          </span>
        </div>
      </footer>
    </main>
  );
}
