// Shared Naver Sports access layer: realistic browser headers (so requests are
// not flagged as a bot) and a schedule enumerator used by both scrapers in
// lib/scraper.ts (game results and live win probability).
import https from "node:https";
import { dashed } from "./dates";

const SCHEDULE_URL = "https://api-gw.sports.naver.com/schedule/games";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Headers that mirror a real browser hitting the Naver Sports SPA.
export function naverHeaders(referer = "https://m.sports.naver.com/"): Record<string, string> {
  return {
    "User-Agent": UA,
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    Referer: referer,
    Origin: "https://m.sports.naver.com",
    "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
  };
}

export type NaverFetchResponse = {
  ok: boolean;
  status: number;
  json: <T = unknown>() => Promise<T>;
  text: () => Promise<string>;
};

// Reliable HTTP/1.1 client with browser ciphers to prevent TLS/H2 hangs with Naver's API gateway.
// Automatically routes via NAVER_PROXY_URL (e.g. Cloudflare Worker) if configured.
export function naverFetch(
  url: string,
  options: { headers?: Record<string, string>; timeout?: number } = {},
): Promise<NaverFetchResponse> {
  const proxyUrl = process.env.NAVER_PROXY_URL?.replace(/\/$/, "");
  const targetUrl = proxyUrl
    ? url.replace("https://api-gw.sports.naver.com", proxyUrl)
    : url;

  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      ...naverHeaders(options.headers?.Referer),
      ...options.headers,
    };
    if (proxyUrl && process.env.NAVER_PROXY_KEY) {
      headers["x-proxy-key"] = process.env.NAVER_PROXY_KEY;
    }
    const req = https.get(
      targetUrl,
      {
        headers,
        ciphers: "DEFAULT",
        timeout: options.timeout ?? 8000,
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          resolve({
            ok: res.statusCode != null && res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode ?? 0,
            json: async () => JSON.parse(data),
            text: async () => data,
          });
        });
      },
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Request timed out for ${url}`));
    });
    req.on("error", reject);
  });
}

export type ScheduleGame = {
  gameId: string;
  gameDate: string; // YYYY-MM-DD
  gameDateTime?: string; // "2026-06-19T18:30:00" (KST start), absent for some rows
  homeTeamCode: string;
  awayTeamCode: string;
  winner?: string; // HOME | AWAY | DRAW
  statusCode?: string; // STARTED while live, RESULT when finished
  statusInfo?: string; // "10회말" while live, "경기종료" etc.
  cancel?: boolean;
  roundCode?: string; // kbo_r for regular, kbo_p/kbo_ps_* for postseason, kbo_e/kbo_s for preseason
  homeTeamScore?: number;
  awayTeamScore?: number;
};

export function isRegularSeason(roundCode?: string): boolean {
  return roundCode === "kbo_r";
}

export function isPostseason(roundCode?: string): boolean {
  if (!roundCode) return false;
  return roundCode === "kbo_p" || roundCode.startsWith("kbo_ps");
}

export function isPreseason(roundCode?: string): boolean {
  return roundCode === "kbo_e" || roundCode === "kbo_s";
}

export function isTrackedKboGame(roundCode?: string): boolean {
  return isRegularSeason(roundCode) || isPostseason(roundCode) || isPreseason(roundCode);
}

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

// Fetch the raw KBO schedule for [fromYmd, toYmd] (inclusive, YYYYMMDD).
// When fromYmd === toYmd (e.g. live cron checks today), it fetches just that single
// day directly in ~30-100ms. For multi-day ranges, it fetches one calendar month per request.
export async function listGames(
  fromYmd: string,
  toYmd: string,
): Promise<ScheduleGame[]> {
  const out: ScheduleGame[] = [];
  const seen = new Set<string>();

  const dateRanges: { from: string; to: string }[] = [];
  if (fromYmd === toYmd) {
    const d = dashed(fromYmd);
    dateRanges.push({ from: d, to: d });
  } else {
    for (const [year, month] of monthsBetween(fromYmd, toYmd)) {
      dateRanges.push({
        from: `${year}-${String(month).padStart(2, "0")}-01`,
        to: `${year}-${String(month).padStart(2, "0")}-${String(
          lastDayOfMonth(year, month),
        ).padStart(2, "0")}`,
      });
    }
  }

  for (const range of dateRanges) {
    const params = new URLSearchParams({
      fields: "basic,schedule,baseball",
      upperCategoryId: "kbaseball",
      categoryId: "kbo",
      fromDate: range.from,
      toDate: range.to,
      size: "500",
    });

    const res = await naverFetch(`${SCHEDULE_URL}?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`Naver schedule ${res.status} for ${range.from}..${range.to}`);
    }
    const json = (await res.json()) as { result?: { games?: RawGame[] } };
    for (const g of json.result?.games ?? []) {
      if (!g.gameId || !g.gameDate) continue;
      if (seen.has(g.gameId)) continue;
      seen.add(g.gameId);
      out.push({
        gameId: g.gameId,
        gameDate: g.gameDate,
        gameDateTime: g.gameDateTime,
        homeTeamCode: g.homeTeamCode ?? "",
        awayTeamCode: g.awayTeamCode ?? "",
        winner: g.winner,
        statusCode: g.statusCode,
        statusInfo: g.statusInfo,
        cancel: g.cancel,
        roundCode: g.roundCode,
        homeTeamScore: g.homeTeamScore,
        awayTeamScore: g.awayTeamScore,
      });
    }
  }

  return out;
}
