import { NextResponse } from "next/server";
import { getDateGames } from "@/lib/data";
import { kstYmd } from "@/lib/dates";

// Public read endpoint: the day's slate + win-probability series for one date.
// Polled by the LIVE badge (no date → today), the LIVE board, and the main
// detail chart's live overlay. A short edge cache keeps concurrent viewers off
// the database — at most a few origin hits per minute regardless of traffic.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date"); // YYYYMMDD
  const ymd = dateParam && /^\d{8}$/.test(dateParam) ? dateParam : kstYmd();

  const games = await getDateGames(ymd);
  const liveCount = games.filter((g) => g.status === "live").length;

  return NextResponse.json(
    { ymd, liveCount, games },
    { headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=40" } },
  );
}
