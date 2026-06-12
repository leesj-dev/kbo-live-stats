import {
  pgTable,
  serial,
  integer,
  text,
  date,
  char,
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
