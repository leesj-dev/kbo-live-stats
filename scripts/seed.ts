/**
 * Backfill historical KBO results into the database.
 *
 *   npm run seed            # all seasons (2015 .. current)
 *   npm run seed -- 2025    # a single season
 *
 * Requires DATABASE_URL in .env.local.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { fetchGames } from "../lib/scraper";
import { upsertResults } from "../lib/data";
import { REGULAR_SEASON_START_DATES, SEASONS } from "../lib/seasons";

function todayKstYmd(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
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

  process.stdout.write(`→ ${season}: fetching ${start}–${end} ... `);
  const rows = await fetchGames(season, start, end);
  const inserted = await upsertResults(rows);
  console.log(`${rows.length} results, ${inserted} new`);
}

async function main() {
  const arg = process.argv[2];
  const targets = arg ? [Number(arg)] : [...SEASONS].sort((a, b) => a - b);
  for (const season of targets) {
    await seedSeason(season);
  }
  console.log("done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
