/**
 * Force re-crawl and fully overwrite win-probability rows for a date, even if
 * rows already exist. Unlike `scrape:today` (which only refreshes scores on an
 * existing row via upsertWinProb), this always re-fetches from Naver and
 * overwrites the whole row — the fix for a game whose series/close got stuck
 * on a stale value (e.g. a walk-off Naver's relay never finalized).
 *
 *   npm run refetch:winprob -- 20260819
 *
 * Requires DATABASE_URL in .env.local and network access to Naver.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { fetchWinProbabilities } from "../lib/scraper";
import { upsertLiveWinProb } from "../lib/data";
import { dashed } from "../lib/dates";
import type { LiveUpsertRow } from "../lib/live";

async function main() {
  const ymd = process.argv[2];
  if (!ymd || !/^\d{8}$/.test(ymd)) {
    console.error("Usage: npm run refetch:winprob -- <YYYYMMDD>");
    process.exit(1);
  }
  const season = Number(ymd.slice(0, 4));
  const gameDate = dashed(ymd);

  process.stdout.write(`→ ${ymd}: re-crawling win prob ... `);
  const wpRows = await fetchWinProbabilities(season, ymd, ymd);
  console.log(`${wpRows.length} rows`);

  const rows: LiveUpsertRow[] = wpRows.map((r) => ({
    team: r.team,
    gameId: r.gameId,
    gameDate,
    wpOpen: r.wpOpen,
    wpHigh: r.wpHigh,
    wpLow: r.wpLow,
    wpClose: r.wpClose,
    series: r.series,
    innings: r.innings,
    teamScore: r.teamScore ?? null,
    opponentScore: r.opponentScore ?? null,
    status: "final",
    startTime: null,
    inningText: null,
    livePad: 0,
  }));

  const written = await upsertLiveWinProb(season, rows);
  console.log(`→ overwrote ${written} rows.`);

  await revalidate();
  console.log("done.");
}

async function revalidate() {
  const siteUrl = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const secret = process.env.CRON_SECRET;
  process.stdout.write(`→ revalidating ${siteUrl} ... `);
  try {
    const res = await fetch(`${siteUrl}/api/revalidate`, {
      method: "POST",
      headers: secret ? { authorization: `Bearer ${secret}` } : {},
    });
    console.log(res.ok ? "ok" : `failed (${res.status} ${res.statusText})`);
  } catch {
    console.log(`skipped — could not reach ${siteUrl}. Is the server running? Set SITE_URL to point at it.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
