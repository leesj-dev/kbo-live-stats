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
import { SEASONS, seasonCrawlRange } from "../lib/seasons";

async function seedSeason(season: number) {
  const range = seasonCrawlRange(season);
  if (!range) {
    console.log(`· ${season}: unknown season or not started yet, skipping`);
    return;
  }
  const { fromYmd, toYmd } = range;

  process.stdout.write(`→ ${season}: fetching ${fromYmd}–${toYmd} ... `);
  const rows = await fetchGames(season, fromYmd, toYmd);
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
