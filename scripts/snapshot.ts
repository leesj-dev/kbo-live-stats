/**
 * Write a season's raw results to data/<season>.json for offline preview
 * (no database needed). The app reads these snapshots when DATABASE_URL is unset.
 *
 *   npm run snapshot -- 2025
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fetchGames } from "../lib/scraper";
import { seasonCrawlRange } from "../lib/seasons";

async function main() {
  const season = Number(process.argv[2]);
  const range = seasonCrawlRange(season);
  if (!range) {
    console.error(`Unknown or not-yet-started season: ${process.argv[2]}`);
    process.exit(1);
  }
  const { fromYmd, toYmd } = range;

  process.stdout.write(`→ ${season}: fetching ${fromYmd}–${toYmd} ... `);
  const rows = await fetchGames(season, fromYmd, toYmd);
  const dir = path.join(process.cwd(), "data");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${season}.json`);
  await writeFile(
    file,
    JSON.stringify(
      rows.map(({ team, gameId, gameDate, result }) => ({
        team,
        gameId,
        gameDate,
        result,
      })),
      null,
      0,
    ),
  );
  console.log(`${rows.length} results → ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
