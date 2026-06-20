// Per-plate-appearance detail for the LIVE page hover tooltip. Parsed from the
// same Naver relay feed the win-prob scraper uses, but pulling the richer fields
// each plate appearance carries: batter, pitcher, count (B/S/O), base occupancy,
// the plate result, and any runs scored. Fetched on demand (lazily, per game) by
// /api/live/game/[gameId]; not stored, so it works the same for live and past games.

import { naverHeaders } from "./naver";

const GAME_BASE = "https://api-gw.sports.naver.com/schedule/games";
const MAX_INNING = 15;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clampPct = (n: number) => Math.max(0, Math.min(100, n));

export type PlayDetail = {
  no: number; // plate sequence (aligns with the win-prob series order)
  inn: number;
  isTop: boolean; // away batting
  batter: string | null;
  pitcher: string | null;
  balls: number;
  strikes: number;
  outs: number;
  bases: [boolean, boolean, boolean]; // 1st, 2nd, 3rd occupied
  homeScore: number;
  awayScore: number;
  result: string | null; // e.g. "중견수 플라이 아웃"; null while in progress
  scoring: string[]; // runs that crossed during the PA, e.g. ["3루주자 홈인"]
  homeWp: number; // %
  awayWp: number; // %
};

type GS = Record<string, unknown>;
type Opt = { type?: number; text?: string; currentGameState?: GS };

// pcode → player name. The full roster lives in home/awayLineup (every player who
// appeared, with names); home/awayEntry is a smaller set, kept as a fallback.
function mergeNames(tr: unknown, into: Map<string, string>) {
  const t = tr as Record<string, unknown>;
  for (const key of ["homeLineup", "awayLineup", "homeEntry", "awayEntry"]) {
    const side = t?.[key] as { batter?: unknown; pitcher?: unknown } | undefined;
    for (const grp of [side?.batter, side?.pitcher]) {
      if (Array.isArray(grp))
        for (const p of grp) {
          const pc = (p as { pcode?: unknown })?.pcode;
          const nm = (p as { name?: unknown })?.name;
          if (pc != null && typeof nm === "string" && !into.has(String(pc))) into.set(String(pc), nm);
        }
    }
  }
}

function batterFromTitle(title?: string): string | null {
  if (!title) return null;
  const m = title.match(/(?:번타자|대타|대주자)\s+(.+)$/);
  return m ? m[1].trim() : null;
}

function cleanResult(text?: string): string | null {
  if (!text) return null;
  const i = text.indexOf(" : ");
  // Drop the "타자 : " prefix and any trailing parenthetical (e.g. the throw
  // detail in "유격수 땅볼 아웃 (유격수 → 1루수 송구아웃)").
  const out = (i >= 0 ? text.slice(i + 3) : text).replace(/\s*\([^)]*\)/g, "").trim();
  return out || null;
}

// "3루주자 손아섭 : 홈인" → "3루주자 홈인" (role + 홈인, name dropped).
function scoringLabel(text: string): string {
  const left = text.split(" : ")[0].trim();
  const m = left.match(/(\d루주자|대주자|타자)/);
  return `${m ? m[1] : left} 홈인`;
}

const num = (v: unknown) => Number(v ?? 0) || 0;
const occupied = (v: unknown) => String(v ?? "0") !== "0";

function extractPlays(tr: unknown, names: Map<string, string>, out: Map<number, PlayDetail>) {
  const relays = (tr as { textRelays?: unknown })?.textRelays;
  if (!Array.isArray(relays)) return;

  for (const r of relays) {
    const mo = (r as { metricOption?: { homeTeamWinRate?: unknown; awayTeamWinRate?: unknown } })?.metricOption;
    const home = mo?.homeTeamWinRate;
    const away = mo?.awayTeamWinRate;
    if (typeof home !== "number" || typeof away !== "number") continue;
    if (Math.abs(home + away - 100) > 0.5) continue; // skip 0/0 placeholders

    const opts: Opt[] = Array.isArray((r as { textOptions?: unknown }).textOptions) ? ((r as { textOptions: Opt[] }).textOptions) : [];
    const withState = opts.filter((o) => o.currentGameState);
    const first = withState[0]?.currentGameState ?? {};
    const last = withState[withState.length - 1]?.currentGameState ?? first;

    // Count/bases snapshot: the last pitch before the result is decided (so the
    // count reflects the at-bat and the outs are the pre-result situation).
    let snap = last;
    const resIdx = opts.findIndex((o) => typeof o.type === "number" && (o.type as number) >= 13);
    if (resIdx >= 0) {
      for (let i = resIdx - 1; i >= 0; i--) {
        if (opts[i].currentGameState) {
          snap = opts[i].currentGameState as GS;
          break;
        }
      }
    }

    const resultOpt = [...opts].reverse().find((o) => o.type === 13 || o.type === 23);
    const scoring = opts.filter((o) => typeof o.text === "string" && o.text.includes("홈인")).map((o) => scoringLabel(o.text as string));

    const no = (r as { no: number }).no;
    out.set(no, {
      no,
      inn: (r as { inn: number }).inn,
      isTop: (r as { homeOrAway?: number }).homeOrAway !== 1,
      // Names by pcode (robust for pinch hitters etc.); title is the fallback.
      batter: (first.batter != null ? names.get(String(first.batter)) : null) ?? batterFromTitle((r as { title?: string }).title),
      pitcher: first.pitcher != null ? names.get(String(first.pitcher)) ?? null : null,
      balls: num(snap.ball),
      strikes: num(snap.strike),
      outs: num(snap.out),
      bases: [occupied(snap.base1), occupied(snap.base2), occupied(snap.base3)],
      homeScore: num(last.homeScore),
      awayScore: num(last.awayScore),
      result: cleanResult(resultOpt?.text),
      scoring,
      homeWp: clampPct(home),
      awayWp: clampPct(away),
    });
  }
}

/**
 * Fetch one game's full per-plate detail, ordered by plate sequence. Aligns 1:1
 * with the stored win-prob series (same valid-metric filter).
 */
export async function fetchGamePlays(gameId: string): Promise<PlayDetail[]> {
  const referer = `https://m.sports.naver.com/game/${gameId}`;
  const byNo = new Map<number, PlayDetail>();
  const names = new Map<string, string>();

  for (let inn = 1; inn <= MAX_INNING; inn++) {
    let json: unknown;
    try {
      const res = await fetch(`${GAME_BASE}/${gameId}/relay?inning=${inn}`, { headers: naverHeaders(referer), cache: "no-store" });
      if (!res.ok) continue;
      json = await res.json();
    } catch {
      continue;
    }
    const tr = (json as { result?: { textRelayData?: unknown } })?.result?.textRelayData;
    if (!tr) continue;
    mergeNames(tr, names);
    const before = byNo.size;
    extractPlays(tr, names, byNo);
    if (byNo.size === before && inn >= 9) break; // past the last played inning
    await sleep(30);
  }

  return [...byNo.values()].sort((a, b) => a.no - b.no);
}
