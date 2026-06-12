/**
 * Diagnostic for wiring the win-probability crawler. Run this the moment network
 * egress to api-gw.sports.naver.com is allowed. It picks a recent finished game
 * (or one you pass) and reports, per candidate endpoint, the HTTP status, byte
 * size, whether our extractor found a series, and a short JSON preview — so you
 * can confirm the real endpoint/shape and adjust lib/scraper.ts.
 *
 *   npm run probe:winprob                       # auto-pick a recent game
 *   npm run probe:winprob -- 20250405LTSS02025  # a specific Naver gameId
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { listGames } from "../lib/naver";
import { probeWinProbEndpoints, fetchGameWinProb } from "../lib/scraper";
import { REGULAR_SEASON_START_DATES } from "../lib/seasons";

async function pickRecentGameId(): Promise<string | null> {
  const year = new Date().getFullYear();
  for (const season of [year, year - 1]) {
    const start = REGULAR_SEASON_START_DATES[season];
    if (!start) continue;
    const games = (await listGames(start, `${season}1231`))
      .filter((g) => g.roundCode === "kbo_r" && !g.cancel && g.statusCode === "RESULT")
      .sort((a, b) => (a.gameDate < b.gameDate ? 1 : -1));
    if (games.length) return games[0].gameId;
  }
  return null;
}

async function main() {
  const gameId = process.argv[2] ?? (await pickRecentGameId());
  if (!gameId) {
    console.error("Could not find a finished game to probe. Pass a gameId explicitly.");
    process.exit(1);
  }
  console.log(`Probing win-probability endpoints for game ${gameId}\n`);

  const results = await probeWinProbEndpoints(gameId);
  for (const r of results) {
    console.log(`── ${r.name} ──`);
    console.log(`   ${r.url}`);
    console.log(`   status=${r.status} bytes=${r.bytes} extractedSeriesLen=${r.seriesLen}`);
    console.log(`   preview: ${r.preview.replace(/\s+/g, " ").slice(0, 200)}\n`);
  }

  const wp = await fetchGameWinProb(gameId);
  if (wp) {
    console.log(`✓ fetchGameWinProb parsed ${wp.home.length} points.`);
    console.log(`  home: open=${wp.home[0]} max=${Math.max(...wp.home)} min=${Math.min(...wp.home)} close=${wp.home.at(-1)}`);
  } else {
    console.log("✗ fetchGameWinProb found no parseable series — adjust WINPROB_CANDIDATES / extractHomeWinProbSeries.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
