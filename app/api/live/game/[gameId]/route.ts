import { NextResponse } from "next/server";
import { fetchGamePlays } from "@/lib/plays";

// Per-plate detail for one game, fetched lazily when a LIVE card is hovered.
// Edge-cached briefly so repeated hovers (and concurrent viewers) don't re-crawl.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  if (!/^[0-9A-Za-z]+$/.test(gameId)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }
  const plays = await fetchGamePlays(gameId);
  return NextResponse.json(
    { gameId, plays },
    { headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=60" } },
  );
}
