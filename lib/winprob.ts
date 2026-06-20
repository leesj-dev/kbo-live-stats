// Transforms crawled live win-probability extremes into per-team win-probability
// summaries — one summary per game, ordered by game number and by date. This is
// the win-probability companion to lib/stats.ts and is kept entirely separate so
// the existing line chart is unaffected.
//
// Axis mapping (a team's own win probability, percent → "margin" units):
//
//     50%  → 0      (toss-up, no edge)
//    100%  → +1     (certain win   = a full +1 to the win/loss margin)
//      0%  → −1     (certain loss  = a full −1)
//
//   value(p) = (p − 50) / 50,   p ∈ [0, 100]  ⇒  value ∈ [−1, +1]
//
// A game summary keeps the four numbers the detail line needs:
//   open  = value(wpOpen)    start (≈ 0 at first pitch)
//   close = value(wpClose)   end   (+1 win / −1 loss / 0 draw)
//   high  = value(wpHigh)    this team's best moment
//   low   = value(wpLow)     this team's worst moment (opponent's peak)
//
// Worked example: A beats B, but B's win prob peaked at 70%. From A's view its
// win prob bottomed at 30%, so low = (30−50)/50 = −0.4. A won, so close = +1 and
// the summary "gained" (win prob rose from open to close).

export type WinProbRow = {
  team: string;
  gameId: string;
  gameDate: string; // YYYY-MM-DD
  wpOpen: number; // %  [0,100]
  wpHigh: number; // %
  wpLow: number; // %
  wpClose: number; // %
  series: number[]; // this team's win prob %, one point per plate appearance
  innings: number[]; // inning number per point (aligned to series)
  teamScore?: number | null;
  opponentScore?: number | null;
  // Live state — present only while a game is in progress (status === 'live').
  live?: boolean;
  // Reserved trailing plate-appearance slots (≈ minimum outs remaining). 0 when
  // the game is final; >0 leaves blank space on the right of the slot so the
  // in-progress line doesn't fill the whole game width.
  livePad?: number;
};

export type WpGame = {
  game: number; // 1-based game number for this team
  gameId?: string; // Naver gameId — lets the client live-merge replace by id
  date: string; // YYYY-MM-DD
  gained: boolean; // win prob rose from open to close (team won / didn't lose)
  // Raw percentages kept for the hover tooltip ("꼬리값").
  wpOpen: number;
  wpHigh: number; // this team's peak win prob, %
  wpLow: number; // this team's trough win prob, %
  wpClose: number;
  // Full win-probability path for the tooltip sparkline (x = plate appearance).
  series: number[]; // this team's win prob % per plate appearance
  innings: number[]; // inning number per point (aligned to series)
  subGames?: WpGame[]; // DH1, DH2, etc. when combined on date view
  teamScore?: number | null;
  opponentScore?: number | null;
  // Live state — carried through so the detail chart can reserve trailing space
  // and treat the game as in-play (see appendWpPoints / DetailChart).
  live?: boolean;
  livePad?: number;
};

export type WinProbPayload = {
  season: number;
  teams: string[]; // ranked best-first (same order as the line chart)
  dates: string[]; // shared, sorted date axis for the date view
  maxGames: number; // longest game count across teams
  byGame: Record<string, WpGame[]>;
  byDate: Record<string, (WpGame | null)[]>; // aligned to `dates`; null = no game
  updatedAt: string; // ISO timestamp
};

// A close near 100% is a win and near 0% a loss; anything in between is a
// draw (or, for combined doubleheader summaries, an aggregate).
export type Outcome = "w" | "l" | "d";
export const wpOutcome = (wpClose: number): Outcome => (wpClose >= 99 ? "w" : wpClose <= 1 ? "l" : "d");

export function emptyWinProbPayload(season: number): WinProbPayload {
  return {
    season,
    teams: [],
    dates: [],
    maxGames: 0,
    byGame: {},
    byDate: {},
    updatedAt: new Date().toISOString(),
  };
}

function compareRows(a: WinProbRow, b: WinProbRow): number {
  if (a.gameDate !== b.gameDate) return a.gameDate < b.gameDate ? -1 : 1;
  return a.gameId < b.gameId ? -1 : a.gameId > b.gameId ? 1 : 0;
}

function toWpGame(row: WinProbRow, game: number): WpGame {
  return {
    game,
    gameId: row.gameId,
    date: row.gameDate,
    gained: row.wpClose >= row.wpOpen,
    wpOpen: row.wpOpen,
    wpHigh: row.wpHigh,
    wpLow: row.wpLow,
    wpClose: row.wpClose,
    series: row.series,
    innings: row.innings,
    teamScore: row.teamScore,
    opponentScore: row.opponentScore,
    live: row.live,
    livePad: row.livePad,
  };
}

// One team's perspective of a live game, used to overlay fresher in-progress
// data onto a built payload between scrapes (see mergeLiveGames).
export type LiveGamePatch = {
  team: string;
  gameId: string;
  gameDate: string; // YYYY-MM-DD
  series: number[]; // this team's win prob % per plate appearance
  innings: number[];
  livePad: number; // reserved trailing slots (≈ outs left)
};

// Overlay live-game patches onto a built payload (client-side, between server
// scrapes). A patch replaces the matching game by gameId, or is appended as the
// team's next game when the (possibly stale) payload doesn't have it yet. The
// date axis is extended for new dates; finished doubleheader combos are kept.
export function mergeLiveGames(payload: WinProbPayload, patches: LiveGamePatch[]): WinProbPayload {
  const valid = patches.filter((p) => p.series.length >= 1 && payload.teams.includes(p.team));
  if (valid.length === 0) return payload;

  const byTeam = new Map<string, LiveGamePatch[]>();
  for (const p of valid) {
    const list = byTeam.get(p.team) ?? [];
    list.push(p);
    byTeam.set(p.team, list);
  }

  const dateSet = new Set(payload.dates);
  for (const p of valid) dateSet.add(p.gameDate);
  const dates = [...dateSet].sort();

  const mk = (p: LiveGamePatch, game: number, existing?: WpGame): WpGame => ({
    game,
    gameId: p.gameId,
    date: p.gameDate,
    gained: p.series[p.series.length - 1] >= p.series[0],
    wpOpen: p.series[0],
    wpHigh: Math.max(...p.series),
    wpLow: Math.min(...p.series),
    wpClose: p.series[p.series.length - 1],
    series: p.series,
    innings: p.innings,
    teamScore: existing?.teamScore ?? null,
    opponentScore: existing?.opponentScore ?? null,
    live: true,
    livePad: p.livePad,
  });

  const byGame: Record<string, WpGame[]> = {};
  const byDate: Record<string, (WpGame | null)[]> = {};
  let maxGames = payload.maxGames;

  for (const team of payload.teams) {
    const games = [...(payload.byGame[team] ?? [])];
    const ofDate = new Map<string, WpGame | null>();
    payload.dates.forEach((d, i) => ofDate.set(d, payload.byDate[team]?.[i] ?? null));

    for (const p of byTeam.get(team) ?? []) {
      const idx = games.findIndex((g) => g.gameId === p.gameId);
      const updated = mk(p, idx >= 0 ? games[idx].game : games.length + 1, idx >= 0 ? games[idx] : undefined);
      if (idx >= 0) games[idx] = updated;
      else games.push(updated);
      ofDate.set(p.gameDate, updated);
    }

    byGame[team] = games;
    byDate[team] = dates.map((d) => ofDate.get(d) ?? null);
    maxGames = Math.max(maxGames, games.length);
  }

  return { ...payload, dates, byGame, byDate, maxGames };
}

// Teams are listed alphabetically here; lib/data.ts reorders them to match the
// line chart's standings when serving the payload.
export function buildWinProbPayload(season: number, rows: WinProbRow[], updatedAt: Date = new Date()): WinProbPayload {
  const byTeamRows = new Map<string, WinProbRow[]>();
  for (const row of rows) {
    const list = byTeamRows.get(row.team) ?? [];
    list.push(row);
    byTeamRows.set(row.team, list);
  }

  const byGame: Record<string, WpGame[]> = {};
  const gameByDate = new Map<string, Map<string, WpGame>>();
  const allDates = new Set<string>();
  let maxGames = 0;

  for (const [team, teamRows] of byTeamRows) {
    teamRows.sort(compareRows);
    const games: WpGame[] = [];
    const dateGrouping = new Map<string, WpGame[]>();
    teamRows.forEach((row, i) => {
      const wpGame = toWpGame(row, i + 1);
      games.push(wpGame);
      const group = dateGrouping.get(row.gameDate) ?? [];
      group.push(wpGame);
      dateGrouping.set(row.gameDate, group);
      allDates.add(row.gameDate);
    });
    byGame[team] = games;

    const ofDate = new Map<string, WpGame>();
    for (const [date, group] of dateGrouping.entries()) {
      if (group.length === 1) {
        ofDate.set(date, group[0]);
      } else {
        // Doubleheader: chain each game's excursion onto the previous close so
        // the combined summary spans the whole day.
        const first = group[0];
        const last = group[group.length - 1];

        let close = first.wpOpen;
        let high = close;
        let low = close;
        for (const g of group) {
          high = Math.max(high, close + (g.wpHigh - g.wpOpen));
          low = Math.min(low, close + (g.wpLow - g.wpOpen));
          close += g.wpClose - g.wpOpen;
        }

        ofDate.set(date, {
          game: last.game,
          gameId: last.gameId,
          date: first.date,
          gained: close >= first.wpOpen,
          wpOpen: first.wpOpen,
          wpHigh: high,
          wpLow: low,
          wpClose: close,
          series: [], // Sparklines are drawn per subGame in the tooltip instead
          innings: [],
          subGames: group,
        });
      }
    }
    gameByDate.set(team, ofDate);
    maxGames = Math.max(maxGames, games.length);
  }

  const dates = [...allDates].sort();

  // No forward-fill: a game exists only on days the team actually played.
  const byDate: Record<string, (WpGame | null)[]> = {};
  for (const team of byTeamRows.keys()) {
    const ofDate = gameByDate.get(team)!;
    byDate[team] = dates.map((d) => ofDate.get(d) ?? null);
  }

  const teams = [...byTeamRows.keys()].sort();

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
