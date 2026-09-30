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

async function forward(request: NextRequest, code: string) {
  const headers = new Headers();
  for (const name of FORWARDED) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const upstream = await fetch(`${UPSTREAM}/r/${encodeURIComponent(code)}`, {
    method: request.method === "HEAD" ? "HEAD" : "GET",
    headers,
    redirect: "manual",
    cache: "no-store",
  });
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
