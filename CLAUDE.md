# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Next.js dev server (http://localhost:3000)
npm run build        # production build
npm run start        # serve the production build
npx tsc --noEmit     # typecheck — the real "lint" here (see note below)

npm run db:push      # push lib/db/schema.ts to Neon via drizzle-kit (no migration files)
```

Data backfill / maintenance (all read `.env.local`; crawl scripts hit the Naver API):

```bash
npm run seed [-- 2025]            # backfill game results (all seasons, or one)
npm run seed:winprob [-- 2025]    # backfill win-probability rows (seasons >= 2024 only)
npm run scrape:today [-- 20260613]  # single-day top-up (results + win prob) + revalidate
npm run snapshot -- 2025          # write data/2025.json for offline (no-DB) preview
npm run snapshot:winprob -- 2025 [--mock]  # data/2025-winprob.json (--mock = synthetic, no network)
npm run probe:winprob [-- <gameId>]   # diagnose the relay endpoint shape
npm run verify:winprob -- <gameId>    # dump one game's extracted win-prob series to eyeball vs Naver
```

Notes:
- **There is no test suite** and **no working linter**. `npm run lint` invokes the deprecated `next lint`, which prompts interactively because no ESLint config exists — don't rely on it. Use `npx tsc --noEmit` to verify changes.
- To preview without a database, run a `snapshot*` script (or `snapshot:winprob -- 2025 --mock`) and `npm run dev` — the app reads `data/*.json` when `DATABASE_URL` is unset.

## Architecture

A KBO baseball tracker with **two independent data products** that share one upstream source (Naver Sports) and one database (Neon Postgres / Drizzle), surfaced as two routes:

1. **시즌 (`/[season]`)** — season-long cumulative **win margin** (wins − losses) and **win rate** line chart.
2. **경기 (`/live`, `/live/[date]`)** — per-game **win-probability** boards (live + past), plus a "detail" overlay mode on the season chart.

### Data flow

```
Naver Sports API ─┬─ lib/naver.ts   (schedule enumeration + browser-like headers)
                  └─ lib/scraper.ts (per-plate win-prob via the relay endpoint)
        │
        ▼  (cron / scripts call the scrapers, then upsert)
   Neon Postgres ── lib/db/schema.ts: team_game_results, team_game_win_prob
        │
        ▼  lib/data.ts  (queries + unstable_cache; falls back to data/*.json when no DB)
   ChartPayload (lib/stats.ts)   WinProbPayload (lib/winprob.ts)   LiveGameCard (lib/live.ts)
        │                              │                                │
        ▼                              ▼                                ▼
   MarginChart                    DetailChart                      LiveBoard / LiveGameCard
   (components/charts)            (components/charts)              (components/live)
```

The two DB tables are **deliberately independent**: the season line chart works even with zero win-probability data. `lib/stats.ts` (results → cumulative margin/rate) is mirrored by `lib/winprob.ts` (win-prob extremes → per-game summaries) so the win-prob feature can evolve without touching the original chart.

### The Naver relay endpoint is the single source for everything win-prob

`GET https://api-gw.sports.naver.com/schedule/games/{gameId}/relay?inning={n}` returns `result.textRelayData.textRelays[]`, one entry per plate appearance. A full game = the union of innings `1..N` (extra innings included), de-duplicated by the global plate sequence `no`. From it the code derives:
- the **win-probability series** (`lib/scraper.ts` `extractInningPoints` → `homeTeamWinRate`), and
- the **per-plate detail** for tooltips (`lib/plays.ts` — batter/pitcher/count/bases/result), fetched on demand and never stored.

Each team's own win prob is stored; the opponent's is always `100 − ours`. The shape was reverse-engineered; `probe:winprob` / `verify:winprob` exist to re-confirm it if Naver changes things.

### Scrape cadences (two crons, both external)

`vercel.json` is empty and **carries no cron config** — Vercel Hobby cron is daily-only, so both schedules are driven by an **external scheduler (e.g. cron-job.org)** sending `Authorization: Bearer ${CRON_SECRET}`:
- **`/api/cron/scrape`** (daily, ~midnight KST) — crawls yesterday+today results and win prob, upserts, then revalidates.
- **`/api/cron/live`** (every minute during game hours) — **self-gating**: returns almost immediately when no game is in progress. For live games it polls only the current inning and merges onto the stored series (`lib/live.ts`); when a game finishes it folds the result into `team_game_results` through the normal finished-game pipeline.

`/api/revalidate` (POST, same bearer auth) purges caches without re-scraping — used by the standalone `scrape:today` script, which can't call `revalidateTag` from its own process.

### Rendering & caching

- **Season pages are statically generated with ISR**, not SSR: `generateStaticParams` over `SEASONS`, `dynamicParams = false`, `revalidate = 600`. They render an empty shell (`emptyChartPayload`) if the DB is unreachable during build, then self-heal on the next regeneration.
- `lib/data.ts` wraps DB reads in `unstable_cache` tagged `chart-payload` / `winprob-payload`. Crons purge with `revalidateTag(...)` + `revalidatePath("/[season]", "page")`.
- **LIVE pages are `force-dynamic`** so live games show current state on load. The client (`LiveBoard`, and the season `Dashboard`) polls `/api/live` every 30s; that endpoint is edge-cached (`s-maxage=20`) so traffic doesn't multiply DB load. The season Dashboard's poll only triggers `router.refresh()` when a game's status flips to final.

### Charts are hand-rolled SVG (no charting library)

- `lib/chart.ts` — **framework-free** geometry, tick generation, formatters, and nearest-point hit-testing (`pickHoverPoint`, with sticky hysteresis). Pure functions, unit-testable in principle.
- `components/charts/` — the React layer: `MarginChart`, `DetailChart`, shared `ChartElements`, and hooks `useChartHover` / `useSmoothedDomain` / `useTooltipPosition`.
- The **detail chart** maps each plate-appearance win-prob onto the cumulative margin axis: within a game slot, 100% counts the game as a full win (+1 to margin), 0% as a loss (−1), linear in between (`DetailChart` `appendWpPoints`). The axis convention (50%→0, 100%→+1, 0%→−1) is documented at the top of `lib/winprob.ts`.

## Conventions & gotchas

- **Dates**: crawl-range math uses `YYYYMMDD` strings in **KST** everywhere (`lib/dates.ts` `kstYmd`, `dashed`); Postgres `date` columns store `YYYY-MM-DD`. Don't introduce `Date`-object timezone math into the crawl path.
- **Seasons**: `lib/seasons.ts` is the source of truth — opening dates per year (2015–2026), `LATEST_SEASON`, and `seasonCrawlRange`. Win-prob only exists for **2024+** (`fetchWinProbabilities` returns `[]` below 2024; the detail toggle is gated by `DETAIL_MIN_SEASON = 2024` in `Dashboard`).
- **Teams**: `lib/teams.ts` maps Korean names ↔ Naver codes (`TEAM_CODES`, `CODE_TO_TEAM`) and holds colors. `getTeamShortName` / `getTeamFullName` handle franchise renames by season (SK 와이번스 → SSG 랜더스 after 2020; 넥센 → 키움 after 2018) — always pass the season when displaying a team name.
- **Scraper requests must look like a browser**: `naverHeaders()` (with a `Referer`) is required or the API gateway returns 403. All scraping goes through `lib/naver.ts` / `lib/scraper.ts`.
- **Upserts are idempotent**, keyed on `(team, gameId)`. Results only refresh the score on conflict; live win-prob overwrites the whole row (every field changes tick to tick).
- **Doubleheaders**: ordered deterministically by `gameId` suffix; on the date axis their excursions are chained into one combined slot (`buildWinProbPayload`), rendered as `DH1`/`DH2` in the tooltip.
- **Auth**: `CRON_SECRET` bearer protects `/api/cron/*` and `/api/revalidate`. The public `/api/live` and `/api/live/game/[gameId]` are unauthenticated but read-only and edge-cached.
- **Path alias**: `@/*` → repo root. This project sits inside a larger monorepo, so `next.config.ts` pins `outputFileTracingRoot` to its own dir.
- Korean is the UI language and the convention for user-facing strings and most comments describing baseball concepts.
