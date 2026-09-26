"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { CardStage } from "@/components/CardCanvas";
import { previewBrand, previewCardPost, previewLogo, type SitePreview } from "./preview";

/** The palette as a row of swatches. Read-only: colours are corrected after signup. */
export function Swatches({ preview, size = "md" }: { preview: SitePreview; size?: "sm" | "md" }) {
  const dot = size === "sm" ? "h-5 w-5" : "h-8 w-8";
  return (
    <ul className="flex flex-wrap items-center gap-2" aria-label="הצבעים מהאתר">
      {preview.palette.slice(0, 6).map((swatch, index) => (
        <li key={`${swatch.hex}-${index}`} title={swatch.name || swatch.hex}>
          <span
            className={`block ${dot} rounded-full border border-black/10`}
            style={{ backgroundColor: swatch.hex }}
          />
          <span className="sr-only">{swatch.name || swatch.hex}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The logo we found on the site, shown beside the business name so the owner can see at
 * a glance that we read *their* brand. Hidden (not a broken image) if it fails to load.
 */
export function PreviewLogo({ preview, className = "" }: { preview: SitePreview; className?: string }) {
  const url = previewLogo(preview);
  const [failed, setFailed] = useState(false);
  if (!url || failed) return null;
  return (
    <img
      src={url}
      alt={`הלוגו של ${preview.business_name || "העסק"}`}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`block h-12 w-auto max-w-[220px] object-contain sm:h-16 sm:max-w-[300px] ${className}`}
    />
  );
}

/** Resolves to the URL once the image has loaded, or "" if it cannot. */
function useLoadable(url: string | undefined): { ready: boolean; url: string } {
  const [state, setState] = useState<{ for: string; ok: boolean } | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    const probe = new Image();
    probe.referrerPolicy = "no-referrer";
    probe.onload = () => alive && setState({ for: url, ok: probe.naturalWidth > 0 });
    probe.onerror = () => alive && setState({ for: url, ok: false });
    probe.src = url;
    // A photo that has not arrived in 4 seconds is not worth holding the card for.
    const timer = window.setTimeout(() => alive && setState((s) => s ?? { for: url, ok: false }), 4000);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [url]);
  if (!url) return { ready: true, url: "" };
  if (!state || state.for !== url) return { ready: false, url: "" };
  return { ready: true, url: state.ok ? url : "" };
}

/**
 * The sample post as it would appear: the brand card on top, the caption under it.
 *
 * With a clean photo from the site that actually loads, the split card (photo on top,
 * headline on the brand colour); otherwise the typographic card in the brand colours.
 * Either way the business's own logo sits on the card. The photo is checked before the
 * card chooses its layout, so a blocked or broken image can never leave a grey
 * placeholder where the post should be.
 */
export function SamplePostCard({ preview }: { preview: SitePreview }) {
  const sample = preview.sample_post;
  const photo = useLoadable(sample?.photo_url);
  if (!sample) return null;
  return (
    <figure className="overflow-hidden rounded-lg border border-[#e6e4dc] bg-white">
      {photo.ready ? (
        <CardStage
          post={previewCardPost(sample, photo.url)}
          brand={previewBrand(preview)}
          businessName={preview.business_name}
          logoUrl={previewLogo(preview)}
          rounded={false}
        />
      ) : (
        <div className="aspect-[4/5] w-full animate-pulse bg-[#eceae4]" aria-hidden />
      )}
      <figcaption className="space-y-1 px-4 py-3 text-sm leading-6 text-[#191b18]">
        <p className="font-bold">{sample.hook}</p>
        <p className="line-clamp-2 text-[#4f524b]">{sample.caption}</p>
      </figcaption>
    </figure>
  );
}
