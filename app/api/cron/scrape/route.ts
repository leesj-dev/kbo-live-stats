import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { fetchGames } from "@/lib/scraper";
import { upsertResults } from "@/lib/data";
import { LATEST_SEASON, REGULAR_SEASON_START_DATES } from "@/lib/seasons";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Returns yesterday in KST as YYYYMMDD.
function yesterdayKstYmd(): string {
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000); // shift to KST
  kstNow.setUTCDate(kstNow.getUTCDate() - 1);
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

  const ymd = dateParam ?? yesterdayKstYmd();
  const season = seasonParam ? Number(seasonParam) : Number(ymd.slice(0, 4));

  // Skip days before the season opener (off-season / preseason).
  const start = REGULAR_SEASON_START_DATES[season];
  if (start && ymd < start) {
    return NextResponse.json({ ok: true, skipped: "before-season", ymd });
  }

  const rows = await fetchGames(season, ymd, ymd);
  const inserted = await upsertResults(rows);
  // Regenerate every season page immediately (all share the /[season] route).
  revalidatePath("/[season]", "page");

  return NextResponse.json({
    ok: true,
    season,
    ymd,
    fetched: rows.length,
    inserted,
    latestSeason: LATEST_SEASON,
  });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
