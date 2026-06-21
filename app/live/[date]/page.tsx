import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getLiveBoardData } from "@/lib/data";
import { LiveBoard } from "@/components/live/LiveBoard";
import { SiteNav } from "@/components/ui/SiteNav";

export const dynamic = "force-dynamic";

async function LiveBoardContainer({ date }: { date: string }) {
  const { ymd, games, navDates, today } = await getLiveBoardData(date);
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
        <div className="h-10 w-10 animate-pulse rounded bg-[var(--color-panel-2)]" />
        <div className="h-10 w-48 animate-pulse rounded bg-[var(--color-panel-2)]" />
        <div className="h-10 w-10 animate-pulse rounded bg-[var(--color-panel-2)]" />
      </div>
      {/* Game Cards Skeleton Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-44 animate-pulse rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)]"
          />
        ))}
      </div>
    </div>
  );
}

export default async function LiveDatePage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!/^\d{8}$/.test(date)) notFound();

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-8 sm:py-8">
      <SiteNav active="live" />
      <div className="mx-auto mt-6 w-full max-w-5xl">
        <Suspense fallback={<LiveBoardSkeleton />}>
          <LiveBoardContainer date={date} />
        </Suspense>
      </div>
    </main>
  );
}
