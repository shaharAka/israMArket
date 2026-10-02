import fs from "node:fs/promises";
import path from "node:path";

/**
 * Writes one rendered card from the QA page (/dev/dna) to disk, for a review script to
 * score: `<name>.png` and `<name>.json` (the business, the design, the words) under
 * `web/.design-review/dna/<ratio>/` (git-ignored), or `DNA_EXPORT_DIR`. Development only.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });
  const body = (await request.json().catch(() => null)) as { name?: string; ratio?: string; png?: string; meta?: unknown } | null;
  const png = typeof body?.png === "string" ? body.png.replace(/^data:image\/png;base64,/, "") : "";
  if (!png) return Response.json({ ok: false, error: "no png" }, { status: 400 });
  const clean = (v: unknown, fallback: string) => (typeof v === "string" && v ? v : fallback).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
  const root = process.env.DNA_EXPORT_DIR || path.join(process.cwd(), ".design-review", "dna");
  const dir = path.join(root, clean(body?.ratio, "4x5"));
  const name = clean(body?.name, "card");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${name}.png`), Buffer.from(png, "base64"));
  if (body?.meta !== undefined) await fs.writeFile(path.join(dir, `${name}.json`), JSON.stringify(body.meta, null, 2));
  return Response.json({ ok: true, dir, file: path.join(dir, `${name}.png`) });
}
