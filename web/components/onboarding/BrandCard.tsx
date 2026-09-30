"use client";

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import type { BrandSwatch } from "@/lib/api";
import { previewLogo, type SiteBrand } from "./preview";

/** The palette as a row of swatches. Read-only: colours are corrected after signup. */
export function Swatches({
  preview,
  size = "md",
}: {
  preview: { palette: BrandSwatch[] };
  size?: "sm" | "md";
}) {
  const dot = size === "sm" ? "h-5 w-5" : "h-8 w-8";
  return (
    <ul className="flex flex-wrap items-center gap-2" aria-label="הצבעים מהאתר">
      {preview.palette.slice(0, 6).map((swatch, index) => (
        <li key={`${swatch.hex}-${index}`} title={swatch.name || swatch.hex}>
          <span
            className={`block ${dot} rounded-full shadow-[inset_0_0_0_1px_var(--rule-dark)]`}
            style={{ backgroundColor: swatch.hex }}
          />
          <span className="sr-only">{swatch.name || swatch.hex}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The logo we found on the site. Renders nothing — never a broken image — when there is
 * no logo or it fails to load, so callers can drop it in unconditionally.
 */
export function BrandLogo({
  brand,
  className = "",
}: {
  brand: Pick<SiteBrand, "logo_url" | "brand_language" | "business_name">;
  className?: string;
}) {
  const url = previewLogo(brand);
  const [failed, setFailed] = useState<string | null>(null);
  if (!url || failed === url) return null;
  return (
    <img
      src={url}
      alt={`הלוגו של ${brand.business_name || "העסק"}`}
      referrerPolicy="no-referrer"
      onError={() => setFailed(url)}
      className={`block h-12 w-auto max-w-[220px] object-contain sm:h-16 sm:max-w-[300px] ${className}`}
    />
  );
}

/**
 * What we read off the site, as one block: logo, business name, the palette and the
 * style line. Takes the brand half of a preview (`POST /public/brand`) or a full
 * `SitePreview`. No border of its own — the page decides whether it sits in a card.
 */
export function BrandCard({
  brand,
  label = "זה מה שראינו באתר שלכם",
  headingLevel = 1,
  showVoice = true,
  className = "",
}: {
  brand: Pick<SiteBrand, "business_name" | "palette" | "voice" | "logo_url" | "brand_language">;
  /** Small line above the logo; "" to omit. */
  label?: string;
  /** The business name is the page heading on the landing page; 2 inside a flow. */
  headingLevel?: 1 | 2 | 3;
  showVoice?: boolean;
  className?: string;
}) {
  const Heading = `h${headingLevel}` as "h1" | "h2" | "h3";
  return (
    <div className={`space-y-4 ${className}`}>
      <div>
        {label ? <p className="text-[13px] font-semibold text-[var(--primary)]">{label}</p> : null}
        <BrandLogo brand={brand} className="mt-3" />
        <Heading className="mt-1 text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
          {brand.business_name || "העסק שלכם"}
        </Heading>
      </div>
      <Swatches preview={brand} />
      {showVoice && brand.voice ? (
        <p className="text-sm leading-6 text-[var(--ink-soft)] sm:text-base sm:leading-7">
          <span className="font-bold text-[var(--ink)]">הסגנון: </span>
          {brand.voice}
        </p>
      ) : null}
    </div>
  );
}
