import { CODE_TO_TEAM } from "./teams";
import { dashed } from "./seasons";
import { listGames, type ScheduleGame } from "./naver";

export type GameResultRow = {
  season: number;
  team: string; // Korean team name
  gameId: string;
  gameDate: string; // YYYY-MM-DD
  result: "w" | "l" | "d";
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
      });
    }
  }

  return rows;
}
