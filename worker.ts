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
  // 임시비밀번호 이메일 발송용 (Resend). 설정: npx wrangler secret put RESEND_API_KEY
  RESEND_API_KEY?: string;
  MAIL_FROM?: string; // 예: "코칭패스 CRM <no-reply@yourdomain.com>" (Resend에서 인증된 발신 도메인)
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

// 임시비밀번호를 해당 임직원 이메일로 발송 (Resend REST API)
async function handleSendTempPassword(request: Request, env: Env): Promise<Response> {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_body" }, 400);
  }
  const email = (body?.email || "").trim();
  const name = (body?.name || "").trim();
  const tempPassword = (body?.tempPassword || "").toString();
  const employeeNumber = (body?.employeeNumber || "").toString();

  if (!email || !tempPassword) {
    return json({ error: "missing_fields", message: "email/tempPassword 필요" }, 400);
  }

  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    // 이메일 발송이 아직 구성되지 않음 → 프런트가 안내할 수 있게 명확한 코드 반환
    return json({ error: "email_not_configured", message: "이메일 발송이 구성되지 않았습니다 (RESEND_API_KEY 미설정)." }, 503);
  }
  const from = env.MAIL_FROM?.trim() || "코칭패스 CRM <onboarding@resend.dev>";

  const subject = "[코칭패스 CRM] 임시 비밀번호 안내";
  const html = `
    <div style="font-family:Apple SD Gothic Neo,Malgun Gothic,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a;">
      <h2 style="margin:0 0 8px;">코칭패스 CRM 임시 비밀번호</h2>
      <p style="font-size:13px;color:#475569;">${name ? name + "님, " : ""}요청하신 임시 비밀번호를 안내드립니다.</p>
      <div style="margin:16px 0;padding:16px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;">
        ${employeeNumber ? `<div style="font-size:12px;color:#64748b;">사번</div><div style="font-size:16px;font-weight:800;font-family:monospace;margin-bottom:10px;">${employeeNumber}</div>` : ""}
        <div style="font-size:12px;color:#64748b;">임시 비밀번호</div>
        <div style="font-size:22px;font-weight:800;font-family:monospace;letter-spacing:1px;color:#b45309;">${tempPassword}</div>
      </div>
      <p style="font-size:12px;color:#64748b;">보안을 위해 로그인 후 <b>마이페이지</b>에서 비밀번호를 변경해 주세요.</p>
    </div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [email], subject, html }),
    });
    const text = await res.text();
    if (!res.ok) {
      return json({ error: "send_failed", detail: text.slice(0, 300) }, 502);
    }
    return json({ ok: true });
  } catch (e: any) {
    return json({ error: "send_error", message: e?.message || String(e) }, 502);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 임시비밀번호 이메일 발송 (POST)
    if (url.pathname === "/api/send-temp-password") {
      if (request.method !== "POST") {
        return json({ error: "Method Not Allowed" }, 405);
      }
      try {
        return await handleSendTempPassword(request, env);
      } catch (error: any) {
        console.error("send-temp-password error:", error);
        return json({ error: error?.message || "Internal Server Error" }, 500);
      }
    }

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
