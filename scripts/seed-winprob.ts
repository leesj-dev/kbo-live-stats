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
import { SEASONS, seasonCrawlRange } from "../lib/seasons";

async function seedSeason(season: number) {
  const range = seasonCrawlRange(season);
  if (!range) {
    console.log(`· ${season}: unknown season or not started yet, skipping`);
    return;
  }
  const { fromYmd, toYmd } = range;

  let hits = 0;
  let misses = 0;
  process.stdout.write(`→ ${season}: crawling win prob ${fromYmd}–${toYmd} ... `);
  const rows = await fetchWinProbabilities(season, fromYmd, toYmd, {
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
