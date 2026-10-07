import { IdentityMark, type IdentityDirection } from "./IdentityMark";
import { Copy } from "@/components/language/LanguageProvider";

/** One name on desktop, ISMT in a compact mark on phones. */
export function BrandWordmark({ direction }: { direction?: IdentityDirection }) {
  if (direction) return <>
    <span className="lv2-identity-wordmark" dir="ltr" aria-hidden="true">isramarket</span>
    <span className="lv2-identity-symbol" aria-hidden="true"><IdentityMark direction={direction} /></span>
    <span className="sr-only"><Copy text="ישראמארקט" /></span>
  </>;
  return <>
    <span className="lv2-wordmark" dir="ltr" aria-hidden="true">isramarket<span>.</span></span>
    <span className="lv2-compact-mark" dir="ltr" aria-hidden="true"><span>IS</span><span>MT</span></span>
    <span className="sr-only"><Copy text="ישראמארקט" /></span>
  </>;
}
