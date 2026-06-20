import Link from "next/link";
import type { LiveGameCard } from "@/lib/live";
import { LiveBoard } from "./LiveBoard";

// Shared chrome for the LIVE page, rendered by both /live and /live/[date].
export function LiveScreen({
  ymd,
  games,
  navDates,
  today,
}: {
  ymd: string;
  games: LiveGameCard[];
  navDates: string[];
  today: string;
}) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8">
      <header className="mb-8 flex items-center justify-between gap-3 border-b border-[var(--color-line)] pb-3">
        <h1 className="text-[28px] font-bold leading-none tracking-tight text-[var(--color-fg)]">
          경기별 <span className="font-normal text-[var(--color-muted)]">승리확률</span>
        </h1>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-1.5 text-[13px] font-medium text-[var(--color-muted)] transition-colors hover:bg-[var(--color-panel-2)]/60 hover:text-[var(--color-fg)]"
        >
          ← 순위
        </Link>
      </header>

      <LiveBoard initialYmd={ymd} initialGames={games} dates={navDates} todayYmd={today} />
    </main>
  );
}
