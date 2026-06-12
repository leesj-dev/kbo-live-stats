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

- `lib/naver.ts` — 네이버 스포츠 공용 접근 계층 (브라우저 헤더·봇 회피, 스케줄 열거)
- `lib/scraper.ts` — 경기 결과 크롤러 (`main.py` 포팅)
- `lib/winprob-scraper.ts` — 실시간 **승리확률** 크롤러 (타석별 시계열 → 경기당 시·고·저·종가)
- `lib/stats.ts` — 누적 승패마진/승률, 날짜·경기 축, 순위 계산
- `lib/candles.ts` — 승리확률 → 캔들(OHLC) 변환 (50%→0, 100%→+1, 0%→−1)
- `lib/db/` — Drizzle 스키마 (`team_game_results`, `team_game_win_prob`)
- `components/MarginChart.tsx` — 커스텀 SVG 라인 차트 (호버 툴팁, 축 전환)
- `components/CandleChart.tsx` — 승리확률 캔들차트 (팀별 일봉, 양봉/음봉·꼬리, 호버 OHLC)

### 승리확률 캔들차트

주식 일봉처럼 한 팀의 경기별 실시간 승리확률을 캔들로 표시한다. 네이버에서 1~9회 타석별
승률을 크롤링해 경기당 **시가(경기 시작)·고가(최고 승률)·저가(최저 승률)·종가(경기 결과)**
로 축약한다. 이긴 경기는 종가 100% → **양봉(빨강)**, 진 경기는 종가 0% → **음봉(파랑)**.
아래꼬리(저가)는 상대가 가장 앞섰던 순간을 나타낸다 — 예: A가 이겼지만 B 승률이 70%까지
올랐다면 A의 저가는 30%까지 내려간다. 라인 차트와 완전히 독립적이며 **캔들 토글**로만 표시된다.

## 로컬 실행

```bash
npm install

# 1) DB 없이 미리보기 (스냅샷 JSON)
npm run snapshot -- 2025              # data/2025.json (경기 결과)
npm run snapshot:winprob -- 2025      # data/2025-winprob.json (승리확률 캔들)
npm run snapshot:winprob -- 2025 --mock  # 네트워크 없이 합성 데모 데이터로 캔들 미리보기
npm run dev                          # http://localhost:3000/2025

# 2) Neon DB 사용
cp .env.example .env.local    # DATABASE_URL, CRON_SECRET 입력
npm run db:push               # 스키마 생성 (team_game_results, team_game_win_prob)
npm run seed -- 2025          # 결과 백필 (생략 시 전 시즌)
npm run seed:winprob -- 2025  # 승리확률 백필
npm run dev
```

## Vercel 배포

1. Neon 프로젝트 생성 → pooled `DATABASE_URL` 확보
2. Vercel 프로젝트에 `DATABASE_URL`, `CRON_SECRET` 환경변수 등록
3. 최초 1회 `npm run seed` 로 과거 데이터 백필
4. 배포 → `vercel.json`의 cron이 매일 자정(KST) 자동 갱신

## 조작

- **차트**: 라인 ↔ 캔들 (캔들은 승리확률 일봉, 라인과 독립)
- **가로축**: 날짜별 ↔ 경기별
- **세로축**: 승패마진 ↔ 승률 (라인 모드)
- 라인 호버 → 팀·수치·날짜 툴팁 / 우측 순위 클릭 → 팀 라인 토글
- 캔들 호버 → 시·고·저·종가 + 상대 최고 승률(꼬리값) 툴팁 / 우측 순위 클릭 → 팀 선택(단일)
- 상단 연도 선택으로 2015~2026 시즌 전환
