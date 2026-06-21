import { NextResponse } from "next/server";
import { getDateGames } from "@/lib/data";
import { kstYmd } from "@/lib/dates";

// Public read endpoint: the day's slate + win-probability series for one date.
// Polled by the LIVE board (per-date) and by the season page (no date → today,
// to re-render when a game finishes). A short edge cache keeps concurrent
// viewers off the database — at most a few origin hits per minute regardless of
// traffic.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date"); // YYYYMMDD
  const ymd = dateParam && /^\d{8}$/.test(dateParam) ? dateParam : kstYmd();

  const games = await getDateGames(ymd);

  return NextResponse.json(
    { ymd, games },
    { headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=40" } },
  );
}
