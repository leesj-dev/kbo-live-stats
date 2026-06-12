// Date helpers shared by the scrapers, scripts, and the cron route.
// All crawl-range math is done on YYYYMMDD strings in KST.

// "20250322" -> "2025-03-22"
export const dashed = (yyyymmdd: string) =>
  `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;

// KST date as YYYYMMDD, with an optional day offset (e.g. -1 = yesterday).
export function kstYmd(offsetDays = 0): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000); // shift to KST
  if (offsetDays !== 0) {
    kst.setUTCDate(kst.getUTCDate() + offsetDays);
  }
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}
