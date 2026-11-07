# KBO Naver API Proxy (Cloudflare Worker)

네이버 스포츠 API 게이트웨이(`api-gw.sports.naver.com`)가 Vercel의 AWS 클라우드 IP를 차단할 때, Cloudflare Workers의 글로벌 엣지 네트워크를 통해 트래픽을 무료(0원)로 중계하는 경량 프록시입니다.

- **비용**: 완전 무료 (Cloudflare Free 플랜: 하루 100,000건 무료 요청)
- **성능**: Cloudflare Anycast 엣지를 통해 약 50~150ms 내외로 고속 응답
- **용도**: Vercel의 `/api/cron/live` 및 `/api/cron/scrape`가 네이버 차단 없이 365일 실시간 스크래핑을 수행하도록 지원

---

## 🚀 배포 방법 (2가지 중 편한 것 선택)

### 방법 A. 웹 대시보드에서 1분 만에 배포 (가장 추천 / 터미널 불필요)

1. [Cloudflare 대시보드](https://dash.cloudflare.com/)에 로그인합니다.
2. 좌측 메뉴에서 **Compute (Workers & Pages)** 클릭 → **Create application** (또는 Create Worker) 클릭.
3. Worker 이름을 `kbo-naver-proxy`로 입력하고 **Deploy**를 클릭합니다.
4. 배포 완료 후 **Edit code** 버튼을 누릅니다.
5. 에디터에 있는 기본 코드를 지우고, [`src/index.ts`](./src/index.ts)의 전체 내용을 그대로 복사해서 붙여넣습니다.
6. 우측 상단 **Deploy** 버튼을 누릅니다.
7. 완료 화면에 뜨는 주소(예: `https://kbo-naver-proxy.<사용자서브도메인>.workers.dev`)를 복사합니다.

---

### 방법 B. Wrangler CLI로 배포

1. 터미널에서 Cloudflare에 로그인합니다 (웹 브라우저가 열립니다):
   ```bash
   npx wrangler login
   ```
2. 프로젝트 루트에서 다음 명령어를 실행하여 배포합니다:
   ```bash
   npm run deploy:proxy
   ```
3. 터미널 출력 마지막에 표시되는 Worker 주소(예: `https://kbo-naver-proxy.<subdomain>.workers.dev`)를 확인합니다.

---

## 🧪 배포 후 검증

터미널에서 테스트 스크립트를 실행해 네이버 차단이 잘 우회되는지 확인합니다:

```bash
npm run test:proxy -- https://kbo-naver-proxy.<서브도메인>.workers.dev
```

다음과 같이 3개 항목이 모두 `200 OK`로 통과하면 성공입니다:
- `✅ [1/3] Health Check: 200 OK`
- `✅ [2/3] Schedule Endpoint: 200 OK`
- `✅ [3/3] Relay Win-Prob Endpoint: 200 OK`

---

## ⚙️ Vercel 및 로컬 환경변수 설정

1. **Vercel 대시보드** 접속 → 본인 프로젝트 선택 → **Settings** → **Environment Variables**
2. 다음 환경변수를 추가합니다:
   * **Key**: `NAVER_PROXY_URL`
   * **Value**: 배포한 Worker 주소 (예: `https://kbo-naver-proxy.<subdomain>.workers.dev`)
3. 저장 후 **Deployments** 탭에서 최신 배포를 **Redeploy** 하거나, 새 커밋을 푸시하면 즉시 적용됩니다.
4. 로컬에서도 테스트하려면 `.env.local`에 위 변수를 추가하면 됩니다.
