import { notFound } from "next/navigation";
import { getChartPayload, getCandlePayload } from "@/lib/data";
import { SEASONS, isValidSeason } from "@/lib/seasons";
import { Dashboard } from "@/components/Dashboard";
import type { CandlePayload } from "@/lib/candles";

// Statically generated per season, refreshed via ISR (background regeneration).
// This is NOT SSR: pages are served as static HTML. They regenerate at most
// once per `revalidate` window when requested, and instantly when the cron
// route calls revalidatePath after scraping. ISR also makes the site
// self-healing — if a build runs before the DB is seeded (or without DB access),
// the empty page is replaced on the next regeneration instead of staying empty.
export const dynamicParams = false;
export const revalidate = 600;

export function generateStaticParams() {
  return SEASONS.map((season) => ({ season: String(season) }));
}

export default async function SeasonPage({
  params,
}: {
  params: Promise<{ season: string }>;
}) {
  const { season: seasonStr } = await params;
  const season = Number(seasonStr);
  if (!Number.isInteger(season) || !isValidSeason(season)) notFound();

  let payload;
  let candles: CandlePayload;
  try {
    const [p, c] = await Promise.all([
      getChartPayload(season),
      getCandlePayload(season),
    ]);
    payload = p;
    // Align candle team sorting to match payload standings (avoiding cached object mutation)
    const teamOrder = new Map(payload.teams.map((t, idx) => [t, idx]));
    const sortedTeams = [...c.teams].sort(
      (a, b) => (teamOrder.get(a) ?? 0) - (teamOrder.get(b) ?? 0)
    );
    candles = { ...c, teams: sortedTeams };
  } catch {
    // DB unreachable during (re)generation — render an empty shell rather than
    // failing the build; the next revalidation will retry.
    payload = {
      season,
      teams: [],
      dates: [],
      maxGames: 0,
      byGame: {},
      byDate: {},
      updatedAt: new Date().toISOString(),
    };
    candles = {
      season,
      teams: [],
      dates: [],
      maxGames: 0,
      byGame: {},
      byDate: {},
      updatedAt: payload.updatedAt,
    };
  }

  return <Dashboard payload={payload} candles={candles} seasons={SEASONS} />;
}
