import { eq } from "drizzle-orm";
import { getDb, hasDb } from "./db";
import { teamGameResults } from "./db/schema";
import type { GameResultRow } from "./scraper";
import { buildChartPayload, type ChartPayload, type StatRow } from "./stats";

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

async function readSnapshot(season: number): Promise<StatRow[]> {
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const file = path.join(process.cwd(), "data", `${season}.json`);
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as StatRow[];
  } catch {
    return [];
  }
}
