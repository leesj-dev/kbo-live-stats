# KBO 승패마진 트래커

KBO 리그 10개 구단의 누적 **승패마진**과 **승률**을 날짜별·경기별로 추적하는 풀스택 웹앱. 매일 자정(KST) 네이버 스포츠에서 전날 경기를 가져와 DB에 누적하고, 정적으로 생성된 페이지를 재검증해 갱신합니다.

- **Framework**: Next.js 15 (App Router) · TypeScript · Tailwind CSS v4
- **DB**: Neon Postgres + Drizzle ORM
- **배포**: Vercel (Cron으로 일일 갱신, SSR 없음 — 정적 생성 + on-demand revalidation)

## 아키텍처

```
Vercel Cron (매일 15:00 UTC = 00:00 KST)
  └─ /api/cron/scrape  → 어제·오늘 경기 fetch → DB upsert
                        → revalidateTag('chart-payload', 'candle-payload') + revalidatePath

사용자 → 정적 HTML (app/[season]/page.tsx)
        빌드/재생성 시 DB 조회 → lib/stats·lib/candles 누적 계산 → 클라이언트 차트에 주입
```

- `lib/naver.ts` — 네이버 스포츠 공용 접근 계층 (브라우저 헤더·봇 회피, 스케줄 열거)
- `lib/scraper.ts` — 경기 결과 + 실시간 **승리확률** 크롤러 (타석별 시계열 → 경기당 시·고·저·종가)
- `lib/stats.ts` — 누적 승패마진/승률, 날짜·경기 축, 순위 계산
- `lib/candles.ts` — 승리확률 행 → 팀별 캔들 페이로드 변환 (더블헤더 합성 포함)
- `lib/chart.ts` — 차트 공용 순수 로직 (지오메트리, 눈금, 포맷터, 호버 픽킹)
- `lib/data.ts` — DB/스냅샷 조회 + `unstable_cache` 캐싱 계층
- `lib/dates.ts` / `lib/seasons.ts` — KST 날짜 헬퍼, 시즌 개막일·크롤 범위
- `lib/db/` — Drizzle 스키마 (`team_game_results`, `team_game_win_prob`)
- `components/Dashboard.tsx` — 토글·순위 사이드바·레이아웃 (상태 보유)
- `components/charts/MarginChart.tsx` — 커스텀 SVG 라인 차트 (호버 툴팁, 축 전환)
- `components/charts/DetailChart.tsx` — 승리확률 상세 라인 차트 (타석별 경로를 누적 축에 매핑)

### 승리확률 상세 차트

**상세** 토글은 경기 결과(계단형) 대신 네이버에서 크롤링한 타석별 실시간 승리확률 경로를
누적 승패마진/승률 축 위에 이어 그린다. 경기 시작 전 마진에서 출발해 승리확률 100%면
+1(승), 0%면 −1(패)에 도달하도록 선형 매핑하므로, 라인이 경기 중 얼마나 출렁였는지가
그대로 보인다. 호버하면 해당 경기의 스코어·최고/최저 승리확률과 이닝별 스파크라인 툴팁이
표시된다. 데이터는 `team_game_win_prob` 테이블로 라인 차트와 독립적이다.

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

- **차트**: 기본(경기 결과) ↔ 상세(타석별 승리확률 경로)
- **가로축**: 날짜별 ↔ 경기별
- **세로축**: 승패마진 ↔ 승률
- 라인 호버 → 팀·수치·날짜 툴팁 (상세 모드는 스코어 + 최고/최저 승리확률 + 스파크라인)
- 우측 순위 클릭 → 팀 라인 토글 / 호버 → 하이라이트
- 하단 레인지 슬라이더로 구간 확대, 상단 연도 선택으로 2015~2026 시즌 전환
