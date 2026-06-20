import type { LiveGameCard } from "@/lib/live";
import { LiveBoard } from "./LiveBoard";
import { SiteNav } from "../SiteNav";

// Shared chrome for the LIVE page, rendered by both /live and /live/[date].
export function LiveScreen({ ymd, games, navDates, today }: { ymd: string; games: LiveGameCard[]; navDates: string[]; today: string }) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8">
      <SiteNav active="live" />
      <div className="mt-6">
        <LiveBoard
          initialYmd={ymd}
          initialGames={games}
          dates={navDates}
          todayYmd={today}
        />
      </div>
    </main>
  );
}
