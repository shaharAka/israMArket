import { IdentityMark, type IdentityDirection } from "./IdentityMark";
import { Copy } from "@/components/language/LanguageProvider";
/** Full name on desktop and phone; alternatives are opt-in on the identity workshop. */
export function BrandWordmark({ direction = "open" }: { direction?: IdentityDirection }) {
  return <><span className="lv2-identity-wordmark"><IdentityMark direction={direction} /></span><span className="lv2-identity-symbol"><IdentityMark direction={direction} compact /></span><span className="sr-only"><Copy text="ישראמארקט" /></span></>;
}
