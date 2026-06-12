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

// "20250322" -> "2025-03-22"
export const dashed = (yyyymmdd: string) =>
  `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
