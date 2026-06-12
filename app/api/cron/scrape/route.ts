import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { fetchGames, fetchWinProbabilities } from "@/lib/scraper";
import { upsertResults, upsertWinProb, getExistingWinProbGameIds } from "@/lib/data";
import { LATEST_SEASON, REGULAR_SEASON_START_DATES } from "@/lib/seasons";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Returns KST date YYYYMMDD with an optional day offset.
function getKstYmd(offsetDays: number = 0): string {
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000); // shift to KST
  if (offsetDays !== 0) {
    kstNow.setUTCDate(kstNow.getUTCDate() + offsetDays);
  }
  const y = kstNow.getUTCFullYear();
  const m = String(kstNow.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kstNow.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Allow ?date=YYYYMMDD&season=YYYY override for manual backfills.
  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date");
  const seasonParam = url.searchParams.get("season");

  let fromYmd: string;
  let toYmd: string;

  if (dateParam) {
    fromYmd = dateParam;
    toYmd = dateParam;
  } else {
    // Crawl both yesterday and today KST to capture late-night & extra-inning finishes
    fromYmd = getKstYmd(-1);
    toYmd = getKstYmd(0);
  }

  const season = seasonParam ? Number(seasonParam) : Number(toYmd.slice(0, 4));

  // Skip days before the season opener (off-season / preseason).
  const start = REGULAR_SEASON_START_DATES[season];
  if (start && toYmd < start) {
    return NextResponse.json({ ok: true, skipped: "before-season", fromYmd, toYmd });
  }

  // Adjust start range if fromYmd is before the season opener
  const activeFromYmd = start && fromYmd < start ? start : fromYmd;

  const rows = await fetchGames(season, activeFromYmd, toYmd);
  const inserted = await upsertResults(rows);

  // Crawl the day's live win-probability paths for the candlestick chart. Kept
  // best-effort: a failure here must not block the (already stored) results.
  let wpFetched = 0;
  let wpInserted = 0;
  try {
    const excludeGameIds = await getExistingWinProbGameIds(season, activeFromYmd, toYmd);
    const wpRows = await fetchWinProbabilities(season, activeFromYmd, toYmd, {
      excludeGameIds,
    });
    wpFetched = wpRows.length;
    wpInserted = await upsertWinProb(season, wpRows);
  } catch (err) {
    console.error("win-prob crawl failed", err);
  }

  // Purge server-side query caches and regenerate every season page immediately.
  revalidateTag("chart-payload");
  revalidateTag("candle-payload");
  revalidatePath("/[season]", "page");

  return NextResponse.json({
    ok: true,
    season,
    fromYmd: activeFromYmd,
    toYmd,
    fetched: rows.length,
    inserted,
    winProb: { fetched: wpFetched, inserted: wpInserted },
    latestSeason: LATEST_SEASON,
  });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
