import { NextRequest, NextResponse } from "next/server";

/**
 * The public WhatsApp tracked link, `{PUBLIC_BASE_URL}/r/{code}`.
 *
 * In the documented deployment only the web tier is reachable from the internet, so the
 * short link lives on the web origin and this handler forwards it to the API's `/r/{code}`
 * (api/app/routers/whatsapp.py), which answers with the 302 to wa.me or a small Hebrew
 * "link not found" page.
 *
 * Only what the click counter needs is forwarded: the user agent (the API reduces it to a
 * coarse device bucket and drops the rest) and the browser's prefetch hints (a prefetch is
 * not a tap). No cookies, no client address, no referrer — the API never sees who tapped.
 */
const UPSTREAM = process.env.API_ORIGIN ?? "http://localhost:8000";
const FORWARDED = ["user-agent", "purpose", "sec-purpose", "x-purpose", "x-moz"];

/**
 * When the API cannot answer, the person who tapped (the business's customer) still gets a
 * calm Hebrew page with a way on, the same one the API serves for a link that is gone.
 */
const UNAVAILABLE = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>הקישור לא נפתח · ישראמארקט</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f6f7fb;
         color: #14203a; font-family: system-ui, -apple-system, "Segoe UI", Arial, sans-serif; }
  main { max-width: 24rem; padding: 2rem 1.25rem; text-align: center; }
  .mark { display: inline-block; width: 10px; height: 10px; border-radius: 999px; background: #ffc44a;
          box-shadow: 0 0 0 5px #fff4d6; }
  h1 { font-size: 1.4rem; line-height: 1.3; margin: 1.25rem 0 .5rem; }
  p { margin: 0; line-height: 1.7; color: #4b5670; }
  a { display: inline-flex; align-items: center; min-height: 44px; margin-top: 1.25rem; color: #2853c7;
      font-weight: 600; text-decoration: none; }
  a:hover { text-decoration: underline; }
</style>
</head>
<body><main><span class="mark" aria-hidden="true"></span><h1>הקישור לא נפתח כרגע</h1>
<p>כנראה תקלה רגעית אצלנו. נסו שוב בעוד דקה.</p>
<a href="/">לעמוד הבית של ישראמארקט</a></main></body>
</html>`;

function unavailable(request: NextRequest) {
  return new NextResponse(request.method === "HEAD" ? null : UNAVAILABLE, {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-robots-tag": "noindex, nofollow",
      "retry-after": "60",
    },
  });
}

async function forward(request: NextRequest, code: string) {
  const headers = new Headers();
  for (const name of FORWARDED) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  let upstream: Response;
  try {
    upstream = await fetch(`${UPSTREAM}/r/${encodeURIComponent(code)}`, {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      headers,
      redirect: "manual",
      cache: "no-store",
    });
  } catch {
    return unavailable(request);
  }
  if (upstream.status >= 500) return unavailable(request);
  const out = new Headers();
  for (const name of ["location", "content-type", "cache-control", "referrer-policy", "x-robots-tag"]) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  const body = request.method === "HEAD" || upstream.status === 302 ? null : await upstream.text();
  return new NextResponse(body, { status: upstream.status, headers: out });
}

export async function GET(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  return forward(request, (await context.params).code);
}

export async function HEAD(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  return forward(request, (await context.params).code);
}
