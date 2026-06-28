/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cloudflare Worker 엔트리 (Workers + 정적 자산 모델).
 *
 * - 정적 프런트엔드(빌드된 dist/)는 ASSETS 바인딩이 서빙한다.
 * - /api/imweb/* 요청만 이 Worker가 처리하여 아임웹 API를 프록시한다.
 *   (wrangler.jsonc 의 assets.run_worker_first: ["/api/*"] 설정으로 라우팅)
 *
 * 환경변수(시크릿): IMWEB_API_KEY, IMWEB_SECRET
 *   설정: npx wrangler secret put IMWEB_API_KEY
 */

interface Env {
  IMWEB_API_KEY?: string;
  IMWEB_SECRET?: string;
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

const IMWEB_BASE = "https://api.imweb.me/v2";

// 토큰 캐시 (warm isolate 내에서만 유효한 best-effort 캐시)
let cachedToken: string | null = null;
let tokenExpiresAt = 0; // ms epoch

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function getImwebAccessToken(env: Env): Promise<string> {
  const apiKey = env.IMWEB_API_KEY?.trim();
  const secret = env.IMWEB_SECRET?.trim();
  if (!apiKey || !secret) {
    throw new Error("I'mweb API credentials are not set.");
  }

  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 30000) {
    return cachedToken;
  }

  const tokenRes = await fetch(`${IMWEB_BASE}/auth?key=${apiKey}&secret=${secret}`, { method: "GET" });
  const tokenText = await tokenRes.text();
  if (!tokenRes.ok) {
    throw new Error(`Failed to authenticate with I'mweb (HTTP ${tokenRes.status}): ${tokenText.slice(0, 200)}`);
  }

  // 아임웹 v2 인증은 키가 틀려도 HTTP 200 + {"msg":"API Key Error","code":-1} 형태로 응답한다.
  let tokenData: any;
  try {
    tokenData = JSON.parse(tokenText);
  } catch {
    throw new Error(`I'mweb auth returned non-JSON response (HTTP ${tokenRes.status}): ${tokenText.slice(0, 200)}`);
  }
  if (!tokenData.access_token) {
    throw new Error(`I'mweb auth failed: ${tokenData?.msg || "No access token in response."}`);
  }

  cachedToken = tokenData.access_token as string;
  const expiresIn = tokenData.expires_in || 3600;
  tokenExpiresAt = now + expiresIn * 1000;
  return cachedToken;
}

/** 아임웹 GET 호출 후 본문을 그대로(JSON이면 JSON, 아니면 JSON 에러로 래핑) 전달한다. */
async function proxyGet(env: Env, imwebPath: string): Promise<Response> {
  const accessToken = await getImwebAccessToken(env);
  const upstream = await fetch(`${IMWEB_BASE}${imwebPath}`, {
    method: "GET",
    headers: { "access-token": accessToken, "Content-Type": "application/json" },
  });
  const text = await upstream.text();
  try {
    JSON.parse(text); // 유효성만 검사
    return new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch {
    // 아임웹이 비JSON(HTML/빈) 응답을 주면 클라이언트가 원인을 알 수 있게 구조화한다.
    return json(
      { error: `아임웹이 JSON이 아닌 응답을 반환했습니다 (HTTP ${upstream.status}): ${text.slice(0, 300)}` },
      502
    );
  }
}

async function handleImweb(request: Request, env: Env, segments: string[]): Promise<Response> {
  const search = new URL(request.url).search; // 쿼리스트링 원형 보존 (order_no[] 등)

  // /api/imweb/token
  if (segments[0] === "token" && segments.length === 1) {
    const accessToken = await getImwebAccessToken(env);
    return json({ access_token: accessToken });
  }

  // /api/imweb/orders ...
  if (segments[0] === "orders") {
    if (segments.length === 1) {
      return proxyGet(env, `/shop/orders${search}`);
    }
    if (segments.length === 2) {
      return proxyGet(env, `/shop/orders/${encodeURIComponent(segments[1])}`);
    }
    if (segments.length === 3 && segments[2] === "prod-orders") {
      return proxyGet(env, `/shop/orders/${encodeURIComponent(segments[1])}/prod-orders`);
    }
  }

  // /api/imweb/prod-orders?order_no[]=...
  if (segments[0] === "prod-orders" && segments.length === 1) {
    return proxyGet(env, `/shop/prod-orders${search}`);
  }

  return json({ error: `Unknown imweb proxy route: /${segments.join("/")}` }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/imweb/")) {
      if (request.method !== "GET") {
        return json({ error: "Method Not Allowed" }, 405);
      }
      const segments = url.pathname.replace(/^\/api\/imweb\//, "").split("/").filter(Boolean);
      try {
        return await handleImweb(request, env, segments);
      } catch (error: any) {
        console.error("I'mweb proxy error:", error);
        return json({ error: error?.message || "Internal Server Error" }, 500);
      }
    }

    // /api/* 외의 요청은 정적 자산(SPA)로 위임 (run_worker_first 설정상 도달하지 않지만 안전망)
    return env.ASSETS.fetch(request);
  },
};
