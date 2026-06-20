import { notFound } from "next/navigation";
import { getLiveBoardData } from "@/lib/data";
import { LiveScreen } from "@/components/live/LiveScreen";

export const dynamic = "force-dynamic";

export default async function LiveDatePage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!/^\d{8}$/.test(date)) notFound();
  const { ymd, games, navDates, today } = await getLiveBoardData(date);
  return <LiveScreen ymd={ymd} games={games} navDates={navDates} today={today} />;
}
