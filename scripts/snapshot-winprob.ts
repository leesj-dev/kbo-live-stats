/**
 * Write a season's live win-probability extremes to data/<season>-winprob.json
 * for offline candlestick preview (no database needed). The app reads this
 * snapshot when DATABASE_URL is unset.
 *
 *   npm run snapshot:winprob -- 2025            # real crawl from Naver
 *   npm run snapshot:winprob -- 2025 --mock     # synthetic demo data (no network)
 *
 * The --mock mode also writes a matching data/<season>.json results snapshot if
 * one is missing, so the line chart and candle chart both have data to render.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { writeFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fetchWinProbabilities } from "../lib/winprob-scraper";
import type { WinProbRow } from "../lib/candles";
import { REGULAR_SEASON_START_DATES } from "../lib/seasons";
import { TEAM_NAMES } from "../lib/teams";

const dataDir = path.join(process.cwd(), "data");

function todayKstYmd(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}${String(kst.getUTCMonth() + 1).padStart(2, "0")}${String(kst.getUTCDate()).padStart(2, "0")}`;
}

const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n * 10) / 10));

// Plausible open/high/low/close (%) for one finished game from a team's view.
function mockExtremes(result: "w" | "l" | "d") {
  const open = clamp(rnd(45, 55));
  if (result === "d") {
    const high = clamp(rnd(60, 80));
    const low = clamp(100 - rnd(60, 80));
    return { wpOpen: open, wpHigh: Math.max(high, open), wpLow: Math.min(low, open), wpClose: 50 };
  }
  if (result === "w") {
    const low = clamp(rnd(8, 47)); // the scary dip — opponent's peak = 100 − low
    return { wpOpen: open, wpHigh: clamp(rnd(94, 100)), wpLow: Math.min(low, open), wpClose: 100 };
  }
  const high = clamp(rnd(53, 92)); // the moment they led before losing
  return { wpOpen: open, wpHigh: Math.max(high, open), wpLow: clamp(rnd(0, 6)), wpClose: 0 };
}

type ResultRow = { team: string; gameId: string; gameDate: string; result: "w" | "l" | "d" };

async function readJson<T>(name: string): Promise<T[] | null> {
  try {
    return JSON.parse(await readFile(path.join(dataDir, name), "utf8")) as T[];
  } catch {
    return null;
  }
}

// Build a synthetic season of results so both charts have data offline.
function synthResults(season: number): ResultRow[] {
  const start = new Date(`${REGULAR_SEASON_START_DATES[season].replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")}T00:00:00Z`);
  const rows: ResultRow[] = [];
  const GAMES = 60;
  TEAM_NAMES.forEach((team) => {
    for (let g = 0; g < GAMES; g++) {
      const d = new Date(start.getTime() + g * 2 * 86400000);
      const date = d.toISOString().slice(0, 10);
      const roll = Math.random();
      const result: "w" | "l" | "d" = roll < 0.48 ? "w" : roll < 0.96 ? "l" : "d";
      rows.push({ team, gameId: `${date.replace(/-/g, "")}MOCK${team}${g}`, gameDate: date, result });
    }
  });
  return rows;
}

async function runMock(season: number) {
  let results = await readJson<ResultRow>(`${season}.json`);
  if (!results) {
    results = synthResults(season);
    await writeFile(path.join(dataDir, `${season}.json`), JSON.stringify(results));
    console.log(`· no results snapshot — wrote synthetic data/${season}.json (${results.length} rows)`);
  }
  const wp: WinProbRow[] = results.map((r) => ({
    team: r.team,
    gameId: r.gameId,
    gameDate: r.gameDate,
    ...mockExtremes(r.result),
  }));
  await writeFile(path.join(dataDir, `${season}-winprob.json`), JSON.stringify(wp));
  console.log(`✓ wrote ${wp.length} mock win-prob rows → data/${season}-winprob.json`);
}

async function runReal(season: number) {
  const start = REGULAR_SEASON_START_DATES[season];
  const today = todayKstYmd();
  const end = season < Number(today.slice(0, 4)) ? `${season}1231` : today;
  let hits = 0;
  let misses = 0;
  process.stdout.write(`→ ${season}: crawling win prob ${start}–${end} ... `);
  const rows = await fetchWinProbabilities(season, start, end, {
    onHit: () => hits++,
    onMiss: () => misses++,
  });
  await writeFile(path.join(dataDir, `${season}-winprob.json`), JSON.stringify(rows));
  console.log(`${rows.length} rows (games hit ${hits}, missed ${misses}) → data/${season}-winprob.json`);
}

async function main() {
  const season = Number(process.argv[2]);
  const mock = process.argv.includes("--mock");
  if (!REGULAR_SEASON_START_DATES[season]) {
    console.error(`Unknown season: ${process.argv[2]}`);
    process.exit(1);
  }
  await mkdir(dataDir, { recursive: true });
  await (mock ? runMock(season) : runReal(season));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
