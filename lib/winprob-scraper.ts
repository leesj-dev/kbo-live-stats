import { CODE_TO_TEAM } from "./teams";
import { dashed } from "./seasons";
import { listGames, naverHeaders, type ScheduleGame } from "./naver";
import type { WinProbRow } from "./candles";

// ---------------------------------------------------------------------------
// Live win-probability crawler.
//
// Naver's baseball game center renders a "승리확률" (win probability) line that
// updates every plate appearance from the 1st inning to the 9th+. We crawl that
// per-batter series for each finished game and reduce it to the four numbers a
// candle needs (open / high / low / close), from each tracked team's view.
//
// NOTE ON THE ENDPOINT: the exact win-probability endpoint + JSON shape can only
// be confirmed against the live API. This crawler therefore (1) tries a list of
// candidate endpoints in order and (2) parses the response with a tolerant,
// shape-agnostic extractor. If Naver's structure differs from every candidate,
// run `probeWinProbEndpoints(gameId)` (see scripts/probe-winprob.ts) once network
// egress to api-gw.sports.naver.com is allowed, inspect the raw JSON, and adjust
// WINPROB_CANDIDATES / extractHomeWinProbSeries below — nothing else changes.
// ---------------------------------------------------------------------------

const GAME_BASE = "https://api-gw.sports.naver.com/schedule/games";

// Candidate endpoints, tried in order until one yields a parseable series.
// `{id}` is replaced with the Naver gameId (e.g. 20250405LTSS02025).
export const WINPROB_CANDIDATES: { name: string; path: string }[] = [
  { name: "record", path: `${GAME_BASE}/{id}/record` },
  { name: "winningRate", path: `${GAME_BASE}/{id}/winningRate` },
  { name: "winRate", path: `${GAME_BASE}/{id}/winRate` },
  { name: "relay", path: `${GAME_BASE}/{id}/relay` },
  { name: "situation", path: `${GAME_BASE}/{id}/situation` },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const clampPct = (n: number) => Math.max(0, Math.min(100, n));

/**
 * Pull a home-win-probability series (percent, one point per plate appearance)
 * out of an arbitrary Naver JSON payload, without hard-coding the exact path.
 *
 * Strategy: walk the object; whenever we hit an array whose elements expose a
 * home/away win-probability pair (various key spellings) OR a plain numeric
 * array that lives next to a "win"/"prob"/"rate" key, treat it as the series.
 * The longest plausible series wins. Returns home-team win prob in [0,100].
 */
export function extractHomeWinProbSeries(json: unknown): number[] | null {
  const homeKeys = ["homeWinProb", "homeWinningRate", "homeWinRate", "hWp", "home", "homeRate"];
  const awayKeys = ["awayWinProb", "awayWinningRate", "awayWinRate", "aWp", "away", "awayRate"];

  let best: number[] | null = null;
  const consider = (s: number[]) => {
    if (s.length >= 3 && (!best || s.length > best.length)) best = s;
  };

  const pick = (o: Record<string, unknown>, keys: string[]): number | null => {
    for (const k of keys) {
      const v = o[k];
      if (typeof v === "number" && isFinite(v)) return v;
      if (typeof v === "string" && v.trim() !== "" && isFinite(Number(v))) return Number(v);
    }
    return null;
  };

  const walk = (node: unknown, keyHint = "") => {
    if (Array.isArray(node)) {
      // (a) array of {home,away} win-prob objects
      const homes: number[] = [];
      let paired = true;
      for (const el of node) {
        if (el && typeof el === "object" && !Array.isArray(el)) {
          const o = el as Record<string, unknown>;
          let h = pick(o, homeKeys);
          const a = pick(o, awayKeys);
          if (h == null && a != null) h = 100 - a; // some feeds only carry one side
          if (h != null) {
            // Normalise 0–1 probabilities to percent.
            homes.push(clampPct(h <= 1 ? h * 100 : h));
            continue;
          }
        }
        paired = false;
        break;
      }
      if (paired && homes.length) consider(homes);

      // (b) plain numeric array sitting under a win/prob/rate-ish key
      if (/win|prob|rate|wp/i.test(keyHint)) {
        const nums = node.filter((n): n is number => typeof n === "number" && isFinite(n));
        if (nums.length === node.length && nums.length >= 3) {
          const inRange = nums.every((n) => n >= 0 && n <= 100);
          if (inRange) consider(nums.map(clampPct));
          else if (nums.every((n) => n >= 0 && n <= 1)) consider(nums.map((n) => n * 100));
        }
      }

      for (const el of node) walk(el, keyHint);
    } else if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) walk(v, k);
    }
  };

  walk(json);
  return best;
}

export type GameWinProb = {
  home: number[]; // home win prob %, one per plate appearance
  away: number[]; // 100 − home
};

/** Fetch and parse the win-probability series for a single game, or null. */
export async function fetchGameWinProb(gameId: string): Promise<GameWinProb | null> {
  const referer = `https://m.sports.naver.com/game/${gameId}`;
  for (const { path } of WINPROB_CANDIDATES) {
    const url = path.replace("{id}", gameId);
    let res: Response;
    try {
      res = await fetch(url, { headers: naverHeaders(referer), cache: "no-store" });
    } catch {
      continue; // network hiccup on this candidate — try the next
    }
    if (!res.ok) continue;
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      continue;
    }
    const home = extractHomeWinProbSeries(json);
    if (home && home.length >= 3) {
      return { home, away: home.map((h) => clampPct(100 - h)) };
    }
  }
  return null;
}

function extremes(series: number[], outcomePct: number): {
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

// Final win prob to close a candle on, per team perspective.
function outcomePct(game: ScheduleGame, isHome: boolean): number {
  if (game.winner === "DRAW") return 50;
  const won = (isHome && game.winner === "HOME") || (!isHome && game.winner === "AWAY");
  return won ? 100 : 0;
}

/**
 * Crawl live win probabilities for finished KBO regular-season games within
 * [fromYmd, toYmd] (inclusive, YYYYMMDD) and reduce each to per-team candle
 * inputs. Mirrors fetchGames() but for win probability. Games whose series can't
 * be fetched/parsed are skipped (and surfaced via the `misses` callback) rather
 * than aborting the whole crawl.
 */
export async function fetchWinProbabilities(
  season: number,
  fromYmd: string,
  toYmd: string,
  opts: { onMiss?: (gameId: string) => void; onHit?: (gameId: string) => void } = {},
): Promise<WinProbRow[]> {
  const fromDash = dashed(fromYmd);
  const toDash = dashed(toYmd);
  const rows: WinProbRow[] = [];

  const games = (await listGames(fromYmd, toYmd)).filter(
    (g) =>
      g.roundCode === "kbo_r" &&
      !g.cancel &&
      g.statusCode === "RESULT" &&
      g.gameDate >= fromDash &&
      g.gameDate <= toDash,
  );

  for (const game of games) {
    const wp = await fetchGameWinProb(game.gameId);
    await sleep(jitter(350, 900)); // polite, human-ish pacing between games
    if (!wp) {
      opts.onMiss?.(game.gameId);
      continue;
    }
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
      });
    }
  }

  return rows;
}

/**
 * Diagnostic: hit every candidate endpoint for one game and report the HTTP
 * status, byte size, whether our extractor found a series, and a short JSON
 * preview. Use this the moment egress to Naver is allowed to pin down the real
 * endpoint/shape. Never called by the app itself.
 */
export async function probeWinProbEndpoints(gameId: string): Promise<
  { name: string; url: string; status: number | "ERR"; bytes: number; seriesLen: number; preview: string }[]
> {
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
