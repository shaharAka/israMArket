import { IdentityMark } from "./IdentityMark";

/** The selected lettering, shared by authentication, legal and product headers. */
export function ProductWordmark() {
  return <span className="product-wordmark" dir="ltr"><IdentityMark /><span className="sr-only">isramarket</span></span>;
}
