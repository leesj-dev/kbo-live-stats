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
import { REGULAR_SEASON_START_DATES } from "../lib/seasons";

function todayKstYmd(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}${String(kst.getUTCMonth() + 1).padStart(2, "0")}${String(kst.getUTCDate()).padStart(2, "0")}`;
}

async function main() {
  const season = Number(process.argv[2]);
  const start = REGULAR_SEASON_START_DATES[season];
  if (!start) {
    console.error(`Unknown season: ${process.argv[2]}`);
    process.exit(1);
  }
  const today = todayKstYmd();
  const end = season < Number(today.slice(0, 4)) ? `${season}1231` : today;

  process.stdout.write(`→ ${season}: fetching ${start}–${end} ... `);
  const rows = await fetchGames(season, start, end);
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
