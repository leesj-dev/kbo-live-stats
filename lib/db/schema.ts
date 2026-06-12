import {
  pgTable,
  serial,
  integer,
  text,
  date,
  char,
  real,
  unique,
  index,
} from "drizzle-orm/pg-core";

// One row per tracked team's perspective of a finished regular-season game.
// Cancelled / unfinished games are never stored. Cumulative stats are derived
// at read time in lib/stats.ts.
export const teamGameResults = pgTable(
  "team_game_results",
  {
    id: serial("id").primaryKey(),
    season: integer("season").notNull(),
    team: text("team").notNull(), // Korean team name (LG, 한화, ...)
    gameId: text("game_id").notNull(), // Naver gameId
    gameDate: date("game_date").notNull(), // YYYY-MM-DD
    result: char("result", { length: 1 }).notNull(), // 'w' | 'l' | 'd'
  },
  (t) => ({
    teamGameUnique: unique("team_game_unique").on(t.team, t.gameId),
    seasonIdx: index("season_idx").on(t.season),
  }),
);

export type TeamGameResult = typeof teamGameResults.$inferSelect;
export type NewTeamGameResult = typeof teamGameResults.$inferInsert;

// One row per tracked team's perspective of a finished game's live win-probability
// path. Naver publishes a per-batter win probability for every plate appearance
// (innings 1–9+). We crawl that series and keep only the four numbers a candle
// needs: the value at first pitch (open), the in-game max (high) and min (low),
// and the final outcome (close). All are this team's own win probability in
// percent [0, 100]; the opponent's is simply 100 − ours. Candle geometry is
// derived at read time in lib/candles.ts. This table is independent of
// team_game_results so the line chart keeps working with no win-prob data.
export const teamGameWinProb = pgTable(
  "team_game_win_prob",
  {
    id: serial("id").primaryKey(),
    season: integer("season").notNull(),
    team: text("team").notNull(), // Korean team name (LG, 한화, ...)
    gameId: text("game_id").notNull(), // Naver gameId
    gameDate: date("game_date").notNull(), // YYYY-MM-DD
    wpOpen: real("wp_open").notNull(), // win prob at first pitch, %
    wpHigh: real("wp_high").notNull(), // in-game maximum win prob, %
    wpLow: real("wp_low").notNull(), // in-game minimum win prob, %
    wpClose: real("wp_close").notNull(), // final win prob, % (≈100 win / 0 loss / 50 draw)
  },
  (t) => ({
    teamGameWpUnique: unique("team_game_wp_unique").on(t.team, t.gameId),
    wpSeasonIdx: index("wp_season_idx").on(t.season),
  }),
);

export type TeamGameWinProb = typeof teamGameWinProb.$inferSelect;
export type NewTeamGameWinProb = typeof teamGameWinProb.$inferInsert;
