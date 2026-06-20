// Live (in-progress) win-probability scraping. Reuses the relay endpoint that
// the finished-game scraper already speaks (lib/scraper.ts), but polls only the
// current inning each tick and merges onto the stored series, so a per-minute
// cron stays cheap. The output rows are upserted into team_game_win_prob with
// status='live' (lib/data.ts upsertLiveWinProb); when a game ends they are
// re-written as status='final' via the existing finished-game pipeline.

import { dashed } from "./dates";
import { listGames, type ScheduleGame } from "./naver";
import { CODE_TO_TEAM } from "./teams";
import { fetchRelayInning, fetchGameWinProb, fetchWinProbabilities, type RelayGameState } from "./scraper";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clampPct = (n: number) => Math.max(0, Math.min(100, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

// One row to upsert into team_game_win_prob (per team's perspective of a game).
export type LiveUpsertRow = {
  team: string;
  gameId: string;
  gameDate: string; // YYYY-MM-DD
  wpOpen: number;
  wpHigh: number;
  wpLow: number;
  wpClose: number;
  series: number[];
  innings: number[];
  teamScore: number | null;
  opponentScore: number | null;
  status: "live" | "final";
  startTime: Date | null;
  inningText: string | null;
  livePad: number;
};

// Previously-stored rows for the day, used to merge incrementally and to detect
// which games are already 'final' (so we don't re-fold them in).
export type PrevRow = { team: string; gameId: string; series: number[]; innings: number[]; status: string };

// One game's card on the LIVE page: the full slate comes from the schedule, the
// win-probability series from the DB. away series = 100 − home.
export type LiveGameCard = {
  gameId: string;
  gameDate: string; // YYYY-MM-DD
  status: "scheduled" | "live" | "final" | "cancel";
  homeTeam: string; // Korean name
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  inningText: string | null; // "10회말" while live/known
  startTime: string | null; // gameDateTime (KST)
  homeSeries: number[]; // home win prob % per plate appearance
  awaySeries: number[]; // away win prob % (= 100 − home)
  innings: number[]; // inning per point (aligned)
  livePad: number; // reserved trailing slots while live
};

// "10회말" → { inning: 10, isTop: false }. null when the text isn't an inning
// (e.g. "경기전", "경기종료"), which tells the caller to do a full crawl instead.
export function parseInning(statusInfo?: string): { inning: number; isTop: boolean } | null {
  const m = statusInfo?.match(/(\d+)\s*회\s*(초|말)/);
  if (!m) return null;
  return { inning: Number(m[1]), isTop: m[2] === "초" };
}

// Minimum plate appearances left ≈ minimum outs left until the game can end.
// Each remaining out is at least one plate appearance, so this is a hard lower
// bound the detail chart reserves as blank space on the right of the slot. Extra
// innings past the 9th are not reserved (unknown length) — the safe direction.
export function minRemainingPAs(inning: number, isTop: boolean, outs: number): number {
  const curHalf = Math.max(0, 3 - outs); // outs left in the current half-inning
  const thisInningRest = isTop ? curHalf + 3 : curHalf; // + the bottom half if top
  const fullInningsAfter = inning < 9 ? 6 * (9 - inning) : 0;
  return thisInningRest + fullInningsAfter;
}

// Incrementally fetch a live game's home-win-probability series: keep stored
// points from innings before (currentInning − 1), re-fetch the last two innings
// fresh, and concatenate. Re-fetching whole innings makes the merge clean (no
// need to track per-pitch sequence numbers across ticks).
async function fetchLiveSeries(
  gameId: string,
  currentInning: number,
  prev?: { series: number[]; innings: number[] },
): Promise<{ home: number[]; innings: number[]; state: RelayGameState | null }> {
  const hasPrev = !!prev && prev.series.length > 0;
  const startInn = hasPrev ? Math.max(1, currentInning - 1) : 1;

  const homeKept: number[] = [];
  const innKept: number[] = [];
  if (prev) {
    for (let i = 0; i < prev.series.length; i++) {
      if (prev.innings[i] < startInn) {
        homeKept.push(prev.series[i]);
        innKept.push(prev.innings[i]);
      }
    }
  }

  const fetched: { no: number; home: number; inn: number }[] = [];
  let state: RelayGameState | null = null;
  for (let inn = startInn; inn <= currentInning; inn++) {
    const r = await fetchRelayInning(gameId, inn);
    if (r.state) state = r.state;
    for (const p of r.points) fetched.push(p);
    await sleep(40);
  }
  fetched.sort((a, b) => a.no - b.no);

  return {
    home: [...homeKept, ...fetched.map((p) => clampPct(p.home))],
    innings: [...innKept, ...fetched.map((p) => p.inn)],
    state,
  };
}

function buildLiveRows(game: ScheduleGame, home: number[], innings: number[], state: RelayGameState | null, livePad: number): LiveUpsertRow[] {
  const homeName = CODE_TO_TEAM[game.homeTeamCode];
  const awayName = CODE_TO_TEAM[game.awayTeamCode];
  if (!homeName || !awayName || home.length < 1) return [];

  const away = home.map((h) => clampPct(round1(100 - h)));
  const homeScore = state?.homeScore ?? game.homeTeamScore ?? null;
  const awayScore = state?.awayScore ?? game.awayTeamScore ?? null;
  // gameDateTime is KST wall-clock; pin the offset so the instant is correct.
  const startTime = game.gameDateTime ? new Date(`${game.gameDateTime}+09:00`) : null;

  const mk = (team: string, series: number[], ts: number | null, os: number | null): LiveUpsertRow => ({
    team,
    gameId: game.gameId,
    gameDate: game.gameDate,
    wpOpen: series[0],
    wpHigh: Math.max(...series),
    wpLow: Math.min(...series),
    wpClose: series[series.length - 1],
    series,
    innings,
    teamScore: ts,
    opponentScore: os,
    status: "live",
    startTime,
    inningText: game.statusInfo ?? null,
    livePad,
  });

  return [mk(homeName, home, homeScore, awayScore), mk(awayName, away, awayScore, homeScore)];
}

/**
 * Crawl all in-progress games for `ymd` (YYYYMMDD, KST) and fold in any games
 * that have just finished. `prevRows` are the day's already-stored rows.
 */
export async function fetchLiveGames(
  season: number,
  ymd: string,
  prevRows: PrevRow[],
): Promise<{ rows: LiveUpsertRow[]; liveCount: number; finishedCount: number }> {
  const dash = dashed(ymd);
  const games = (await listGames(ymd, ymd)).filter((g) => g.roundCode === "kbo_r" && g.gameDate === dash);

  // Index prior rows: per-game home series (to merge) and per-game status (a game
  // counts as 'final' only when none of its rows are still 'live').
  const prevByGameTeam = new Map<string, Map<string, { series: number[]; innings: number[] }>>();
  const statusByGame = new Map<string, string>();
  for (const r of prevRows) {
    let m = prevByGameTeam.get(r.gameId);
    if (!m) prevByGameTeam.set(r.gameId, (m = new Map()));
    m.set(r.team, { series: r.series, innings: r.innings });
    const cur = statusByGame.get(r.gameId);
    statusByGame.set(r.gameId, cur === "live" ? "live" : r.status);
  }
  const finalGameIds = [...statusByGame.entries()].filter(([, s]) => s === "final").map(([g]) => g);

  const rows: LiveUpsertRow[] = [];
  let liveCount = 0;

  for (const game of games) {
    if (game.cancel || game.statusCode !== "STARTED") continue;
    const homeName = CODE_TO_TEAM[game.homeTeamCode];
    const prevHome = homeName ? prevByGameTeam.get(game.gameId)?.get(homeName) : undefined;

    const parsed = parseInning(game.statusInfo);
    let home: number[];
    let innings: number[];
    let state: RelayGameState | null = null;
    if (parsed) {
      ({ home, innings, state } = await fetchLiveSeries(game.gameId, parsed.inning, prevHome));
    } else {
      // statusInfo isn't an inning string — fall back to a full crawl.
      const wp = await fetchGameWinProb(game.gameId);
      if (!wp) continue;
      home = wp.home;
      innings = wp.innings;
    }

    const inning = parsed?.inning ?? (innings.length ? innings[innings.length - 1] : 9);
    const isTop = parsed?.isTop ?? false;
    const pad = minRemainingPAs(inning, isTop, state?.out ?? 0);

    const built = buildLiveRows(game, home, innings, state, pad);
    if (built.length) {
      rows.push(...built);
      liveCount++;
    }
    await sleep(80);
  }

  // Games that have ended but aren't 'final' in the DB yet → fold in through the
  // existing finished-game pipeline (full crawl, deterministic 100/0/50 close).
  // Skip entirely when nothing finished is pending, so idle ticks stay cheap.
  const finalSet = new Set(finalGameIds);
  const needFold = games.some((g) => !g.cancel && g.statusCode === "RESULT" && !finalSet.has(g.gameId));
  let finishedCount = 0;
  if (needFold)
    try {
    const finishedRows = await fetchWinProbabilities(season, ymd, ymd, { excludeGameIds: finalGameIds });
    for (const r of finishedRows) {
      rows.push({
        team: r.team,
        gameId: r.gameId,
        gameDate: r.gameDate,
        wpOpen: r.wpOpen,
        wpHigh: r.wpHigh,
        wpLow: r.wpLow,
        wpClose: r.wpClose,
        series: r.series,
        innings: r.innings,
        teamScore: r.teamScore ?? null,
        opponentScore: r.opponentScore ?? null,
        status: "final",
        startTime: null,
        inningText: null,
        livePad: 0,
      });
    }
    finishedCount = new Set(finishedRows.map((r) => r.gameId)).size;
  } catch (err) {
    console.error("live finish fold-in failed", err);
  }

  return { rows, liveCount, finishedCount };
}
