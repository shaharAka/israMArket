"use client";

import { CardStage } from "@/components/CardCanvas";
import { previewBrand, previewCardPost, type SitePreview } from "./preview";

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
 * The sample post as it would appear: the brand card on top, the caption under it.
 * CardStage is reused read-only with the photo-free template, so the preview paints in
 * the business's own colours without needing a photograph or an image generation.
 */
export function SamplePostCard({ preview }: { preview: SitePreview }) {
  const sample = preview.sample_post;
  if (!sample) return null;
  return (
    <figure className="overflow-hidden rounded-lg border border-[#e6e4dc] bg-white">
      <CardStage
        post={previewCardPost(sample)}
        brand={previewBrand(preview)}
        businessName={preview.business_name}
        rounded={false}
      />
      <figcaption className="space-y-1 px-4 py-3 text-sm leading-6 text-[#191b18]">
        <p className="font-bold">{sample.hook}</p>
        <p className="line-clamp-2 text-[#4f524b]">{sample.caption}</p>
      </figcaption>
    </figure>
  );
}
