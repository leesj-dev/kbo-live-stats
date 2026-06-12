import { eq } from "drizzle-orm";
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

export async function getChartPayload(season: number): Promise<ChartPayload> {
  const rows = await getSeasonRows(season);
  return buildChartPayload(season, rows);
}

// Idempotent insert — duplicate (team, gameId) rows are ignored.
export async function upsertResults(rows: GameResultRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const inserted = await getDb()
    .insert(teamGameResults)
    .values(rows)
    .onConflictDoNothing({
      target: [teamGameResults.team, teamGameResults.gameId],
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
    })
    .from(teamGameWinProb)
    .where(eq(teamGameWinProb.season, season));
  return rows;
}

// Candle order follows the line chart's standings (rankedTeams), so the
// dropdown/sidebar selection lines up across both chart modes.
export async function getCandlePayload(
  season: number,
  rankedTeams?: string[],
): Promise<CandlePayload> {
  const rows = await getWinProbRows(season);
  return buildCandlePayload(season, rows, rankedTeams);
}

// Idempotent insert keyed on (team, gameId).
export async function upsertWinProb(
  season: number,
  rows: WinProbRow[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const values: NewTeamGameWinProb[] = rows.map((r) => ({ season, ...r }));
  const inserted = await getDb()
    .insert(teamGameWinProb)
    .values(values)
    .onConflictDoNothing({
      target: [teamGameWinProb.team, teamGameWinProb.gameId],
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
