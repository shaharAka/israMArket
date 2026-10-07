import { ProductWordmark } from "@/components/landing-v2/ProductWordmark";
import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./PublicNotice.module.css";

/**
 * The shell of the public "something is off" pages (the 404 and the error page): the
 * landing's bar, a title, one line, and the way on. `actions` is the page's one filled
 * action plus at most one quiet link (PublicNoticeLink).
 */
export function PublicNotice({ title, lead, actions }: { title: string; lead: string; actions: ReactNode }) {
  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <div className={`${styles.wrap} ${styles.navRow}`}>
          <Link href="/" className={styles.brand} aria-label="ישראמארקט, לעמוד הראשי">
            <ProductWordmark />
          </Link>
        </div>
      </header>
      <main className={`${styles.wrap} ${styles.main}`}>
        <div className={styles.body}>
          <span className={styles.mark} aria-hidden />
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.lead}>{lead}</p>
          <div className={styles.actions}>{actions}</div>
        </div>
      </main>
    </div>
  );
}

export const PUBLIC_NOTICE_PRIMARY = styles.primary;
export const PUBLIC_NOTICE_LINK = styles.link;
