import { kstYmd } from "./dates";

// Regular-season opening dates (ported from main.py REGULAR_SEASON_START_DATES).
// Format: YYYYMMDD
export const REGULAR_SEASON_START_DATES: Record<number, string> = {
  2015: "20150328",
  2016: "20160401",
  2017: "20170331",
  2018: "20180324",
  2019: "20190323",
  2020: "20200505",
  2021: "20210403",
  2022: "20220402",
  2023: "20230401",
  2024: "20240323",
  2025: "20250322",
  2026: "20260328",
};

export const SEASONS = Object.keys(REGULAR_SEASON_START_DATES)
  .map(Number)
  .sort((a, b) => b - a); // newest first

export const LATEST_SEASON = SEASONS[0];

export const isValidSeason = (year: number) =>
  year in REGULAR_SEASON_START_DATES;

// Crawl window for a season: opener through today (KST), or through year end
// for past seasons. Null when the season is unknown or has not started yet.
export function seasonCrawlRange(
  season: number,
): { fromYmd: string; toYmd: string } | null {
  const start = REGULAR_SEASON_START_DATES[season];
  if (!start) return null;
  const today = kstYmd();
  const end = season < Number(today.slice(0, 4)) ? `${season}1231` : today;
  if (end < start) return null;
  return { fromYmd: start, toYmd: end };
}
