import { Copy } from "@/components/language/LanguageProvider";

/** One name on desktop, its first four letters in a compact mark on phones. */
export function BrandWordmark() {
  return <>
    <span className="lv2-wordmark" dir="ltr" aria-hidden="true">isramarket<span>.</span></span>
    <span className="lv2-compact-mark" dir="ltr" aria-hidden="true"><span>is</span><span>ra</span></span>
    <span className="sr-only"><Copy text="ישראמארקט" /></span>
  </>;
}
