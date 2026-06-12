import { CODE_TO_TEAM } from "./teams";
import { dashed } from "./seasons";

const BASE_URL = "https://api-gw.sports.naver.com/schedule/games";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36",
  "content-type": "application/json",
  charset: "utf-8",
};

export type GameResultRow = {
  season: number;
  team: string; // Korean team name
  gameId: string;
  gameDate: string; // YYYY-MM-DD
  result: "w" | "l" | "d";
};

type NaverGame = {
  gameId?: string;
  gameDate?: string; // YYYY-MM-DD
  homeTeamCode?: string;
  awayTeamCode?: string;
  winner?: string; // HOME | AWAY | DRAW
  statusCode?: string; // RESULT when finished
  cancel?: boolean;
  roundCode?: string; // kbo_r for regular season
};

const lastDayOfMonth = (year: number, month: number) =>
  new Date(year, month, 0).getDate(); // month is 1-based here

// Enumerate the (year, month) pairs spanned by [fromYmd, toYmd] (YYYYMMDD).
function monthsBetween(fromYmd: string, toYmd: string): [number, number][] {
  const fy = Number(fromYmd.slice(0, 4));
  const fm = Number(fromYmd.slice(4, 6));
  const ty = Number(toYmd.slice(0, 4));
  const tm = Number(toYmd.slice(4, 6));
  const out: [number, number][] = [];
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    out.push([y, m]);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function resultForTeam(game: NaverGame, isHome: boolean): "w" | "l" | "d" {
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

  for (const [year, month] of monthsBetween(fromYmd, toYmd)) {
    const params = new URLSearchParams({
      fields: "basic,schedule,baseball",
      upperCategoryId: "kbaseball",
      categoryId: "kbo",
      fromDate: `${year}-${String(month).padStart(2, "0")}-01`,
      toDate: `${year}-${String(month).padStart(2, "0")}-${String(
        lastDayOfMonth(year, month),
      ).padStart(2, "0")}`,
      size: "500",
    });

    const res = await fetch(`${BASE_URL}?${params.toString()}`, {
      headers: HEADERS,
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Naver API ${res.status} for ${year}-${month}`);
    }
    const json = (await res.json()) as {
      result?: { games?: NaverGame[] };
    };
    const games = json.result?.games ?? [];

    for (const game of games) {
      const gameId = game.gameId ?? "";
      const gameDate = game.gameDate ?? ""; // YYYY-MM-DD

      if (game.roundCode !== "kbo_r") continue; // exclude preseason/postseason
      if (!gameId || !gameDate) continue;
      if (gameDate < fromDash || gameDate > toDash) continue;
      if (game.cancel) continue; // skip cancelled
      if (game.statusCode !== "RESULT") continue; // skip unfinished

      for (const [code, isHome] of [
        [game.homeTeamCode, true],
        [game.awayTeamCode, false],
      ] as const) {
        const team = code ? CODE_TO_TEAM[code] : undefined;
        if (!team) continue; // not a tracked team
        const key = `${gameId}:${team}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          season,
          team,
          gameId,
          gameDate,
          result: resultForTeam(game, isHome),
        });
      }
    }
  }

  return rows;
}
