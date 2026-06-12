// Shared Naver Sports access layer: realistic browser headers (so requests are
// not flagged as a bot) and a schedule enumerator used by both scrapers in
// lib/scraper.ts (game results and live win probability).

const SCHEDULE_URL = "https://api-gw.sports.naver.com/schedule/games";

// A small pool of current desktop/mobile user agents. We pick one per process
// run (stable within a crawl, varied across runs) rather than hammering with a
// single fixed string.
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
];

const UA = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

// Headers that mirror a real browser hitting the Naver Sports SPA. The API
// gateway is sensitive to a missing Referer/Origin, so we always send the
// m.sports.naver.com origin that the live game center is served from.
export function naverHeaders(referer = "https://m.sports.naver.com/"): HeadersInit {
  return {
    "User-Agent": UA,
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    Referer: referer,
    Origin: "https://m.sports.naver.com",
    "content-type": "application/json",
    charset: "utf-8",
  };
}

export type ScheduleGame = {
  gameId: string;
  gameDate: string; // YYYY-MM-DD
  homeTeamCode: string;
  awayTeamCode: string;
  winner?: string; // HOME | AWAY | DRAW
  statusCode?: string; // RESULT when finished
  cancel?: boolean;
  roundCode?: string; // kbo_r for regular season
  homeTeamScore?: number;
  awayTeamScore?: number;
};

type RawGame = Partial<ScheduleGame>;

const lastDayOfMonth = (year: number, month: number) =>
  new Date(year, month, 0).getDate(); // month is 1-based here

// Enumerate the (year, month) pairs spanned by [fromYmd, toYmd] (YYYYMMDD).
export function monthsBetween(fromYmd: string, toYmd: string): [number, number][] {
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

// Fetch the raw KBO schedule for [fromYmd, toYmd] (inclusive, YYYYMMDD) one
// calendar month per request, returning every game (regardless of status).
// Callers filter for what they need.
export async function listGames(
  fromYmd: string,
  toYmd: string,
): Promise<ScheduleGame[]> {
  const out: ScheduleGame[] = [];
  const seen = new Set<string>();

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

    const res = await fetch(`${SCHEDULE_URL}?${params.toString()}`, {
      headers: naverHeaders(),
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Naver schedule ${res.status} for ${year}-${month}`);
    }
    const json = (await res.json()) as { result?: { games?: RawGame[] } };
    for (const g of json.result?.games ?? []) {
      if (!g.gameId || !g.gameDate) continue;
      if (seen.has(g.gameId)) continue;
      seen.add(g.gameId);
      out.push({
        gameId: g.gameId,
        gameDate: g.gameDate,
        homeTeamCode: g.homeTeamCode ?? "",
        awayTeamCode: g.awayTeamCode ?? "",
        winner: g.winner,
        statusCode: g.statusCode,
        cancel: g.cancel,
        roundCode: g.roundCode,
        homeTeamScore: g.homeTeamScore,
        awayTeamScore: g.awayTeamScore,
      });
    }
  }

  return out;
}
