"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { billingEndpoints, type BillingStatus } from "@/lib/billing";
import { IconChevron } from "@/lib/icons";

/**
 * Today's one quiet row about paying: only in the free month's last 7 days, and after it
 * while nothing is paid (`remind` from GET /billing/status, which is also false when
 * payment is not open on this server). Never a second dark button: the ask is /billing.
 * A failed call shows nothing.
 */
export function BillingReminder() {
  const [status, setStatus] = useState<BillingStatus | null>(null);

  useEffect(() => {
    let live = true;
    billingEndpoints
      .status()
      .then((next) => {
        if (live) setStatus(next);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (!status?.remind) return null;
  const left = status.trial.days_left;
  const text =
    status.state === "payment_failed"
      ? "החיוב האחרון לא עבר"
      : status.trial.ended
        ? "החודש החינמי נגמר"
        : left <= 1
          ? "היום נגמר החודש החינמי"
          : `החודש החינמי נגמר בעוד ${left} ימים`;

  return (
    <Link
      href="/billing"
      className="group flex min-h-14 items-center gap-3 py-3 text-[15px] leading-6 text-[color:var(--ink)]"
    >
      {/* The sun marks what is coming due; words first, the dot second. */}
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-[var(--sun)]" />
      <span className="min-w-0 flex-1">
        {text}.{" "}
        <span className="font-semibold text-[color:var(--primary)] underline-offset-4 group-hover:underline">
          {status.state === "payment_failed" ? "לבדוק את המנוי" : "להפעיל מנוי"}
        </span>
      </span>
      <IconChevron className="h-4 w-4 shrink-0 text-[color:var(--ink-muted)] transition-transform duration-200 group-hover:-translate-x-0.5 motion-reduce:transition-none" />
    </Link>
  );
}
