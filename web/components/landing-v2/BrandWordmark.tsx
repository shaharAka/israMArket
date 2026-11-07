import { IdentityMark, type IdentityDirection } from "./IdentityMark";
/** The full name on one line, on desktop and phone. The stacked "isra / market" study stays
 * opt-in on the identity workshop; phones get a smaller size instead of a second line. */
export function BrandWordmark({ direction = "open" }: { direction?: IdentityDirection }) {
  return <><span className="lv2-identity-wordmark"><IdentityMark direction={direction} /></span><span className="sr-only">isramarket</span></>;
}
