# KBO 승패마진 트래커

KBO 리그 10개 구단의 누적 **승패마진**과 **승률**을 날짜별·경기별로 추적하는 풀스택 웹앱. 매일 자정(KST) 네이버 스포츠에서 전날 경기를 가져와 DB에 누적하고, 정적으로 생성된 페이지를 재검증해 갱신합니다.

- **Framework**: Next.js 15 (App Router) · TypeScript · Tailwind CSS v4
- **DB**: Neon Postgres + Drizzle ORM
- **배포**: Vercel (Cron으로 일일 갱신, SSR 없음 — 정적 생성 + on-demand revalidation)

## 아키텍처

```
Vercel Cron (매일 15:00 UTC = 00:00 KST)
  └─ /api/cron/scrape  → 전날 경기 fetch → DB upsert → revalidateTag('kbo')

사용자 → 정적 HTML (app/[season]/page.tsx)
        빌드/재생성 시 DB 조회 → lib/stats 누적 계산 → 클라이언트 차트에 주입
```

- `lib/scraper.ts` — 네이버 스포츠 API 크롤러 (`main.py` 포팅)
- `lib/stats.ts` — 누적 승패마진/승률, 날짜·경기 축, 순위 계산
- `lib/db/` — Drizzle 스키마 (`team_game_results`)
- `components/MarginChart.tsx` — 커스텀 SVG 라인 차트 (호버 툴팁, 축 전환)

## 로컬 실행

```bash
npm install

# 1) DB 없이 미리보기 (스냅샷 JSON)
npm run snapshot -- 2025      # data/2025.json 생성
npm run dev                   # http://localhost:3000/2025

# 2) Neon DB 사용
cp .env.example .env.local    # DATABASE_URL, CRON_SECRET 입력
npm run db:push               # 스키마 생성
npm run seed -- 2025          # 한 시즌 백필 (생략 시 전 시즌)
npm run dev
```

## Vercel 배포

1. Neon 프로젝트 생성 → pooled `DATABASE_URL` 확보
2. Vercel 프로젝트에 `DATABASE_URL`, `CRON_SECRET` 환경변수 등록
3. 최초 1회 `npm run seed` 로 과거 데이터 백필
4. 배포 → `vercel.json`의 cron이 매일 자정(KST) 자동 갱신

## 조작

- **가로축**: 날짜별 ↔ 경기별
- **세로축**: 승패마진 ↔ 승률
- 그래프 호버 → 팀·수치·날짜 툴팁 / 우측 순위 클릭 → 팀 라인 토글
- 상단 연도 선택으로 2015~2026 시즌 전환
