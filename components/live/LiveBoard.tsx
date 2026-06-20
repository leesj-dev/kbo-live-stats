"use client";

import { useEffect, useRef, useState } from "react";
import type { LiveGameCard as Card } from "@/lib/live";
import { LiveGameCard } from "./LiveGameCard";
import { DatePicker } from "./DatePicker";

const dashed = (ymd: string) => `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
const undashed = (d: string) => d.replace(/-/g, "");
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

function dateLabel(ymd: string): string {
  const mm = Number(ymd.slice(4, 6));
  const dd = Number(ymd.slice(6, 8));
  const wd = WEEK[new Date(`${dashed(ymd)}T00:00:00Z`).getUTCDay()];
  return `${mm}월 ${dd}일 (${wd})`;
}

export function LiveBoard({
  initialYmd,
  initialGames,
  dates,
  todayYmd,
}: {
  initialYmd: string; // YYYYMMDD
  initialGames: Card[];
  dates: string[]; // navigable dates, YYYY-MM-DD ascending
  todayYmd: string; // YYYYMMDD (KST)
}) {
  const [ymd, setYmd] = useState(initialYmd);
  const [games, setGames] = useState<Card[]>(initialGames);
  const firstRef = useRef(true);

  useEffect(() => {
    let alive = true;
    const fetchGames = async () => {
      try {
        const res = await fetch(`/api/live?date=${ymd}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { games?: Card[] };
        if (alive) setGames(data.games ?? []);
      } catch {
        /* ignore transient poll errors */
      }
    };
    // The SSR render already has the initial date's games; fetch only on change.
    if (firstRef.current) firstRef.current = false;
    else fetchGames();
    // Keep today's board live; past dates are static.
    const id = ymd === todayYmd ? setInterval(fetchGames, 30_000) : null;
    return () => {
      alive = false;
      if (id) clearInterval(id);
    };
  }, [ymd, todayYmd]);

  const curDash = dashed(ymd);
  const earlier = dates.filter((d) => d < curDash);
  const later = dates.filter((d) => d > curDash);
  const prevYmd = earlier.length ? undashed(earlier[earlier.length - 1]) : null;
  const nextYmd = later.length ? undashed(later[0]) : null;

  const go = (target: string | null) => {
    if (!target) return;
    setYmd(target);
    window.history.replaceState(null, "", `/live/${target}`);
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-center gap-3">
        <NavButton
          dir="prev"
          onClick={() => go(prevYmd)}
          disabled={!prevYmd}
        />
        <DatePicker
          value={ymd}
          label={dateLabel(ymd)}
          dates={dates}
          onSelect={go}
          todayYmd={todayYmd}
        />
        <NavButton
          dir="next"
          onClick={() => go(nextYmd)}
          disabled={!nextYmd}
        />
      </div>

      {games.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((g) => (
            <LiveGameCard
              key={g.gameId}
              card={g}
            />
          ))}
        </div>
      ) : (
        <div className="flex h-[200px] items-center justify-center text-[var(--color-muted)]">이 날은 경기가 없습니다.</div>
      )}
    </div>
  );
}

function NavButton({ dir, onClick, disabled }: { dir: "prev" | "next"; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "prev" ? "이전 경기일" : "다음 경기일"}
      className="flex h-10 w-10 cursor-pointer items-center justify-center text-[var(--color-muted)] transition-colors hover:text-[var(--color-fg)] disabled:cursor-default disabled:opacity-20"
    >
      <svg
        className="h-7 w-7"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {dir === "prev" ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
      </svg>
    </button>
  );
}
