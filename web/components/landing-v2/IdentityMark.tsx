import { geometricType, humanType, compactType } from "./identityFonts";
import styles from "./identity-type.module.css";
export type IdentityDirection = "grotesk" | "geometric" | "human" | "compact";
/** Typography studies, without an additional symbol. Compact form keeps the whole name. */
export function IdentityMark({ direction = "grotesk", compact = false, className = "" }: { direction?: IdentityDirection; compact?: boolean; className?: string }) {
  return <span dir="ltr" aria-hidden="true" className={`${styles.word} ${geometricType.variable} ${humanType.variable} ${compactType.variable} ${className}`} data-type={direction} data-compact={compact}><span>isra</span><span>market</span></span>;
}
