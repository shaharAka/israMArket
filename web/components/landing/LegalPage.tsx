import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark, IconChevron } from "@/lib/icons";
import styles from "./legal.module.css";

/**
 * The shell of the long-form public pages (/security, /terms): the landing's bar and
 * footer, a calm title, and the text at a readable measure. On wide screens a contents
 * rail sits beside the text; it only links to the sections, it adds nothing to read.
 */

/** An inline link inside the text. */
export const LEGAL_LINK = styles.link;

export function LegalPage({
  eyebrow,
  title,
  lead,
  contents,
  current,
  children,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  /** The sections, for the contents rail (same ids and titles as the sections). */
  contents: { id: string; title: string }[];
  current: "/security" | "/terms" | "/data-deletion";
  children: ReactNode;
}) {
  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <div className={`${styles.wrap} ${styles.navRow}`}>
          <Link href="/" className={styles.brand} aria-label="ישראמארקט, לעמוד הבית">
            <BrandMark className="h-8 w-8 text-[var(--primary)]" />
            <span>ישראמארקט</span>
          </Link>
          <Link href="/" className={styles.home}>
            לעמוד הראשי
          </Link>
        </div>
      </header>

      <main className={styles.wrap}>
        <div className={styles.hero}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.lead}>{lead}</p>
        </div>
        <div className={styles.layout}>
          <div className={styles.body}>{children}</div>
          <nav className={styles.toc} aria-label="בעמוד הזה">
            <p className={styles.tocTitle}>בעמוד הזה</p>
            <ol>
              {contents.map((item) => (
                <li key={item.id}>
                  <a href={`#${item.id}`}>{item.title}</a>
                </li>
              ))}
            </ol>
          </nav>
        </div>
      </main>

      <footer className={styles.foot}>
        <div className={`${styles.wrap} ${styles.footRow}`}>
          <span>ישראמארקט</span>
          <Link href="/security" aria-current={current === "/security" ? "page" : undefined}>
            אבטחה ופרטיות
          </Link>
          <Link href="/terms" aria-current={current === "/terms" ? "page" : undefined}>
            תנאי שימוש
          </Link>
        </div>
      </footer>
    </div>
  );
}

export function LegalSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={styles.section}>
      <h2 id={`${id}-title`}>{title}</h2>
      <div className={styles.text}>{children}</div>
    </section>
  );
}

/** Facts, one per row: a hairline between them, no box around them. */
export function LegalRows({ rows }: { rows: { title: string; body: ReactNode; code?: string }[] }) {
  return (
    <dl className={styles.rows}>
      {rows.map((row) => (
        <div key={row.title}>
          <dt>{row.title}</dt>
          <dd>
            {row.body}
            {row.code ? (
              <span dir="ltr" className={styles.code}>
                {row.code}
              </span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** The short version: a sun mark per promise, the landing's trust rows. */
export function LegalPromises({ items }: { items: { title: string; line: string }[] }) {
  return (
    <ul className={styles.promises}>
      {items.map(({ title, line }) => (
        <li key={title}>
          <h3>{title}</h3>
          <p>{line}</p>
        </li>
      ))}
    </ul>
  );
}

export function LegalMore({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className={styles.more}>
      <summary>
        {summary}
        <IconChevron />
      </summary>
      {children}
    </details>
  );
}

export function LegalSubhead({ children }: { children: ReactNode }) {
  return <h3 className={styles.subhead}>{children}</h3>;
}
