import { Suspense } from "react";
import { getLiveBoardData } from "@/lib/data";
import { LiveBoard } from "@/components/live/LiveBoard";
import { SiteNav } from "@/components/ui/SiteNav";

// Always reachable (past dates browsable); defaults to the most recent day with
// games. Rendered fresh so live games show their current state on load.
export const dynamic = "force-dynamic";

async function LiveBoardContainer() {
  const { ymd, games, navDates, today } = await getLiveBoardData();
  return (
    <LiveBoard
      initialYmd={ymd}
      initialGames={games}
      dates={navDates}
      todayYmd={today}
    />
  );
}

function LiveBoardSkeleton() {
  return (
    <div>
      {/* Date Picker Placeholder */}
      <div className="mb-6 flex items-center justify-center gap-3">
        <button
          disabled
          aria-label="이전 경기일"
          className="flex h-10 w-10 cursor-default items-center justify-center text-[var(--color-muted)] opacity-20"
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
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="h-10 w-48 rounded-lg bg-[var(--color-panel-2)] shimmer" />
        <button
          disabled
          aria-label="다음 경기일"
          className="flex h-10 w-10 cursor-default items-center justify-center text-[var(--color-muted)] opacity-20"
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
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
      {/* Game Cards Skeleton Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="relative rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)]/60 p-4"
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                {/* Team 1 */}
                <div className="flex h-[20px] items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-zinc-700 shimmer" />
                  <div className="h-2.5 w-24 rounded bg-[var(--color-panel-2)] shimmer" />
                  <span className="ml-auto h-3 w-4 rounded bg-[var(--color-panel-2)] shimmer" />
                  <span className="h-2.5 w-8 rounded bg-[var(--color-panel-2)] shimmer" />
                </div>
                {/* Team 2 */}
                <div className="flex h-[20px] items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-zinc-700 shimmer" />
                  <div className="h-2.5 w-20 rounded bg-[var(--color-panel-2)] shimmer" />
                  <span className="ml-auto h-3 w-4 rounded bg-[var(--color-panel-2)] shimmer" />
                  <span className="h-2.5 w-8 rounded bg-[var(--color-panel-2)] shimmer" />
                </div>

              </div>
              {/* Status Pill */}
              <span className="mt-0.5 h-[18px] w-10 rounded-full bg-[var(--color-panel-2)] shimmer" />
            </div>
            {/* Graph Area */}
            <div className="h-[132px] rounded-lg bg-[var(--color-panel-2)]/30 shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}




export default async function LivePage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-8 sm:py-8">
      <SiteNav active="live" />
      <div className="mx-auto mt-6 w-full max-w-5xl">
        <Suspense fallback={<LiveBoardSkeleton />}>
          <LiveBoardContainer />
        </Suspense>
      </div>
    </main>
  );
}
