import { and, eq, gte, lte, sql } from "drizzle-orm";
import { dashed, kstYmd } from "./dates";
import { REGULAR_SEASON_START_DATES } from "./seasons";
import { getDb, hasDb } from "./db";
import { teamGameResults, teamGameWinProb } from "./db/schema";
import type { GameResultRow } from "./scraper";
import { buildChartPayload, type ChartPayload, type StatRow } from "./stats";
import {
  buildWinProbPayload,
  type WinProbPayload,
  type WinProbRow,
} from "./winprob";
import { listGames, type ScheduleGame } from "./naver";
import { CODE_TO_TEAM } from "./teams";
import type { LiveUpsertRow, LiveGameCard } from "./live";
import type { NewTeamGameWinProb } from "./db/schema";
import { unstable_cache } from "next/cache";

// Read raw rows from Postgres, or from a local JSON snapshot when no database
// is configured (offline preview / local dev without Neon).
export async function getSeasonRows(season: number): Promise<StatRow[]> {
  if (!hasDb()) {
    return readSnapshot(season);
  }
  const rows = await getDb()
    .select({
      team: teamGameResults.team,
      gameId: teamGameResults.gameId,
      gameDate: teamGameResults.gameDate,
      result: teamGameResults.result,
    })
    .from(teamGameResults)
    .where(eq(teamGameResults.season, season));

  return rows.map((r) => ({
    team: r.team,
    gameId: r.gameId,
    gameDate: r.gameDate,
    result: r.result as StatRow["result"],
  }));
}

// Cached per season (the season argument is part of the cache key); the cron
// route purges via revalidateTag after each scrape.
export const getChartPayload = unstable_cache(
  async (season: number): Promise<ChartPayload> => {
    const rows = await getSeasonRows(season);
    return buildChartPayload(season, rows);
  },
  ["chart-payload"],
  { revalidate: false, tags: ["chart-payload"] },
);

// Idempotent insert — duplicate (team, gameId) rows are ignored.
export async function upsertResults(rows: GameResultRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const inserted = await getDb()
    .insert(teamGameResults)
    .values(rows)
    .onConflictDoUpdate({
      target: [teamGameResults.team, teamGameResults.gameId],
      set: {
        result: sql`excluded.result`,
        teamScore: sql`excluded.team_score`,
        opponentScore: sql`excluded.opponent_score`,
      },
    })
    .returning({ id: teamGameResults.id });
  return inserted.length;
}

// --- Win probability --------------------------------------------------------

export async function getWinProbRows(season: number): Promise<WinProbRow[]> {
  if (!hasDb()) {
    return readWinProbSnapshot(season);
  }
  const rows = await getDb()
    .select({
      team: teamGameWinProb.team,
      gameId: teamGameWinProb.gameId,
      gameDate: teamGameWinProb.gameDate,
      wpOpen: teamGameWinProb.wpOpen,
      wpHigh: teamGameWinProb.wpHigh,
      wpLow: teamGameWinProb.wpLow,
      wpClose: teamGameWinProb.wpClose,
      series: teamGameWinProb.wpSeries,
      innings: teamGameWinProb.wpInnings,
      teamScore: teamGameWinProb.teamScore,
      opponentScore: teamGameWinProb.opponentScore,
      status: teamGameWinProb.status,
      livePad: teamGameWinProb.livePad,
    })
    .from(teamGameWinProb)
    .where(eq(teamGameWinProb.season, season));
  // In-progress games are carried through as provisional rows (live=true), so the
  // detail chart can show a forming line; the client live-merge replaces them by
  // gameId with fresher data between scrapes.
  return rows.map((r) => ({
    team: r.team,
    gameId: r.gameId,
    gameDate: r.gameDate,
    wpOpen: r.wpOpen,
    wpHigh: r.wpHigh,
    wpLow: r.wpLow,
    wpClose: r.wpClose,
    series: r.series,
    innings: r.innings,
    teamScore: r.teamScore,
    opponentScore: r.opponentScore,
    live: r.status === "live",
    livePad: r.livePad,
  }));
}

const getCachedWinProbPayload = unstable_cache(
  async (season: number): Promise<WinProbPayload> => {
    const rows = await getWinProbRows(season);
    return buildWinProbPayload(season, rows);
  },
  ["winprob-payload"],
  { revalidate: false, tags: ["winprob-payload"] },
);

// `rankedTeams` (the line chart's standings) fixes win-prob team ordering so the
// sidebar selection lines up across both chart modes. Returns a shallow copy
// so the cached payload is never mutated.
export async function getWinProbPayload(
  season: number,
  rankedTeams?: string[],
): Promise<WinProbPayload> {
  const payload = await getCachedWinProbPayload(season);
  if (!rankedTeams) return payload;

  const teamOrder = new Map(rankedTeams.map((t, idx) => [t, idx]));
  const sortedTeams = [...payload.teams].sort(
    (a, b) => (teamOrder.get(a) ?? 0) - (teamOrder.get(b) ?? 0),
  );
  return { ...payload, teams: sortedTeams };
}

// Idempotent insert keyed on (team, gameId).
export async function upsertWinProb(
  season: number,
  rows: WinProbRow[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const values: NewTeamGameWinProb[] = rows.map(
    ({ series, innings, ...r }) => ({ season, ...r, wpSeries: series, wpInnings: innings }),
  );
  const inserted = await getDb()
    .insert(teamGameWinProb)
    .values(values)
    .onConflictDoUpdate({
      target: [teamGameWinProb.team, teamGameWinProb.gameId],
      set: {
        teamScore: sql`excluded.team_score`,
        opponentScore: sql`excluded.opponent_score`,
      },
    })
    .returning({ id: teamGameWinProb.id });
  return inserted.length;
}

async function readSnapshot(season: number): Promise<StatRow[]> {
  return readJsonSnapshot<StatRow>(`${season}.json`);
}

async function readWinProbSnapshot(season: number): Promise<WinProbRow[]> {
  return readJsonSnapshot<WinProbRow>(`${season}-winprob.json`);
}

async function readJsonSnapshot<T>(name: string): Promise<T[]> {
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const file = path.join(process.cwd(), "data", name);
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

export async function getExistingWinProbGameIds(
  season: number,
  fromYmd: string,
  toYmd: string,
): Promise<string[]> {
  if (!hasDb()) return [];
  const rows = await getDb()
    .select({ gameId: teamGameWinProb.gameId })
    .from(teamGameWinProb)
    .where(
      and(
        eq(teamGameWinProb.season, season),
        gte(teamGameWinProb.gameDate, dashed(fromYmd)),
        lte(teamGameWinProb.gameDate, dashed(toYmd)),
      ),
    );
  // De-duplicate gameIds
  return Array.from(new Set(rows.map((r) => r.gameId)));
}

// --- Live --------------------------------------------------------------------

const clampPct = (n: number) => Math.max(0, Math.min(100, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

// Upsert live (or just-finished) rows. Unlike upsertWinProb (which only refreshes
// scores), every win-prob field can change tick to tick, so the whole row is
// overwritten on conflict.
export async function upsertLiveWinProb(season: number, rows: LiveUpsertRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const values: NewTeamGameWinProb[] = rows.map((r) => ({
    season,
    team: r.team,
    gameId: r.gameId,
    gameDate: r.gameDate,
    wpOpen: r.wpOpen,
    wpHigh: r.wpHigh,
    wpLow: r.wpLow,
    wpClose: r.wpClose,
    wpSeries: r.series,
    wpInnings: r.innings,
    teamScore: r.teamScore,
    opponentScore: r.opponentScore,
    status: r.status,
    startTime: r.startTime,
    inningText: r.inningText,
    livePad: r.livePad,
  }));
  const inserted = await getDb()
    .insert(teamGameWinProb)
    .values(values)
    .onConflictDoUpdate({
      target: [teamGameWinProb.team, teamGameWinProb.gameId],
      set: {
        gameDate: sql`excluded.game_date`,
        wpOpen: sql`excluded.wp_open`,
        wpHigh: sql`excluded.wp_high`,
        wpLow: sql`excluded.wp_low`,
        wpClose: sql`excluded.wp_close`,
        wpSeries: sql`excluded.wp_series`,
        wpInnings: sql`excluded.wp_innings`,
        teamScore: sql`excluded.team_score`,
        opponentScore: sql`excluded.opponent_score`,
        status: sql`excluded.status`,
        startTime: sql`excluded.start_time`,
        inningText: sql`excluded.inning_text`,
        livePad: sql`excluded.live_pad`,
      },
    })
    .returning({ id: teamGameWinProb.id });
  return inserted.length;
}

// All stored win-prob rows for one date (both perspectives of each game). Feeds
// the live cron's incremental merge and the LIVE page's series overlay.
export async function getWinProbRowsByDate(ymd: string): Promise<
  {
    team: string;
    gameId: string;
    series: number[];
    innings: number[];
    status: string;
    teamScore: number | null;
    opponentScore: number | null;
    inningText: string | null;
    livePad: number;
  }[]
> {
  if (!hasDb()) return [];
  return getDb()
    .select({
      team: teamGameWinProb.team,
      gameId: teamGameWinProb.gameId,
      series: teamGameWinProb.wpSeries,
      innings: teamGameWinProb.wpInnings,
      status: teamGameWinProb.status,
      teamScore: teamGameWinProb.teamScore,
      opponentScore: teamGameWinProb.opponentScore,
      inningText: teamGameWinProb.inningText,
      livePad: teamGameWinProb.livePad,
    })
    .from(teamGameWinProb)
    .where(eq(teamGameWinProb.gameDate, dashed(ymd)));
}

// The full slate for a date — the games themselves from the Naver schedule (so
// cancelled and not-yet-started games appear), joined with stored win-prob
// series. away series is derived as 100 − home. Falls back to DB-only when the
// schedule is unreachable.
export async function getDateGames(ymd: string): Promise<LiveGameCard[]> {
  const dash = dashed(ymd);
  const dbRows = await getWinProbRowsByDate(ymd);
  const byGameTeam = new Map<string, Map<string, (typeof dbRows)[number]>>();
  for (const r of dbRows) {
    let m = byGameTeam.get(r.gameId);
    if (!m) byGameTeam.set(r.gameId, (m = new Map()));
    m.set(r.team, r);
  }

  let schedule: ScheduleGame[] = [];
  try {
    schedule = (await listGames(ymd, ymd)).filter((g) => g.roundCode === "kbo_r" && g.gameDate === dash);
  } catch {
    schedule = [];
  }

  if (schedule.length === 0) {
    // Schedule unavailable: reconstruct from stored rows (no cancelled games,
    // team orientation arbitrary — best effort for past dates while offline).
    return [...byGameTeam.entries()].map(([gameId, teams]) => {
      const [a, b] = [...teams.values()];
      const homeSeries = a?.series ?? [];
      return {
        gameId,
        gameDate: dash,
        status: a?.status === "live" || b?.status === "live" ? "live" : "final",
        homeTeam: a?.team ?? "",
        awayTeam: b?.team ?? "",
        homeScore: a?.teamScore ?? null,
        awayScore: b?.teamScore ?? null,
        inningText: a?.inningText ?? b?.inningText ?? null,
        startTime: null,
        homeSeries,
        awaySeries: b?.series ?? homeSeries.map((v) => clampPct(round1(100 - v))),
        innings: a?.innings ?? b?.innings ?? [],
        livePad: a?.livePad ?? b?.livePad ?? 0,
      } satisfies LiveGameCard;
    });
  }

  return schedule.map((g) => {
    const homeTeam = CODE_TO_TEAM[g.homeTeamCode] ?? g.homeTeamCode;
    const awayTeam = CODE_TO_TEAM[g.awayTeamCode] ?? g.awayTeamCode;
    const teams = byGameTeam.get(g.gameId);
    const homeRow = teams?.get(homeTeam);
    const awayRow = teams?.get(awayTeam);
    const homeSeries = homeRow?.series ?? (awayRow ? awayRow.series.map((v) => clampPct(round1(100 - v))) : []);
    const status: LiveGameCard["status"] = g.cancel
      ? "cancel"
      : g.statusCode === "STARTED"
        ? "live"
        : g.statusCode === "RESULT"
          ? "final"
          : "scheduled";
    return {
      gameId: g.gameId,
      gameDate: g.gameDate,
      status,
      homeTeam,
      awayTeam,
      homeScore: homeRow?.teamScore ?? g.homeTeamScore ?? null,
      awayScore: awayRow?.teamScore ?? g.awayTeamScore ?? null,
      inningText: homeRow?.inningText ?? awayRow?.inningText ?? (status === "live" ? g.statusInfo ?? null : null),
      startTime: g.gameDateTime ?? null,
      homeSeries,
      awaySeries: homeSeries.map((v) => clampPct(round1(100 - v))),
      innings: homeRow?.innings ?? awayRow?.innings ?? [],
      livePad: homeRow?.livePad ?? awayRow?.livePad ?? 0,
    } satisfies LiveGameCard;
  });
}

// Distinct dates (YYYY-MM-DD, ascending) that have win-probability data — the
// navigable date axis for the LIVE page. Excludes days with no games.
export async function getGameDates(): Promise<string[]> {
  if (!hasDb()) return [];
  const rows = await getDb()
    .selectDistinct({ gameDate: teamGameWinProb.gameDate })
    .from(teamGameWinProb)
    .orderBy(teamGameWinProb.gameDate);
  return rows.map((r) => r.gameDate);
}

// Everything the LIVE page needs for a date: the slate, the navigable dates (DB
// dates plus today during the season, so today is always reachable), and the
// resolved date (defaults to the most recent day with data).
export async function getLiveBoardData(requestedYmd?: string): Promise<{
  ymd: string;
  games: LiveGameCard[];
  navDates: string[];
  today: string;
}> {
  const dates = await getGameDates();
  const today = kstYmd();
  const start = REGULAR_SEASON_START_DATES[Number(today.slice(0, 4))];
  const navSet = new Set(dates);
  if (start && today >= start) navSet.add(dashed(today));
  const navDates = [...navSet].sort();
  const ymd = requestedYmd ?? (dates.length ? dates[dates.length - 1].replace(/-/g, "") : today);
  const games = await getDateGames(ymd);
  return { ymd, games, navDates, today };
}
