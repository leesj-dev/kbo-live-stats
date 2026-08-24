import { NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { fetchLiveGames, hasActiveLiveWindow, listTodayKboGames } from "@/lib/live";
import { getWinProbRowsByDate, upsertLiveWinProb, upsertResults, upsertWinProb } from "@/lib/data";
import { fetchGames, fetchWinProbabilities } from "@/lib/scraper";
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

  // Off-season: nothing to do (cheap early-out before we even hit the schedule).
  const start = REGULAR_SEASON_START_DATES[season];
  if (start && today < start) {
    return NextResponse.json({ ok: true, skipped: "before-season", today });
  }

  // Schedule-driven gate (no DB access): only wake Neon when a game is live or
  // within its window. Skips the read/upserts overnight, on off-days, after the
  // season ends, and in seasons not yet in the table — so the compute can scale to
  // zero instead of being kept alive by a read every couple of minutes.
  const games = await listTodayKboGames(today);
  if (!hasActiveLiveWindow(games, Date.now())) {
    return NextResponse.json({ ok: true, skipped: "no-live-window", today });
  }

  const prev = await getWinProbRowsByDate(today);
  const prevRows = prev.map((r) => ({
    team: r.team,
    gameId: r.gameId,
    series: r.series,
    innings: r.innings,
    status: r.status,
  }));

  const { rows, finishedCount, allFinishedToday } = await fetchLiveGames(season, today, prevRows, games);

  let upserted = 0;
  if (rows.length > 0) {
    upserted = await upsertLiveWinProb(season, rows);
    // Refresh the cached win-prob payload so fresh page loads include live state.
    revalidateTag("winprob-payload");
    // A finished game changes standings/cumulative lines — scrape the finished game results,
    // update the database, clear the chart payload cache, and regenerate the static season pages.
    if (finishedCount > 0) {
      try {
        const resultRows = await fetchGames(season, today, today);
        if (resultRows.length > 0) {
          await upsertResults(resultRows);
        }

        if (allFinishedToday) {
          try {
            const wpRows = await fetchWinProbabilities(season, today, today);
            if (wpRows.length > 0) {
              await upsertWinProb(season, wpRows);
            }
          } catch (wpErr) {
            console.error("Failed to run final integrity check scrape for win probabilities:", wpErr);
          }
        }
      } catch (err) {
        console.error("Failed to fetch/upsert finished game results during live cron:", err);
      }
      // Always purge, even if the fetch/upsert above failed: this game is now
      // 'final' in team_game_win_prob (upsertLiveWinProb already ran above), so
      // the live cron will never retry its result fold-in on a later tick — the
      // stale season-chart cache would otherwise sit until the next daily
      // /api/cron/scrape run (up to ~24h). Re-invalidating costs only a cache
      // recompute, which is safe even if nothing new actually got written.
      revalidateTag("chart-payload");
      revalidateTag("winprob-payload");
      revalidatePath("/[season]", "page");
    }
  }

  return NextResponse.json({ ok: true, today, season, finishedCount, upserted });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
