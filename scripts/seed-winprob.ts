/**
 * Backfill live win-probability extremes (candlestick inputs) into the database.
 *
 *   npm run seed:winprob -- 2025    # a single season
 *   npm run seed:winprob            # all seasons (2015 .. current)
 *
 * Requires DATABASE_URL in .env.local and network access to Naver.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { fetchWinProbabilities } from "../lib/scraper";
import { upsertWinProb } from "../lib/data";
import { REGULAR_SEASON_START_DATES, SEASONS } from "../lib/seasons";

function todayKstYmd(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}${String(kst.getUTCMonth() + 1).padStart(2, "0")}${String(kst.getUTCDate()).padStart(2, "0")}`;
}

async function seedSeason(season: number) {
  const start = REGULAR_SEASON_START_DATES[season];
  if (!start) {
    console.log(`× ${season}: no start date defined, skipping`);
    return;
  }
  const today = todayKstYmd();
  const end = season < Number(today.slice(0, 4)) ? `${season}1231` : today;
  if (end < start) {
    console.log(`· ${season}: season has not started yet, skipping`);
    return;
  }

  let hits = 0;
  let misses = 0;
  process.stdout.write(`→ ${season}: crawling win prob ${start}–${end} ... `);
  const rows = await fetchWinProbabilities(season, start, end, {
    onHit: () => hits++,
    onMiss: () => misses++,
  });
  const inserted = await upsertWinProb(season, rows);
  console.log(`${rows.length} rows (hit ${hits}, missed ${misses}), ${inserted} new`);
}

async function main() {
  const arg = process.argv[2];
  const targets = arg ? [Number(arg)] : [...SEASONS].filter((s) => s >= 2024).sort((a, b) => a - b);
  for (const season of targets) {
    await seedSeason(season);
  }
  console.log("done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
