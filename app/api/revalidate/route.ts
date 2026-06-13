import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

// Purge the server-side payload caches and regenerate the season pages, without
// re-scraping. The midnight cron does this inline after a scrape; the standalone
// `npm run scrape:today` script (a separate process that can't call
// revalidateTag directly) hits this endpoint so a plain browser refresh shows
// the new data immediately.
export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  revalidateTag("chart-payload");
  revalidateTag("candle-payload");
  revalidatePath("/[season]", "page");
  return NextResponse.json({ ok: true, revalidated: ["chart-payload", "candle-payload", "/[season]"] });
}

export async function POST(req: Request) {
  return handle(req);
}
