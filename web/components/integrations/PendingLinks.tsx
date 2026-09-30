"use client";

import { useState } from "react";
import { Button, ErrorNote } from "@/components/AppShell";
import { endpoints, type Business } from "@/lib/api";

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

  return <section id="pending-links" className="mb-6 border-s-2 border-[var(--sun)] ps-4">
    <h2 className="text-sm font-bold text-[color:var(--ink)]">קישורים שהשארנו להמשך</h2>
    <p className="mt-1 text-xs leading-6 text-[color:var(--ink-soft)]">התוכנית ממשיכה גם בלעדיהם. הם לא שימשו למחקר; אפשר להחליף בקישור לעסק, או למחוק אם אינם רלוונטיים.</p>
    <details className="mt-2">
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-bold text-[color:var(--primary)]">לתקן את הקישורים</summary>
      <form className="space-y-4 pb-3" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        {entries.map(([key, item]) => <label className="block" key={key}>
          <span className="text-xs font-bold text-[color:var(--ink)]">{labels[key]}</span>
          <input dir="ltr" className="mt-2 block w-full rounded-md border border-[var(--rule)] bg-white p-3 text-sm text-[color:var(--ink)]" value={values[key] ?? item.url} maxLength={300} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} />
          <span className="mt-1 block text-xs leading-6 text-[color:var(--ink-soft)]">{item.error}</span>
        </label>)}
        <ErrorNote message={error} />
        <Button type="submit" tone="primary" disabled={pending}>{pending ? "שומרים…" : "לשמור את התיקון"}</Button>
      </form>
    </details>
  </section>;
}
