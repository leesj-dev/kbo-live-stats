// Small shared helpers for the scraping / win-probability layer.

// Clamp a percentage into [0, 100].
export const clampPct = (n: number) => Math.max(0, Math.min(100, n));

// Round to one decimal place.
export const round1 = (n: number) => Math.round(n * 10) / 10;

// The opponent's win probability: 100 − ours, rounded to 0.1% and clamped.
// Only each team's own win prob is stored; the other side is always derived
// this way (lib/scraper, lib/live, lib/data).
export const complementPct = (pct: number) => clampPct(round1(100 - pct));

// Await `ms` milliseconds — used to pace scraper requests.
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A random delay in [lo, hi] ms, to jitter scraper request pacing.
export const jitter = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
