"use client";

import { useState } from "react";
import { Button, ErrorNote } from "@/components/AppShell";
import { CARD, FIELD, LABEL } from "@/components/account/setupStyles";
import { endpoints, type Business } from "@/lib/api";
import { IconChevron } from "@/lib/icons";

const labels = { website: "האתר", instagram: "אינסטגרם", facebook: "פייסבוק", tiktok: "טיקטוק" };
type LinkKey = keyof typeof labels;

/** Public research links saved during onboarding, separate from provider permissions. */
export function PendingLinks({ business, onSaved }: { business: Business; onSaved: (business: Business) => void }) {
  const entries = Object.entries(business.owner_context?.pending_links ?? {}) as [LinkKey, { url: string; error: string }][];
  const [values, setValues] = useState<Partial<Record<LinkKey, string>>>({});
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  if (!entries.length) return null;

  async function save() {
    setPending(true);
    setError("");
    try {
      const result = await endpoints.saveOwnerContext({ links: Object.fromEntries(entries.map(([key, item]) => [key, values[key] ?? item.url])) });
      if (result.business) onSaved(result.business);
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא הצלחנו לשמור. אפשר לנסות שוב.");
    } finally {
      setPending(false);
    }
  }

  // A card with the sun's dot, not a coloured side rule: something left for later, not an alarm.
  return <section id="pending-links" className={`${CARD} mb-6 px-5 pt-5 pb-2 sm:px-6`}>
    <h2 className="flex items-center gap-2.5 text-[16px] font-semibold leading-6 text-[color:var(--ink)]">
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-[var(--sun)] shadow-[0_0_0_4px_var(--sand)]" />
      קישורים שהשארנו להמשך
    </h2>
    <p className="mt-1.5 ps-[18px] text-[14px] leading-6 text-[color:var(--ink-soft)]">התוכנית ממשיכה גם בלעדיהם. הם לא שימשו למחקר; אפשר להחליף בקישור לעסק, או למחוק אם אינם רלוונטיים.</p>
    <details className="group mt-2 ps-[18px]">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-[14px] font-semibold text-[color:var(--primary)] transition-colors hover:text-[color:var(--primary-dark)] [&::-webkit-details-marker]:hidden">
        לתקן את הקישורים
        <IconChevron className="h-4 w-4 shrink-0 -rotate-90 transition-transform duration-200 group-open:rotate-90" />
      </summary>
      <form className="space-y-5 pb-4 pt-2" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        {entries.map(([key, item]) => <label className="block" key={key}>
          <span className={LABEL}>{labels[key]}</span>
          <input dir="ltr" className={FIELD} value={values[key] ?? item.url} maxLength={300} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} />
          <span className="mt-1.5 block text-[13px] leading-5 text-[color:var(--ink-muted)]">{item.error}</span>
        </label>)}
        <ErrorNote message={error} />
        {/* An outline: the page's one filled button belongs to the connection it is asking for. */}
        <Button type="submit" variant="outline" disabled={pending}>{pending ? "שומרים…" : "לשמור את התיקון"}</Button>
      </form>
    </details>
  </section>;
}
