import { CODE_TO_TEAM } from "./teams";
import { dashed } from "./seasons";
import { listGames, naverHeaders, type ScheduleGame } from "./naver";
import type { WinProbRow } from "./candles";

// ===========================================================================
// Game Results Scraper
// ===========================================================================

export type GameResultRow = {
  season: number;
  team: string; // Korean team name
  gameId: string;
  gameDate: string; // YYYY-MM-DD
  result: "w" | "l" | "d";
  teamScore?: number | null;
  opponentScore?: number | null;
};

function resultForTeam(game: ScheduleGame, isHome: boolean): "w" | "l" | "d" {
  if (game.winner === "DRAW") return "d";
  const teamWon =
    (isHome && game.winner === "HOME") || (!isHome && game.winner === "AWAY");
  return teamWon ? "w" : "l";
}

/**
 * Fetch finished KBO regular-season games within [fromYmd, toYmd] (inclusive,
 * YYYYMMDD) and flatten them into one row per tracked team's perspective.
 * Cancelled and unfinished games are skipped. Ported from main.py:38-93.
 */
export async function fetchGames(
  season: number,
  fromYmd: string,
  toYmd: string,
): Promise<GameResultRow[]> {
  const fromDash = dashed(fromYmd);
  const toDash = dashed(toYmd);
  const rows: GameResultRow[] = [];
  const seen = new Set<string>(); // `${gameId}:${team}`

  for (const game of await listGames(fromYmd, toYmd)) {
    if (game.roundCode !== "kbo_r") continue; // exclude preseason/postseason
    if (game.gameDate < fromDash || game.gameDate > toDash) continue;
    if (game.cancel) continue; // skip cancelled
    if (game.statusCode !== "RESULT") continue; // skip unfinished

    for (const [code, isHome] of [
      [game.homeTeamCode, true],
      [game.awayTeamCode, false],
    ] as const) {
      const team = code ? CODE_TO_TEAM[code] : undefined;
      if (!team) continue; // not a tracked team
      const key = `${game.gameId}:${team}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        season,
        team,
        gameId: game.gameId,
        gameDate: game.gameDate,
        result: resultForTeam(game, isHome),
        teamScore: isHome ? game.homeTeamScore : game.awayTeamScore,
        opponentScore: isHome ? game.awayTeamScore : game.homeTeamScore,
      });
    }
  }

  return rows;
}

// ===========================================================================
// Live Win Probability Scraper
// ===========================================================================

// Naver's baseball game center renders a "승리확률" (win probability) line that
// updates every plate appearance from the 1st inning to the 9th+. We crawl that
// per-batter series for each finished game and reduce it to the four numbers a
// candle needs (open / high / low / close), from each tracked team's view.
//
// THE ENDPOINT (confirmed live against api-gw.sports.naver.com, 2026-06):
// Naver serves the per-plate win-probability inside the text-relay feed, one
// inning at a time:
//
//   GET /schedule/games/{id}/relay?inning={n}
//     → result.textRelayData.textRelays[] (one entry per event, newest-first),
//       each with metricOption.{homeTeamWinRate, awayTeamWinRate, wpaByPlate}
//       and a global plate sequence number `no`.
//
// A finished game's full series is the union of innings 1..N (N≥9, extra innings
// included), de-duplicated by `no` and ordered ascending. Innings past the end
// return HTTP 200 with an empty textRelays array. The dedicated /winningRate,
// /winRate, /situation endpoints all 403 — relay is the real source.
//
// To re-confirm the shape against the live API, run `npm run probe:winprob`
// and adjust WINPROB_CANDIDATES / extractHomeWinProbSeries below.

const GAME_BASE = "https://api-gw.sports.naver.com/schedule/games";

// Safety ceiling on innings requested per game. Actual termination is the
// empty-inning break in fetchGameWinProb, not this cap. KBO regular-season extra
// innings run to the 12th through 2025 and to the 11th from 2026, so 15 leaves
// comfortable headroom either way.
const MAX_INNING = 15;

// The confirmed endpoint. `{id}` is the Naver gameId (e.g. 20250405LTSS02025);
// the crawler appends `?inning={n}`. Kept as a one-item list so the diagnostic
// probe (scripts/probe-winprob.ts) can still iterate and report on it.
export const WINPROB_CANDIDATES: { name: string; path: string }[] = [{ name: "relay", path: `${GAME_BASE}/{id}/relay` }];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const clampPct = (n: number) => Math.max(0, Math.min(100, n));

type RelayPoint = { no: number; home: number; inn: number };

/**
 * Pull the valid home-win-probability points from a single relay-inning payload.
 */
function extractInningPoints(json: unknown): RelayPoint[] {
  const relays = (json as { result?: { textRelayData?: { textRelays?: unknown } } })?.result?.textRelayData?.textRelays;
  if (!Array.isArray(relays)) return [];
  const out: RelayPoint[] = [];
  for (const r of relays) {
    if (!r || typeof r !== "object") continue;
    const no = (r as { no?: unknown }).no;
    const inn = (r as { inn?: unknown }).inn;
    const m = (r as { metricOption?: unknown }).metricOption;
    if (typeof no !== "number" || typeof inn !== "number" || !m || typeof m !== "object") continue;
    const home = (m as { homeTeamWinRate?: unknown }).homeTeamWinRate;
    const away = (m as { awayTeamWinRate?: unknown }).awayTeamWinRate;
    if (typeof home !== "number" || typeof away !== "number") continue;
    if (Math.abs(home + away - 100) > 0.5) continue; // 0/0 placeholder → skip
    out.push({ no, home: clampPct(home), inn });
  }
  return out;
}

/**
 * Extract an ordered home-win-probability series (percent, one point per plate
 * appearance) from a single relay payload.
 */
export function extractHomeWinProbSeries(json: unknown): number[] | null {
  const pts = extractInningPoints(json).sort((a, b) => a.no - b.no);
  return pts.length ? pts.map((p) => p.home) : null;
}

export type GameWinProb = {
  home: number[]; // home win prob %, one per plate appearance
  away: number[]; // 100 − home
  innings: number[]; // inning number per plate appearance (aligned to home/away)
};

/**
 * Fetch and parse the full-game win-probability series for one game, or null.
 */
export async function fetchGameWinProb(gameId: string): Promise<GameWinProb | null> {
  const referer = `https://m.sports.naver.com/game/${gameId}`;
  const base = WINPROB_CANDIDATES[0].path.replace("{id}", gameId);
  const byNo = new Map<number, { home: number; inn: number }>(); // no → point

  for (let inning = 1; inning <= MAX_INNING; inning++) {
    let res: Response;
    try {
      res = await fetch(`${base}?inning=${inning}`, {
        headers: naverHeaders(referer),
        cache: "no-store",
      });
    } catch {
      continue;
    }
    if (!res.ok) continue;
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      continue;
    }
    const pts = extractInningPoints(json);
    for (const p of pts) byNo.set(p.no, { home: p.home, inn: p.inn });
    if (!pts.length && inning >= 9) break;
    await sleep(jitter(20, 80));
  }

  if (byNo.size < 3) return null;
  const ordered = [...byNo.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p);
  const home = ordered.map((p) => p.home);
  const innings = ordered.map((p) => p.inn);
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return { home, away: home.map((h) => clampPct(round1(100 - h))), innings };
}

function extremes(
  series: number[],
  outcomePct: number,
): {
  open: number;
  high: number;
  low: number;
  close: number;
} {
  return {
    open: clampPct(series[0]),
    high: clampPct(Math.max(...series)),
    low: clampPct(Math.min(...series)),
    close: outcomePct, // deterministic body end: 100 win / 0 loss / 50 draw
  };
}

function outcomePct(game: ScheduleGame, isHome: boolean): number {
  if (game.winner === "DRAW") return 50;
  const won = (isHome && game.winner === "HOME") || (!isHome && game.winner === "AWAY");
  return won ? 100 : 0;
}

/**
 * Crawl live win probabilities for finished KBO regular-season games within
 * [fromYmd, toYmd] (inclusive, YYYYMMDD) and reduce each to per-team candle
 * inputs.
 */
export async function fetchWinProbabilities(
  season: number,
  fromYmd: string,
  toYmd: string,
  opts: {
    onMiss?: (gameId: string) => void;
    onHit?: (gameId: string) => void;
    excludeGameIds?: string[];
  } = {},
): Promise<WinProbRow[]> {
  if (season < 2024) {
    return [];
  }

  const fromDash = dashed(fromYmd);
  const toDash = dashed(toYmd);
  const rows: WinProbRow[] = [];

  let games = (await listGames(fromYmd, toYmd)).filter(
    (g) => g.roundCode === "kbo_r" && !g.cancel && g.statusCode === "RESULT" && g.gameDate >= fromDash && g.gameDate <= toDash,
  );

  if (opts.excludeGameIds) {
    const excludeSet = new Set(opts.excludeGameIds);
    games = games.filter((g) => !excludeSet.has(g.gameId));
  }

  console.log(`Found ${games.length} games to scrape.`);
  let count = 0;
  const CONCURRENCY = 5;

  const worker = async () => {
    while (true) {
      const gameIndex = count++;
      if (gameIndex >= games.length) break;
      const game = games[gameIndex];
      const localCount = gameIndex + 1;

      console.log(`[${localCount}/${games.length}] ${game.gameDate} - Scraping win prob for ${game.gameId} (${game.awayTeamCode} @ ${game.homeTeamCode})...`);
      const wp = await fetchGameWinProb(game.gameId);
      await sleep(jitter(100, 250));
      if (!wp) {
        console.log(`[${localCount}/${games.length}] ${game.gameDate} - Missed ${game.gameId}`);
        opts.onMiss?.(game.gameId);
        continue;
      }
      console.log(`[${localCount}/${games.length}] ${game.gameDate} - Success ${game.gameId} (${wp.home.length} PAs, score: ${game.awayTeamScore}:${game.homeTeamScore})`);
      opts.onHit?.(game.gameId);

      for (const [code, isHome, series] of [
        [game.homeTeamCode, true, wp.home],
        [game.awayTeamCode, false, wp.away],
      ] as const) {
        const team = code ? CODE_TO_TEAM[code] : undefined;
        if (!team || series.length < 3) continue;
        const e = extremes(series, outcomePct(game, isHome));
        rows.push({
          team,
          gameId: game.gameId,
          gameDate: game.gameDate,
          wpOpen: e.open,
          wpHigh: e.high,
          wpLow: e.low,
          wpClose: e.close,
          series,
          innings: wp.innings,
          teamScore: isHome ? game.homeTeamScore : game.awayTeamScore,
          opponentScore: isHome ? game.awayTeamScore : game.homeTeamScore,
        });
      }
    }
  };

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);

  return rows;
}

/**
 * Diagnostic: probe win probability endpoints.
 */
export async function probeWinProbEndpoints(
  gameId: string,
): Promise<{ name: string; url: string; status: number | "ERR"; bytes: number; seriesLen: number; preview: string }[]> {
  const referer = `https://m.sports.naver.com/game/${gameId}`;
  const out = [];
  for (const { name, path } of WINPROB_CANDIDATES) {
    const url = path.replace("{id}", gameId);
    try {
      const res = await fetch(url, { headers: naverHeaders(referer), cache: "no-store" });
      const text = await res.text();
      let seriesLen = 0;
      try {
        seriesLen = extractHomeWinProbSeries(JSON.parse(text))?.length ?? 0;
      } catch {
        /* not JSON */
      }
      out.push({
        name,
        url,
        status: res.status,
        bytes: text.length,
        seriesLen,
        preview: text.slice(0, 280),
      });
    } catch (err) {
      out.push({ name, url, status: "ERR" as const, bytes: 0, seriesLen: 0, preview: String(err) });
    }
    await sleep(jitter(250, 600));
  }
  return out;
}
