import { NextResponse } from "next/server";
import { getChartPayload, getWinProbPayload } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ season: string }> }
) {
  const { season: seasonStr } = await params;
  const season = Number(seasonStr);

  if (!Number.isInteger(season) || isNaN(season)) {
    return NextResponse.json({ error: "Invalid season parameter" }, { status: 400 });
  }

  try {
    // Standing order follows the standings computed in the chart payload.
    const chartPayload = await getChartPayload(season);
    const winProb = await getWinProbPayload(season, chartPayload.teams);

    return NextResponse.json(winProb, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    });
  } catch (err) {
    console.error(`Failed to generate win-probability payload for season ${season}:`, err);
    return NextResponse.json(
      { error: "Failed to fetch season win probability data" },
      { status: 500 }
    );
  }
}
