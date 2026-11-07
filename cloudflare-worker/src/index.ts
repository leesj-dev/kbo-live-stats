export interface Env {
  PROXY_KEY?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 1. Health check endpoint
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          ok: true,
          service: "kbo-naver-proxy",
          timestamp: new Date().toISOString(),
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // 2. Optional auth key validation
    if (env.PROXY_KEY) {
      const incomingKey = request.headers.get("x-proxy-key");
      if (incomingKey !== env.PROXY_KEY) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
    }

    // 3. Proxy to Naver Sports API Gateway
    const targetUrl = new URL(url.pathname + url.search, "https://api-gw.sports.naver.com");

    const headers = new Headers();
    headers.set(
      "User-Agent",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    );
    headers.set("Accept", "application/json, text/plain, */*");
    headers.set("Accept-Language", "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7");
    headers.set("Referer", request.headers.get("referer") || "https://m.sports.naver.com/");
    headers.set("Origin", "https://m.sports.naver.com");
    headers.set("sec-ch-ua", '"Chromium";v="124", "Google Chrome";v="124"');
    headers.set("sec-ch-ua-mobile", "?0");
    headers.set("sec-ch-ua-platform", '"macOS"');
    headers.set("sec-fetch-dest", "empty");
    headers.set("sec-fetch-mode", "cors");
    headers.set("sec-fetch-site", "same-site");

    try {
      const naverRes = await fetch(targetUrl.toString(), {
        method: request.method,
        headers,
      });

      const responseHeaders = new Headers(naverRes.headers);
      responseHeaders.set("Access-Control-Allow-Origin", "*");
      responseHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate");

      return new Response(naverRes.body, {
        status: naverRes.status,
        statusText: naverRes.statusText,
        headers: responseHeaders,
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          error: "Upstream Naver fetch failed",
          detail: err?.message || String(err),
        }),
        {
          status: 502,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }
  },
};
