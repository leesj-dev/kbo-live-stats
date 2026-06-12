import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { getChartPayload, KBO_TAG } from "@/lib/data";
import { SEASONS, isValidSeason } from "@/lib/seasons";
import { Dashboard } from "@/components/Dashboard";

// Pre-render every season as static HTML; the cron route regenerates them
// daily via revalidateTag(KBO_TAG). No per-request server rendering.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return SEASONS.map((season) => ({ season: String(season) }));
}

// Tagged + cached DB read so revalidateTag(KBO_TAG) can refresh the page.
const cachedPayload = (season: number) =>
  unstable_cache(() => getChartPayload(season), ["chart-payload", String(season)], {
    tags: [KBO_TAG],
  })();

export default async function SeasonPage({
  params,
}: {
  params: Promise<{ season: string }>;
}) {
  const { season: seasonStr } = await params;
  const season = Number(seasonStr);
  if (!Number.isInteger(season) || !isValidSeason(season)) notFound();

  let payload;
  try {
    payload = await cachedPayload(season);
  } catch {
    // DB unavailable at build time — render an empty shell rather than failing.
    payload = {
      season,
      teams: [],
      dates: [],
      maxGames: 0,
      byGame: {},
      byDate: {},
      updatedAt: new Date().toISOString(),
    };
  }

  return <Dashboard payload={payload} seasons={SEASONS} />;
}
