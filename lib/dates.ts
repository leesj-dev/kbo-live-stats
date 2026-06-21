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

// Formats a Date object or date string into KST "YYYY-MM-DD HH:mm",
// ensuring the output respects KST regardless of the execution environment's timezone.
export function formatKstDateTime(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;

  try {
    const formatter = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(d);
    const yyyy = parts.find((p) => p.type === "year")?.value;
    const mm = parts.find((p) => p.type === "month")?.value;
    const dd = parts.find((p) => p.type === "day")?.value;
    const hh = parts.find((p) => p.type === "hour")?.value;
    const min = parts.find((p) => p.type === "minute")?.value;
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
  } catch {
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    const yyyy = kst.getUTCFullYear();
    const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(kst.getUTCDate()).padStart(2, "0");
    const hh = String(kst.getUTCHours()).padStart(2, "0");
    const min = String(kst.getUTCMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
  }
}
