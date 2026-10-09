"use client";

import { Copy } from "@/components/language/LanguageProvider";

import { useState } from "react";
import { IconCheck } from "@/lib/icons";
import { confirmStep, useTrialStep } from "@/lib/trial";

/**
 * The free month's "check the Google business card" step, confirmed where the card's
 * checklist is (/promotion). Nothing about the card can be read without the owner's Google
 * login, so the owner says it — once, quietly: an outline button, never the page's ask.
 * Renders nothing outside the journey.
 */
export function GbpConfirm() {
  const { step, payload } = useTrialStep("gbp");
  const [busy, setBusy] = useState(false);
  if (!payload || payload.ended || !step) return null;
  if (step.status === "done") {
    return (
      <p className="mt-2 flex items-center gap-2 text-xs font-bold text-[color:var(--primary)]">
        <IconCheck className="h-4 w-4" />
        <Copy text="סימנתם שהכרטיס קיים ומעודכן" /></p>
    );
  }
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void confirmStep("gbp").finally(() => setBusy(false));
      }}
      className="mt-2 inline-flex min-h-11 items-center rounded-xl border border-[var(--rule-dark)] bg-[var(--paper)] px-4 text-sm font-semibold text-[color:var(--ink)] transition-colors hover:bg-[var(--soft)] disabled:opacity-50"
    >
      <Copy text="בדקנו, הכרטיס קיים ומעודכן" /></button>
  );
}
