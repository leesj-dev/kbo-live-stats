// Test script to verify that a deployed Cloudflare Worker proxy successfully
// bypasses Naver WAF and returns KBO data.
// Usage:
//   npm run test:proxy -- https://kbo-naver-proxy.<your-subdomain>.workers.dev
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const proxyUrl = (process.argv[2] || process.env.NAVER_PROXY_URL || "").replace(/\/$/, "");
  const proxyKey = process.env.NAVER_PROXY_KEY;

  if (!proxyUrl) {
    console.error("Usage: npm run test:proxy -- <WORKER_URL>");
    console.error("Example: npm run test:proxy -- https://kbo-naver-proxy.user.workers.dev");
    process.exit(1);
  }

  console.log(`\n🔍 Testing Cloudflare Proxy at: ${proxyUrl}\n`);

  const headers: Record<string, string> = {};
  if (proxyKey) {
    headers["x-proxy-key"] = proxyKey;
  }

  // 1. Health check
  try {
    const t0 = Date.now();
    const res = await fetch(`${proxyUrl}/health`, { headers });
    const latency = Date.now() - t0;
    if (res.ok) {
      const data = await res.json();
      console.log(`✅ [1/3] Health Check: 200 OK (${latency}ms)`);
      console.log(`   Response:`, data);
    } else {
      console.error(`❌ [1/3] Health Check failed: ${res.status} ${res.statusText}`);
    }
  } catch (err: any) {
    console.error(`❌ [1/3] Health Check network error:`, err.message);
  }

  // 2. Schedule endpoint
  try {
    const t0 = Date.now();
    const schedulePath =
      "/schedule/games?fields=basic,schedule,baseball&upperCategoryId=kbaseball&categoryId=kbo&fromDate=2026-11-08&toDate=2026-11-08&size=10";
    const res = await fetch(`${proxyUrl}${schedulePath}`, { headers });
    const latency = Date.now() - t0;
    if (res.ok) {
      const data: any = await res.json();
      const games = data?.result?.games ?? [];
      console.log(`\n✅ [2/3] Schedule Endpoint: 200 OK (${latency}ms)`);
      console.log(`   Found ${games.length} game(s) for 2026-11-08:`);
      for (const g of games) {
        console.log(`   - [${g.gameId}] ${g.awayTeamCode} vs ${g.homeTeamCode} (${g.statusCode || g.statusInfo})`);
      }
    } else {
      console.error(`\n❌ [2/3] Schedule Endpoint failed: ${res.status} ${res.statusText}`);
      const text = await res.text();
      console.error(`   Body:`, text.slice(0, 300));
    }
  } catch (err: any) {
    console.error(`\n❌ [2/3] Schedule Endpoint network error:`, err.message);
  }

  // 3. Relay endpoint
  try {
    const t0 = Date.now();
    const sampleGameId = "20261107HTSS02026"; // Korean Series Game 4
    const relayPath = `/schedule/games/${sampleGameId}/relay?inning=1`;
    const res = await fetch(`${proxyUrl}${relayPath}`, { headers });
    const latency = Date.now() - t0;
    if (res.ok) {
      const data: any = await res.json();
      const relays = data?.result?.textRelayData?.textRelays ?? [];
      console.log(`\n✅ [3/3] Relay Win-Prob Endpoint: 200 OK (${latency}ms)`);
      console.log(`   Successfully fetched inning 1 relays (${relays.length} plate appearances).`);
      console.log(`\n🎉 PROXY VERIFICATION SUCCESSFUL! You can now set NAVER_PROXY_URL in Vercel.`);
    } else {
      console.error(`\n❌ [3/3] Relay Endpoint failed: ${res.status} ${res.statusText}`);
    }
  } catch (err: any) {
    console.error(`\n❌ [3/3] Relay Endpoint network error:`, err.message);
  }
}

main().catch(console.error);
