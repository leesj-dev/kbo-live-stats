/**
 * Crawl a single day's KST games (results + win-probability) and upsert them
 * into the database — the same work the midnight cron does, but for one date
 * only. Handy for a manual top-up between cron runs.
 *
 *   npm run scrape:today              # today (KST)
 *   npm run scrape:today -- 20260613  # a specific date (YYYYMMDD)
 *
 * Writes to DATABASE_URL in .env.local, then pings the running server's
 * /api/revalidate so a plain browser refresh shows the new data immediately.
 * The server to revalidate defaults to http://localhost:3000; override with
 * SITE_URL (e.g. SITE_URL=https://your-app.vercel.app) to refresh production.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { fetchGames, fetchWinProbabilities } from "../lib/scraper";
import { upsertResults, upsertWinProb, getExistingWinProbGameIds } from "../lib/data";
import { REGULAR_SEASON_START_DATES } from "../lib/seasons";
import { kstYmd } from "../lib/dates";

async function main() {
  const ymd = process.argv[2] ?? kstYmd(0);
  if (!/^\d{8}$/.test(ymd)) {
    console.error(`Invalid date "${ymd}" — expected YYYYMMDD.`);
    process.exit(1);
  }
  const season = Number(ymd.slice(0, 4));

  const start = REGULAR_SEASON_START_DATES[season];
  if (start && ymd < start) {
    console.log(`· ${ymd}: before the ${season} season opener (${start}), nothing to do.`);
    return;
  }

  process.stdout.write(`→ ${ymd}: fetching results ... `);
  const rows = await fetchGames(season, ymd, ymd);
  const inserted = await upsertResults(rows);
  console.log(`${rows.length} results, ${inserted} new`);

  process.stdout.write(`→ ${ymd}: crawling win prob ... `);
  const excludeGameIds = await getExistingWinProbGameIds(season, ymd, ymd);
  const wpRows = await fetchWinProbabilities(season, ymd, ymd, { excludeGameIds });
  const wpInserted = await upsertWinProb(season, wpRows);
  console.log(`${wpRows.length} rows, ${wpInserted} new`);

  await revalidate();
  console.log("done.");
}

// Ping the running server so it purges its payload caches and regenerates the
// season pages. Best-effort: the data is already in the DB, so a failure here
// (e.g. server not running) is a warning, not an error.
async function revalidate() {
  const siteUrl = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const secret = process.env.CRON_SECRET;
  process.stdout.write(`→ revalidating ${siteUrl} ... `);
  try {
    const res = await fetch(`${siteUrl}/api/revalidate`, {
      method: "POST",
      headers: secret ? { authorization: `Bearer ${secret}` } : {},
    });
    if (res.ok) {
      console.log("ok");
    } else {
      console.log(`failed (${res.status} ${res.statusText})`);
    }
  } catch {
    console.log(`skipped — could not reach ${siteUrl}. Is the server running? Set SITE_URL to point at it.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
