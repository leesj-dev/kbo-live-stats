import { notFound } from "next/navigation";
import { getChartPayload } from "@/lib/data";
import { SEASONS, isValidSeason } from "@/lib/seasons";
import { emptyChartPayload, type ChartPayload } from "@/lib/stats";
import { Dashboard } from "@/components/charts/Dashboard";

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

  let payload: ChartPayload;
  try {
    payload = await getChartPayload(season);
  } catch {
    // DB unreachable during (re)generation — render an empty shell rather than
    // failing the build; the next revalidation will retry.
    payload = emptyChartPayload(season);
  }

  return <Dashboard payload={payload} seasons={SEASONS} />;
}

