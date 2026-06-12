import { and, eq, gte, lte, sql } from "drizzle-orm";
import { dashed } from "./dates";
import { getDb, hasDb } from "./db";
import { teamGameResults, teamGameWinProb } from "./db/schema";
import type { GameResultRow } from "./scraper";
import { buildChartPayload, type ChartPayload, type StatRow } from "./stats";
import {
  buildCandlePayload,
  type CandlePayload,
  type WinProbRow,
} from "./candles";
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

// --- Win probability / candlestick -----------------------------------------

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
    })
    .from(teamGameWinProb)
    .where(eq(teamGameWinProb.season, season));
  return rows;
}

const getCachedCandlePayload = unstable_cache(
  async (season: number): Promise<CandlePayload> => {
    const rows = await getWinProbRows(season);
    return buildCandlePayload(season, rows);
  },
  ["candle-payload"],
  { revalidate: false, tags: ["candle-payload"] },
);

// `rankedTeams` (the line chart's standings) fixes candle team ordering so the
// sidebar selection lines up across both chart modes. Returns a shallow copy
// so the cached payload is never mutated.
export async function getCandlePayload(
  season: number,
  rankedTeams?: string[],
): Promise<CandlePayload> {
  const payload = await getCachedCandlePayload(season);
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
