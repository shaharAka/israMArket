import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

const UPSTREAM = process.env.API_ORIGIN ?? "http://localhost:8000";

async function proxy(request: NextRequest, path: string[]) {
  const url = new URL(request.url);
  const target = `${UPSTREAM}/${path.join("/")}${url.search}`;
  const headers = new Headers(request.headers);
  headers.delete("host");
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body,
    redirect: "manual",
  });

  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("transfer-encoding");
  const response = new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
  return response;
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, (await context.params).path);
}
export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, (await context.params).path);
}
export async function DELETE(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, (await context.params).path);
}
export async function PUT(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, (await context.params).path);
}
