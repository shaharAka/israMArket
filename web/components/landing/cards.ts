import type { BrandSwatch } from "@/lib/api";

/** A palette colour by role, e.g. the business's primary for the showcase accents. */
export function swatch(palette: BrandSwatch[], role: string, fallback = "#191b18"): string {
  return palette.find((item) => item.role === role)?.hex ?? fallback;
}
