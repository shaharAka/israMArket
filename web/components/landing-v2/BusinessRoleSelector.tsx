"use client";

import Link from "next/link";
import { Copy, useCopy } from "@/components/language/LanguageProvider";
import { IconCheck } from "@/lib/icons";
import type { ExamplePath } from "./businessExamples";
import styles from "./business-role-selector.module.css";

/** Page choices: distinct from the controls for the product demonstration. */
export function BusinessRoleSelector({ path, segment, hrefFor, onSelect }: { path: ExamplePath; segment?: string; onSelect?: (segment: string) => void; hrefFor: (path: ExamplePath, segment: string) => string }) {
  const t = useCopy();
  const choices: { path: ExamplePath; segment: string; label: string }[] = [
    { path: "nonprofit", segment: "fundraising", label: "מגייסים תרומות" },
    { path: "saas", segment: "software", label: "מוכרים תוכנה" },
    { path: "services", segment: "services", label: "נותנים שירות" },
    { path: "products", segment: "online_shop", label: "בעלי חנות אונליין" },
    { path: "products", segment: "physical_shop", label: "בעלי חנות פיזית" },
  ];
  return <div className={styles.group}><p className={styles.prompt}><Copy text="מה אתם עושים?" /></p><nav className={styles.choices} aria-label={t("סוג העסק")}>
    {choices.map(item => { const selected = path === item.path && (item.path !== "products" || segment === item.segment); return <Link key={item.segment}
      href={hrefFor(item.path, item.segment)} onClick={() => onSelect?.(item.segment)} scroll={false}
      aria-current={selected ? "page" : undefined} className={styles.choice}>
      <span className={styles.marker} aria-hidden="true">{selected ? <IconCheck /> : null}</span>
      <Copy text={item.label} />
    </Link>; })}</nav></div>;
}
