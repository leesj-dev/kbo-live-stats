// Transforms raw per-team game results into cumulative win-margin / win-rate
// series, by game number and by date. Ported from main.py:98-194.

export type StatRow = {
  team: string;
  gameId: string;
  gameDate: string; // YYYY-MM-DD
  result: "w" | "l" | "d";
};

export type GamePoint = {
  game: number; // 1-based game number
  date: string; // YYYY-MM-DD
  margin: number; // wins - losses
  winRate: number; // wins / (wins + losses), 0 if none decided
};

export type DatePoint = {
  date: string; // YYYY-MM-DD
  margin: number | null; // null before the team's first game
  winRate: number | null;
};

export type ChartPayload = {
  season: number;
  teams: string[]; // ranked best-first
  dates: string[]; // shared, sorted date axis for the date view
  maxGames: number; // longest game count across teams
  byGame: Record<string, GamePoint[]>;
  byDate: Record<string, DatePoint[]>; // aligned to `dates`
  updatedAt: string; // ISO timestamp
};

function compareRows(a: StatRow, b: StatRow): number {
  if (a.gameDate !== b.gameDate) return a.gameDate < b.gameDate ? -1 : 1;
  // Deterministic intra-day order (doubleheaders) via gameId suffix.
  return a.gameId < b.gameId ? -1 : a.gameId > b.gameId ? 1 : 0;
}

export function buildChartPayload(
  season: number,
  rows: StatRow[],
  updatedAt: Date = new Date(),
): ChartPayload {
  const byTeamRows = new Map<string, StatRow[]>();
  for (const row of rows) {
    const list = byTeamRows.get(row.team) ?? [];
    list.push(row);
    byTeamRows.set(row.team, list);
  }

  const byGame: Record<string, GamePoint[]> = {};
  // End-of-date cumulative state per team, for the date view.
  const dateStateByTeam = new Map<string, Map<string, GamePoint>>();
  const allDates = new Set<string>();
  let maxGames = 0;

  for (const [team, teamRows] of byTeamRows) {
    teamRows.sort(compareRows);
    let wins = 0;
    let losses = 0;
    const points: GamePoint[] = [];
    const endOfDate = new Map<string, GamePoint>();

    teamRows.forEach((row, i) => {
      if (row.result === "w") wins += 1;
      else if (row.result === "l") losses += 1;
      const decided = wins + losses;
      const point: GamePoint = {
        game: i + 1,
        date: row.gameDate,
        margin: wins - losses,
        winRate: decided === 0 ? 0 : wins / decided,
      };
      points.push(point);
      // Last game of a given date wins (aggfunc="last" in main.py).
      endOfDate.set(row.gameDate, point);
      allDates.add(row.gameDate);
    });

    byGame[team] = points;
    dateStateByTeam.set(team, endOfDate);
    maxGames = Math.max(maxGames, points.length);
  }

  const dates = [...allDates].sort();

  // Forward-fill each team across the shared date axis (carry last known value;
  // null until the team's first game).
  const byDate: Record<string, DatePoint[]> = {};
  for (const team of byTeamRows.keys()) {
    const endOfDate = dateStateByTeam.get(team)!;
    let last: GamePoint | null = null;
    byDate[team] = dates.map((date) => {
      const today = endOfDate.get(date);
      if (today) last = today;
      return {
        date,
        margin: last ? last.margin : null,
        winRate: last ? last.winRate : null,
      };
    });
  }

  // Rank teams by final win rate (then margin, then name) — main.py ranking.
  const teams = [...byTeamRows.keys()].sort((a, b) => {
    const fa = byGame[a].at(-1);
    const fb = byGame[b].at(-1);
    const ra = fa?.winRate ?? -1;
    const rb = fb?.winRate ?? -1;
    if (rb !== ra) return rb - ra;
    const ma = fa?.margin ?? -Infinity;
    const mb = fb?.margin ?? -Infinity;
    if (mb !== ma) return mb - ma;
    return a.localeCompare(b);
  });

  return {
    season,
    teams,
    dates,
    maxGames,
    byGame,
    byDate,
    updatedAt: updatedAt.toISOString(),
  };
}
