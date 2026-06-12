/**
 * Manual cross-check helper. Dumps the win-probability series we extract for one
 * game, alongside the Naver game-center URL so you can eyeball it against the
 * live "승리확률" graph.
 *
 *   npm run verify:winprob -- 20250405HHSS02025
 *   npm run verify:winprob -- 20250802KTNC02025
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { naverHeaders, listGames } from "../lib/naver";
import { fetchGameWinProb } from "../lib/scraper";
import { CODE_TO_TEAM } from "../lib/teams";

const BASE = "https://api-gw.sports.naver.com/schedule/games";

async function inningSeries(gameId: string) {
  const ref = `https://m.sports.naver.com/game/${gameId}`;
  const perInning: { inn: number; homes: number[] }[] = [];
  for (let n = 1; n <= 15; n++) {
    const r = await fetch(`${BASE}/${gameId}/relay?inning=${n}`, { headers: naverHeaders(ref), cache: "no-store" });
    if (!r.ok) continue;
    const j: any = await r.json();
    const relays: any[] = j?.result?.textRelayData?.textRelays ?? [];
    if (!relays.length) { if (n >= 9) break; else continue; }
    const pts = relays
      .filter((x) => x?.metricOption && Math.abs((x.metricOption.homeTeamWinRate ?? 0) + (x.metricOption.awayTeamWinRate ?? 0) - 100) < 0.5)
      .map((x) => ({ no: x.no, home: x.metricOption.homeTeamWinRate }))
      .sort((a, b) => a.no - b.no);
    if (pts.length) perInning.push({ inn: n, homes: pts.map((p) => p.home) });
  }
  return perInning;
}

async function main() {
  const gameId = process.argv[2];
  if (!gameId) { console.error("Pass a gameId, e.g. 20250405HHSS02025"); process.exit(1); }

  // game meta (teams, winner) from the schedule
  const ymd = gameId.slice(0, 8);
  const games = await listGames(ymd, ymd);
  const g = games.find((x) => x.gameId === gameId);
  const homeName = g?.homeTeamCode ? CODE_TO_TEAM[g.homeTeamCode] : "?";
  const awayName = g?.awayTeamCode ? CODE_TO_TEAM[g.awayTeamCode] : "?";

  console.log(`\nGame ${gameId}`);
  console.log(`  ${awayName}(원정) @ ${homeName}(홈)   winner=${g?.winner ?? "?"}`);
  console.log(`  네이버: https://m.sports.naver.com/game/${gameId}/relay  (승부예측/중계 탭의 '승리확률')\n`);

  const perInning = await inningSeries(gameId);
  console.log("이닝별 홈팀 승리확률(%) 추이:");
  for (const { inn, homes } of perInning) {
    console.log(`  ${String(inn).padStart(2)}회: ${homes.join(", ")}`);
  }

  const wp = await fetchGameWinProb(gameId);
  if (!wp) { console.log("\nfetchGameWinProb returned null"); return; }
  const h = wp.home, a = wp.away;
  const fmt = (n: number) => Number(n.toFixed(1));
  console.log(`\n총 ${h.length} 포인트`);
  console.log(`\n[${homeName} (홈)]  OHLC %`);
  console.log(`  open(첫타석)=${fmt(h[0])}  high(최고)=${fmt(Math.max(...h))}  low(최저)=${fmt(Math.min(...h))}  close(결과)=${fmt(h.at(-1)!)}`);
  console.log(`[${awayName} (원정)]  OHLC %`);
  console.log(`  open(첫타석)=${fmt(a[0])}  high(최고)=${fmt(Math.max(...a))}  low(최저)=${fmt(Math.min(...a))}  close(결과)=${fmt(a.at(-1)!)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
