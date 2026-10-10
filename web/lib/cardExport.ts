"use client";

/**
 * Client-side card export.
 *
 * Cards are authored in the DOM at their true pixel size (see CardCanvas), so the
 * browser can rasterise exactly what the user approved. No server round-trip and no
 * second rendering path that could drift from the preview.
 *
 * Two things are made ready first:
 *  - the DNA's fonts (self-hosted, so html-to-image can inline the two families the card
 *    uses), and
 *  - the logo. A logo hot-linked from the business's own site is cross-origin: when its
 *    host lets us read it, it is inlined as a data URL; when it does not, the card's own
 *    wordmark (`data-card-logo-fallback`) stands in for this export, so the PNG never
 *    carries an empty box or fails outright.
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

/** A 1×1 transparent GIF. */
const BLANK = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

async function toDataUrl(src: string): Promise<string | null> {
  if (src.startsWith("data:")) return src;
  try {
    const res = await fetch(src, { mode: "cors", credentials: src.startsWith(window.location.origin) || src.startsWith("/") ? "include" : "omit" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Inline every logo in `node`, or swap it for the wordmark. Returns an undo. */
async function prepareLogos(node: HTMLElement): Promise<() => void> {
  const undo: (() => void)[] = [];
  const logos = Array.from(node.querySelectorAll<HTMLImageElement>("img[data-card-logo]"));
  await Promise.all(
    logos.map(async (img) => {
      const original = img.getAttribute("src") || "";
      const data = original ? await toDataUrl(original) : null;
      const fallback = img.nextElementSibling instanceof HTMLElement && img.nextElementSibling.hasAttribute("data-card-logo-fallback") ? img.nextElementSibling : null;
      if (data) {
        if (data !== original) {
          img.setAttribute("src", data);
          await img.decode().catch(() => undefined);
          undo.push(() => img.setAttribute("src", original));
        }
        return;
      }
      // Unreadable: the wordmark stands in, and the image is emptied for the export so
      // html-to-image has nothing cross-origin left to fetch.
      const display = img.style.display;
      img.setAttribute("src", BLANK);
      img.style.display = "none";
      if (fallback) fallback.style.display = "contents";
      undo.push(() => {
        img.setAttribute("src", original);
        img.style.display = display;
        if (fallback) fallback.style.display = "none";
      });
    }),
  );
  return () => undo.forEach((fn) => fn());
}

/**
 * Rasterise `node` to a PNG data URL at exactly `w`x`h`.
 *
 * `pixelRatio: 1` is deliberate: the node is already authored at export resolution,
 * so scaling it again would resample the artwork.
 */
export async function renderCardPng(node: HTMLElement, { width, height }: { width: number; height: number }): Promise<string> {
  await document.fonts?.ready;
  const restore = await prepareLogos(node);
  try {
    return await toPng(node, {
      width,
      height,
      pixelRatio: 1,
      cacheBust: true,
      // The node is inside a CSS-scaled wrapper; make sure the clone is not scaled.
      style: { transform: "none", transformOrigin: "top right", margin: "0" },
    });
  } finally {
    restore();
  }
}

/** Rasterise `node` and download it as a PNG. */
export async function downloadCardPng(
  node: HTMLElement,
  { width, height, title }: { width: number; height: number; title: string },
): Promise<ExportResult> {
  try {
    const dataUrl = await renderCardPng(node, { width, height });
    // Large data URLs are not reliable download targets in embedded browsers.
    // Keep the same rendered bytes, but download through an object URL like video.
    const url = URL.createObjectURL(await (await fetch(dataUrl)).blob());
    const link = document.createElement("a");
    link.download = `${slug(title)}-${width}x${height}.png`;
    link.href = url;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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
