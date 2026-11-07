import { NextResponse } from "next/server";
import { fetchGamePlays } from "@/lib/plays";
import { getGamePlaysFromDb, upsertGamePlays } from "@/lib/data";

// Per-plate detail for one game, fetched lazily when a LIVE card is hovered.
// Stored in Neon DB so tooltips load in ~10ms without hitting Naver from Vercel.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  if (!/^[0-9A-Za-z]+$/.test(gameId)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  // 1. Check DB first (instant, <10ms, immune to external network / WAF blocks)
  try {
    const dbPlays = await getGamePlaysFromDb(gameId);
    if (dbPlays && dbPlays.length > 0) {
      return NextResponse.json(
        { gameId, plays: dbPlays },
        { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
      );
    }
  } catch (err) {
    console.error(`Failed to read plays from DB for ${gameId}:`, err);
  }

  // 2. Fall back to live scraping if not yet in DB
  const plays = await fetchGamePlays(gameId);
  if (plays.length > 0) {
    upsertGamePlays(gameId, plays).catch((err) =>
      console.error(`Failed to cache plays in DB for ${gameId}:`, err),
    );
  }

  return NextResponse.json(
    { gameId, plays },
    { headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=60" } },
  );
}
