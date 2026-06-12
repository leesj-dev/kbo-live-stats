// Transforms crawled live win-probability extremes into per-team candlestick
// ("일봉" / daily candle) series — one candle per game, ordered by game number
// and by date. This is the win-probability analogue of lib/stats.ts and is kept
// entirely separate so the existing line chart is unaffected.
//
// Axis mapping (a team's own win probability, percent → "margin" units):
//
//     50%  → 0      (toss-up, no edge)
//    100%  → +1     (certain win   = a full +1 to the win/loss margin)
//      0%  → −1     (certain loss  = a full −1)
//
//   value(p) = (p − 50) / 50,   p ∈ [0, 100]  ⇒  value ∈ [−1, +1]
//
// A candle is then ordinary OHLC in those units:
//   open  = value(wpOpen)    body start  (≈ 0 at first pitch)
//   close = value(wpClose)   body end    (+1 win / −1 loss / 0 draw)
//   high  = value(wpHigh)    upper wick  (best moment for this team)
//   low   = value(wpLow)     lower wick  (worst moment — opponent's peak)
//
// Worked example from the spec: A beats B, but B's win prob peaked at 70%.
// From A's view its win prob bottomed at 30%, so low = (30−50)/50 = −0.4 — the
// lower wick drops to −0.4, i.e. 70% of the way from 50% (no wick) to 100%
// (full −1). A won, so close = +1 and the candle is bullish (양봉).

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
};

export type Candle = {
  game: number; // 1-based game number for this team
  date: string; // YYYY-MM-DD
  bullish: boolean; // team won / didn't lose
  // Raw percentages kept for the hover tooltip ("꼬리값").
  wpOpen: number;
  wpHigh: number; // this team's peak win prob, %
  wpLow: number; // this team's trough win prob, %
  wpClose: number;
  // Full win-probability path for the tooltip sparkline (x = plate appearance).
  series: number[]; // this team's win prob % per plate appearance
  innings: number[]; // inning number per point (aligned to series)
  subGames?: Candle[]; // DH1, DH2, etc. when combined on date view
  teamScore?: number | null;
  opponentScore?: number | null;
};

export type CandlePayload = {
  season: number;
  teams: string[]; // ranked best-first (same order as the line chart)
  dates: string[]; // shared, sorted date axis for the date view
  maxGames: number; // longest candle count across teams
  byGame: Record<string, Candle[]>;
  byDate: Record<string, (Candle | null)[]>; // aligned to `dates`; null = no game
  updatedAt: string; // ISO timestamp
};

function compareRows(a: WinProbRow, b: WinProbRow): number {
  if (a.gameDate !== b.gameDate) return a.gameDate < b.gameDate ? -1 : 1;
  return a.gameId < b.gameId ? -1 : a.gameId > b.gameId ? 1 : 0;
}

function toCandle(row: WinProbRow, game: number): Candle {
  return {
    game,
    date: row.gameDate,
    bullish: row.wpClose >= row.wpOpen,
    wpOpen: row.wpOpen,
    wpHigh: row.wpHigh,
    wpLow: row.wpLow,
    wpClose: row.wpClose,
    series: row.series,
    innings: row.innings,
    teamScore: row.teamScore,
    opponentScore: row.opponentScore,
  };
}

// `rankedTeams` (optional) fixes candle ordering to match the line chart's
// standings; teams without win-prob data are dropped from the payload.
export function buildCandlePayload(
  season: number,
  rows: WinProbRow[],
  rankedTeams?: string[],
  updatedAt: Date = new Date(),
): CandlePayload {
  const byTeamRows = new Map<string, WinProbRow[]>();
  for (const row of rows) {
    const list = byTeamRows.get(row.team) ?? [];
    list.push(row);
    byTeamRows.set(row.team, list);
  }

  const byGame: Record<string, Candle[]> = {};
  const candleByDate = new Map<string, Map<string, Candle>>();
  const allDates = new Set<string>();
  let maxGames = 0;

  for (const [team, teamRows] of byTeamRows) {
    teamRows.sort(compareRows);
    const candles: Candle[] = [];
    const dateGrouping = new Map<string, Candle[]>();
    teamRows.forEach((row, i) => {
      const candle = toCandle(row, i + 1);
      candles.push(candle);
      const group = dateGrouping.get(row.gameDate) ?? [];
      group.push(candle);
      dateGrouping.set(row.gameDate, group);
      allDates.add(row.gameDate);
    });
    byGame[team] = candles;

    const ofDate = new Map<string, Candle>();
    for (const [date, group] of dateGrouping.entries()) {
      if (group.length === 1) {
        ofDate.set(date, group[0]);
      } else {
        // combine for doubleheader
        const first = group[0];
        const last = group[group.length - 1];
        
        let currentWp = first.wpOpen;
        let maxWp = currentWp;
        let minWp = currentWp;

        for (const g of group) {
          const hD = g.wpHigh - g.wpOpen;
          const lD = g.wpLow - g.wpOpen;
          const cD = g.wpClose - g.wpOpen;
          
          maxWp = Math.max(maxWp, currentWp + hD);
          minWp = Math.min(minWp, currentWp + lD);
          currentWp += cD;
        }
        
        const wpOpen = first.wpOpen;
        const wpHigh = maxWp;
        const wpLow = minWp;
        const wpClose = currentWp;
        
        ofDate.set(date, {
          game: last.game,
          date: first.date,
          bullish: wpClose >= wpOpen,
          wpOpen,
          wpHigh,
          wpLow,
          wpClose,
          series: [], // Sparklines are drawn per subGame in the tooltip instead
          innings: [],
          subGames: group,
        });
      }
    }
    candleByDate.set(team, ofDate);
    maxGames = Math.max(maxGames, candles.length);
  }

  const dates = [...allDates].sort();

  // No forward-fill: a candle exists only on days the team actually played.
  const byDate: Record<string, (Candle | null)[]> = {};
  for (const team of byTeamRows.keys()) {
    const ofDate = candleByDate.get(team)!;
    byDate[team] = dates.map((d) => ofDate.get(d) ?? null);
  }

  const present = new Set(byTeamRows.keys());
  const teams = (rankedTeams ?? [...present].sort()).filter((t) =>
    present.has(t),
  );

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
