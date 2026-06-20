import { getLiveBoardData } from "@/lib/data";
import { LiveScreen } from "@/components/live/LiveScreen";

// Always reachable (past dates browsable); defaults to the most recent day with
// games. Rendered fresh so live games show their current state on load.
export const dynamic = "force-dynamic";

export default async function LivePage() {
  const { ymd, games, navDates, today } = await getLiveBoardData();
  return <LiveScreen ymd={ymd} games={games} navDates={navDates} today={today} />;
}
