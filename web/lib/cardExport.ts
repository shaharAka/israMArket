"use client";

/**
 * Client-side card export.
 *
 * Cards are authored in the DOM at their true pixel size (see CardCanvas), so the
 * browser can rasterise exactly what the user approved. No server round-trip and no
 * second rendering path that could drift from the preview.
 */

import { toPng } from "html-to-image";

function slug(value: string): string {
  return (
    value
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "post"
  );
}

export type ExportResult = { ok: true } | { ok: false; error: string };

/**
 * Rasterise `node` to a PNG download at exactly `w`x`h`.
 *
 * `pixelRatio: 1` is deliberate: the node is already authored at export resolution,
 * so scaling it again would resample the artwork.
 */
export async function downloadCardPng(
  node: HTMLElement,
  { width, height, title }: { width: number; height: number; title: string },
): Promise<ExportResult> {
  try {
    const dataUrl = await toPng(node, {
      width,
      height,
      pixelRatio: 1,
      cacheBust: true,
      // The node is inside a CSS-scaled wrapper; make sure the clone is not scaled.
      style: { transform: "none", transformOrigin: "top right", margin: "0" },
    });

    const link = document.createElement("a");
    link.download = `${slug(title)}-${width}x${height}.png`;
    link.href = dataUrl;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // A tainted canvas is the usual cause when the photo is served cross-origin.
    const hint = /taint|SecurityError/i.test(message)
      ? "התמונה מאוחסנת בכתובת חיצונית ולכן הדפדפן חסם את הייצוא."
      : message;
    return { ok: false, error: hint };
  }
}
