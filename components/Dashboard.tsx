"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ChartPayload } from "@/lib/stats";
import { TEAM_COLORS } from "@/lib/teams";
import { MarginChart, chartGeometry, type XAxis, type YAxis } from "./MarginChart";
import { RangeSlider } from "./RangeSlider";

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-[5px]">
      <span className="font-mono text-[12px] uppercase tracking-wider text-[var(--color-muted)] ml-1">{label}</span>
      <div className="inline-flex rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] p-0.5">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              onClick={() => onChange(o.value)}
              className={`relative rounded-[6px] px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                active
                  ? "bg-[var(--color-panel-2)] text-[var(--color-fg)] shadow-[inset_0_0_0_1px_var(--color-line-strong)]"
                  : "text-[var(--color-muted)] hover:text-[var(--color-fg)]"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SeasonDropdown({ seasons, current }: { seasons: number[]; current: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Prefetch sibling seasons so navigation feels instant.
  useEffect(() => {
    if (open) seasons.forEach((s) => router.prefetch(`/${s}`));
  }, [open, seasons, router]);

  return (
    <div
      ref={ref}
      className="relative"
    >
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] py-2 pl-3.5 pr-3 transition-colors hover:border-[var(--color-line-strong)]"
      >
        <span className="font-bold text-xl leading-none text-[var(--color-fg)]">{current}</span>
        <span className="text-[12px] uppercase tracking-[0.1em] text-[var(--color-faint)]">시즌</span>
        <svg
          width="11"
          height="11"
          viewBox="0 0 12 12"
          fill="none"
          className={`text-[var(--color-muted)] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <path
            d="M2.5 4.5L6 8l3.5-3.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <ul
          role="listbox"
          className="scroll-thin absolute right-0 z-30 mt-2 max-h-72 w-32 overflow-y-auto rounded-xl border border-[var(--color-line-strong)] bg-[var(--color-panel-2)] p-1 shadow-2xl shadow-black/50"
        >
          {seasons.map((s) => {
            const active = s === current;
            return (
              <li key={s}>
                <button
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    setOpen(false);
                    if (!active) router.push(`/${s}`);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-[13px] tabular-nums transition-colors ${
                    active
                      ? "bg-[var(--color-amber)] font-semibold text-[#1a1405]"
                      : "text-[var(--color-muted)] hover:bg-[var(--color-panel)] hover:text-[var(--color-fg)]"
                  }`}
                >
                  {s}
                  {active && (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                    >
                      <path
                        d="M2.5 6.5L5 9l4.5-5"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function Dashboard({ payload, seasons }: { payload: ChartPayload; seasons: number[] }) {
  const [xAxis, setXAxis] = useState<XAxis>("date");
  const [yAxis, setYAxis] = useState<YAxis>("margin");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [highlight, setHighlight] = useState<string | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(960);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // X-axis window, tracked separately per axis mode. Defaults to the full season.
  const dateMaxIdx = Math.max(0, payload.dates.length - 1);
  const gameMax = Math.max(1, payload.maxGames);
  const [dateRange, setDateRange] = useState<[number, number]>([0, dateMaxIdx]);
  const [gameRange, setGameRange] = useState<[number, number]>([1, gameMax]);
  useEffect(() => {
    setDateRange([0, dateMaxIdx]);
    setGameRange([1, gameMax]);
  }, [payload.season, dateMaxIdx, gameMax]);

  const isGame = xAxis === "game";
  const range = isGame ? gameRange : dateRange;
  const setRange = isGame ? setGameRange : setDateRange;
  const sliderMin = isGame ? 1 : 0;
  const sliderMax = isGame ? gameMax : dateMaxIdx;
  const fmtRange = (v: number) => {
    if (isGame) return `${v}경기`;
    const d = payload.dates[v] ?? payload.dates[payload.dates.length - 1];
    return d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : "—";
  };

  const toggleTeam = (team: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(team) ? next.delete(team) : next.add(team);
      return next;
    });

  const hasData = payload.teams.length > 0;

  const standings = useMemo(
    () =>
      payload.teams.map((team) => {
        const last = payload.byGame[team]?.at(-1);
        return {
          team,
          margin: last?.margin ?? 0,
          winRate: last?.winRate ?? 0,
          games: last?.game ?? 0,
        };
      }),
    [payload],
  );

  const updated = new Date(payload.updatedAt);
  const updatedLabel = `${updated.getFullYear()}-${String(updated.getMonth() + 1).padStart(2, "0")}-${String(updated.getDate()).padStart(2, "0")}`;

  return (
    <main className="mx-auto w-full max-w-7xl px-5 pb-20 pt-8 sm:px-8">
      <header className="animate-rise relative z-30 flex flex-wrap items-start justify-between gap-6 border-b border-[var(--color-line)] pb-3">
        <h1 className="mt-1 font-bold text-5xl leading-[0.9] tracking-tight text-[var(--color-fg)]">
          <span className="text-[var(--color-muted)] font-normal">오늘의</span> 승패마진
        </h1>

        <div className="flex flex-col items-start gap-2 sm:items-end">
          <SeasonDropdown
            seasons={seasons}
            current={payload.season}
          />
          <span className="tracking-wide text-[11px] text-[var(--color-muted)]">최종 업데이트 {updatedLabel}</span>
        </div>
      </header>

      <div className="mt-7 flex flex-wrap items-end gap-x-8 gap-y-4">
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
          {hasData ? (
            <>
              <MarginChart
                payload={payload}
                xAxis={xAxis}
                yAxis={yAxis}
                hidden={hidden}
                highlight={highlight}
                onHighlight={setHighlight}
                width={width}
                xRange={range}
              />
              <div
                className="mt-1"
                style={{
                  paddingLeft: chartGeometry(width).M.left,
                  paddingRight: chartGeometry(width).M.right,
                }}
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
              <span className="text-[var(--color-muted)]">{payload.season} 시즌 데이터가 없습니다.</span>
            </div>
          )}
        </div>

        <aside
          className="animate-rise rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)]/60 p-3"
          style={{ animationDelay: "0.12s" }}
        >
          <div className="mb-2 px-1">
            <span className="text-[16px] font-semibold text-[var(--color-fg)]">순위</span>
          </div>
          <ul className="scroll-thin flex flex-col gap-0.5">
            {standings.map((s, i) => {
              const off = hidden.has(s.team);
              const hi = highlight === s.team;
              return (
                <li key={s.team}>
                  <button
                    onClick={() => toggleTeam(s.team)}
                    onPointerEnter={() => setHighlight(s.team)}
                    onPointerLeave={() => setHighlight(null)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors ${
                      hi ? "bg-[var(--color-panel-2)]" : "hover:bg-[var(--color-panel-2)]/60"
                    } ${off ? "opacity-40" : ""}`}
                  >
                    <span className="w-4 font-mono text-[12px] font-medium tabular-nums text-[var(--color-muted)]">{i + 1}</span>
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
                      style={{
                        color:
                          yAxis === "winRate"
                            ? s.winRate > 0.5
                              ? "#5ad19a"
                              : s.winRate < 0.5
                                ? "#f0746e"
                                : "var(--color-muted)"
                            : s.margin > 0
                              ? "#5ad19a"
                              : s.margin < 0
                                ? "#f0746e"
                                : "var(--color-muted)",
                      }}
                    >
                      {yAxis === "winRate"
                        ? s.winRate.toFixed(3).replace(/^0/, "")
                        : s.margin > 0
                          ? `+${s.margin}`
                          : s.margin}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
      <footer>
        <div className="mt-10 flex flex-col items-center gap-2 text-center text-sm text-[var(--color-muted)]">
          <span>
            © 2026&nbsp;
            <a
              href="https://github.com/leesj-dev"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:no-underline"
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
