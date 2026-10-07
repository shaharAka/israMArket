"use client";

import Link from "next/link";
import { Copy, useCopy } from "@/components/language/LanguageProvider";
import { IconCheck } from "@/lib/icons";
import { PERSONA_PAGES } from "./personaPages";
import type { ExamplePath } from "./businessExamples";
import styles from "./business-role-selector.module.css";

/** Page choices: distinct from the controls for the product demonstration. */
export function BusinessRoleSelector({ path, hrefFor }: { path: ExamplePath; hrefFor: (path: ExamplePath) => string }) {
  const t = useCopy();
  return <nav className={styles.choices} aria-label={t("סוג העסק")}>
    {Object.entries(PERSONA_PAGES).map(([key, item]) => <Link key={key}
      href={hrefFor(key as ExamplePath)} scroll={false}
      aria-current={path === key ? "page" : undefined} className={styles.choice}>
      <span className={styles.marker} aria-hidden="true">{path === key ? <IconCheck /> : null}</span>
      <Copy text={item.role} />
    </Link>)}
  </nav>;
}
