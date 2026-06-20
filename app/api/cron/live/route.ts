import { NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { fetchLiveGames } from "@/lib/live";
import { getWinProbRowsByDate, upsertLiveWinProb } from "@/lib/data";
import { REGULAR_SEASON_START_DATES } from "@/lib/seasons";
import { kstYmd } from "@/lib/dates";

// Hit every minute by an external scheduler (cron-job.org) during game hours.
// Self-gating: when no game is in progress it returns almost immediately without
// touching the relay endpoint, so off-hours calls cost next to nothing. Vercel
// Hobby cron can't run sub-daily, hence the external trigger.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const today = kstYmd();
  const season = Number(today.slice(0, 4));

  // Off-season: nothing to do.
  const start = REGULAR_SEASON_START_DATES[season];
  if (start && today < start) {
    return NextResponse.json({ ok: true, skipped: "before-season", today });
  }

  const prev = await getWinProbRowsByDate(today);
  const prevRows = prev.map((r) => ({
    team: r.team,
    gameId: r.gameId,
    series: r.series,
    innings: r.innings,
    status: r.status,
  }));

  const { rows, liveCount, finishedCount } = await fetchLiveGames(season, today, prevRows);

  let upserted = 0;
  if (rows.length > 0) {
    upserted = await upsertLiveWinProb(season, rows);
    // Refresh the cached win-prob payload so fresh page loads include live state.
    revalidateTag("winprob-payload");
    // A finished game changes standings/cumulative lines — regenerate the static
    // season pages too. Live-only ticks rely on client polling instead (cheaper).
    if (finishedCount > 0) revalidatePath("/[season]", "page");
  }

  return NextResponse.json({ ok: true, today, season, liveCount, finishedCount, upserted });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
