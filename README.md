# KBO 144

KBO 리그 10개 구단의 시즌 누적 **승패마진**·**승률**과, 경기별 실시간 **승리확률**을 추적하는 풀스택 웹앱. 네이버 스포츠에서 경기 결과와 타석별 승리확률을 가져와 DB에 누적하고, 정적으로 생성된 페이지를 on-demand로 재검증해 갱신합니다.

- **Framework**: Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4
- **DB**: Neon Postgres + Drizzle ORM
- **배포**: Vercel (정적 생성 + ISR, 외부 크론으로 갱신)
- **데이터**: 네이버 스포츠 API (스케줄 + 중계 relay)

## 화면

| 경로                           | 내용                                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| `/[season]` (시즌)             | 시즌 누적 **승패마진**·**승률** 라인 차트. '상세' 토글 시 경기 중 승리확률 흐름까지 반영 |
| `/live`, `/live/[date]` (경기) | 날짜별 경기 카드 — 실시간/종료 경기의 양 팀 **승리확률** 그래프, 타석별 상세 툴팁        |

## 아키텍처

```
네이버 스포츠 API ─┬─ lib/naver.ts    스케줄 열거 + 브라우저 헤더(봇 회피)
                   └─ lib/scraper.ts  relay 엔드포인트에서 타석별 승리확률 크롤

   (크론/스크립트가 스크래퍼 호출 → upsert)
        ▼
   Neon Postgres ── lib/db/schema.ts: team_game_results, team_game_win_prob
        ▼
   lib/data.ts  (DB 조회 + unstable_cache 캐싱, DB 없으면 data/*.json 폴백)
        ▼
   ChartPayload(lib/stats)   WinProbPayload(lib/winprob)   LiveGameCard(lib/live)
        ▼                          ▼                            ▼
   MarginChart                 DetailChart                  LiveBoard / LiveGameCard
```

### 디렉터리

| 위치                                             | 역할                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------- |
| `lib/naver.ts`                                   | 네이버 스포츠 공용 접근 계층 (헤더, 스케줄 열거)                          |
| `lib/scraper.ts`                                 | 경기 결과 + 타석별 승리확률 크롤러 (relay → open/high/low/close + 시계열) |
| `lib/live.ts`                                    | 진행 중 경기 증분 크롤 (현재 이닝만 폴링 후 기존 시계열에 병합)           |
| `lib/plays.ts`                                   | 타석별 상세(타자·투수·카운트·주자·결과) — 툴팁용, 저장 안 함              |
| `lib/stats.ts`                                   | 경기 결과 → 누적 승패마진/승률, 순위                                      |
| `lib/winprob.ts`                                 | 승리확률 행 → 경기별 요약 (더블헤더 합성 포함)                            |
| `lib/chart.ts`                                   | 차트 공용 순수 로직 (지오메트리·눈금·포맷·호버 픽킹)                      |
| `lib/data.ts`                                    | DB/스냅샷 조회 + 캐싱 + upsert                                            |
| `lib/utils.ts`                                   | 유틸리티 함수                                                             |
| `lib/dates.ts`, `lib/seasons.ts`, `lib/teams.ts` | KST 날짜 헬퍼 · 시즌 개막일/크롤 범위 · 팀 코드/색상/표기                 |
| `components/charts/`                             | SVG 차트 (`MarginChart`, `DetailChart`)와 공용 요소·훅                    |
| `components/live/`                               | 경기 화면 (`LiveBoard`, `LiveGameCard`, `DatePicker`)                     |
| `app/api/cron/*`                                 | 일일/분당 크론 라우트                                                     |
| `scripts/`                                       | 백필·스냅샷·진단 CLI                                                      |

### 갱신 방식 (외부 크론 2개)

Vercel Hobby 크론은 하루 1회만 가능하므로 두 스케줄 모두 **외부 스케줄러(예: cron-job.org)**가 `Authorization: Bearer ${CRON_SECRET}` 헤더로 호출합니다.

- **`/api/cron/scrape`** (매일 자정 KST 부근) — 어제·오늘 경기 결과/승리확률을 가져와 upsert 후 재검증.
- **`/api/cron/live`** (경기 시간대 매분) — 진행 중 경기가 없으면 즉시 반환(self-gating). 진행 중이면 현재 이닝만 폴링해 병합하고, 종료된 경기는 결과 파이프라인으로 fold-in.

### 렌더링 & 캐싱

- 시즌 페이지: **정적 생성 + ISR**
  - `generateStaticParams`로 시즌별 사전 생성, `revalidate = 600`. DB가 비어 있거나 닿지 않으면 빈 셸을 렌더하고 다음 재생성 때 자동 복구.
  - `lib/data.ts`가 DB 조회를 `unstable_cache`(`chart-payload`/`winprob-payload` 태그)로 감싸고, 크론이 `revalidateTag` + `revalidatePath`로 퍼지.
- 경기 페이지: `force-dynamic`
  - 클라이언트는 30초마다 `/api/live`를 폴링하며, 이 엔드포인트는 엣지 캐시(`s-maxage=20`)되어 동시 접속자가 늘어도 DB 부하가 커지지 않음.

### 승리확률 상세 차트

**상세** 토글을 켜면 타석별 실시간 승리확률 경로를 누적 승패마진/승률 축 위에 이어 그립니다. 한 경기 슬롯 안에서 승리확률 100%면 +1(승), 0%면 −1(패)에 도달하도록 선형 매핑하므로, 라인이 경기 중 얼마나 출렁였는지 그대로 보입니다. 호버하면 스코어·최고/최저 승리확률·이닝별 스파크라인 툴팁이 표시됩니다. 데이터는 `team_game_win_prob` 테이블로 라인 차트와 독립적이며 **2024 시즌부터** 제공됩니다.

## 로컬 실행

```bash
npm install

# 1) DB 없이 미리보기 (스냅샷 JSON)
npm run snapshot -- 2025                  # data/2025.json (경기 결과)
npm run snapshot:winprob -- 2025          # data/2025-winprob.json (승리확률)
npm run snapshot:winprob -- 2025 --mock   # 네트워크 없이 합성 데모 데이터
npm run dev                               # http://localhost:3000/2025

# 2) Neon DB 사용
cp .env.example .env.local        # DATABASE_URL, CRON_SECRET 입력
npm run db:push                   # 스키마 생성 (team_game_results, team_game_win_prob)
npm run seed -- 2025              # 결과 백필 (생략 시 전 시즌)
npm run seed:winprob -- 2025      # 승리확률 백필 (2024+)
npm run dev
```

검증은 `npx tsc --noEmit`로 합니다. (테스트 스위트와 동작하는 린터는 없으며, `npm run lint`는 사용하지 않습니다.)

## Vercel 배포

1. Neon 프로젝트 생성 → pooled `DATABASE_URL` 확보
2. Vercel 환경변수에 `DATABASE_URL`, `CRON_SECRET` 등록
3. 최초 1회 `npm run seed` / `npm run seed:winprob`로 과거 데이터 백필
4. 외부 스케줄러(cron-job.org 등)에 두 크론 등록:
   - `POST /api/cron/scrape` — 매일 자정(KST) 부근
   - `POST /api/cron/live` — 경기 시간대 매분
   - 두 호출 모두 헤더 `Authorization: Bearer <CRON_SECRET>` 필요

## 조작

- **차트**: 기본(경기 결과) ↔ 상세(타석별 승리확률 경로)
- **가로축**: 날짜별 ↔ 경기별 · **세로축**: 승패마진 ↔ 승률
- 라인 호버 → 팀·수치·날짜 툴팁 (상세 모드는 스코어 + 최고/최저 승리확률 + 스파크라인)
- 우측 순위 클릭 → 팀 라인 토글 / 호버 → 하이라이트
- 하단 레인지 슬라이더로 구간 확대·재생, 상단 연도 선택으로 2015~2026 시즌 전환
- **경기** 탭 → 날짜별 경기 카드, 카드 그래프 호버 시 타석별 상세
