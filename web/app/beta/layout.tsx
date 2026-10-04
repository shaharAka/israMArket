import type { Metadata } from "next";

/**
 * The private beta's pages (/beta, /beta/terms): reached only from an invitation, so kept
 * out of search engines and out of the site's navigation.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function BetaLayout({ children }: LayoutProps<"/beta">) {
  return children;
}
