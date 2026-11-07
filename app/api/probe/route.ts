import { NextResponse } from "next/server";
import tls from "node:tls";
import https from "node:https";
import dns from "node:dns/promises";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const results: Record<string, any> = {};

  // 1. Check Vercel outgoing IP
  try {
    const ipRes = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(3000) });
    results.outboundIp = await ipRes.json();
  } catch (e: any) {
    results.outboundIpError = e.message;
  }

  // 2. DNS resolve api-gw.sports.naver.com
  try {
    results.dns = await dns.lookup("api-gw.sports.naver.com", { all: true });
  } catch (e: any) {
    results.dnsError = e.message;
  }

  // 3. Test raw TLS connection
  try {
    results.tls = await new Promise((resolve) => {
      const socket = tls.connect(443, "api-gw.sports.naver.com", {
        servername: "api-gw.sports.naver.com",
        timeout: 3000,
      }, () => {
        resolve({
          connected: true,
          protocol: socket.getProtocol(),
          cipher: socket.getCipher(),
          alpn: socket.alpnProtocol,
        });
        socket.destroy();
      });
      socket.on("error", (err) => resolve({ connected: false, error: err.message, code: (err as any).code }));
      socket.on("timeout", () => {
        socket.destroy();
        resolve({ connected: false, error: "timeout" });
      });
    });
  } catch (e: any) {
    results.tlsError = e.message;
  }

  // 4. Test fetch with different User-Agents
  const testUrl = "https://api-gw.sports.naver.com/schedule/games?fields=basic,schedule,baseball&upperCategoryId=kbaseball&categoryId=kbo&fromDate=2026-11-07&toDate=2026-11-07&size=500";
  try {
    const res = await fetch(testUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
        Referer: "https://m.sports.naver.com/",
      },
      signal: AbortSignal.timeout(4000),
    });
    results.fetchStatus = res.status;
    results.fetchOk = res.ok;
  } catch (e: any) {
    results.fetchError = e.message;
  }

  return NextResponse.json(results);
}
