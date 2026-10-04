"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { SetupNotice } from "@/components/account/SetupNotice";
import { CARD, TEXT_ACTION } from "@/components/account/setupStyles";
import { PayPalSubscribe } from "@/components/billing/PayPalSubscribe";
import { UIAction, UIDialog } from "@/components/design/Controls";
import { ApiError } from "@/lib/api";
import { billingEndpoints, formatBillingDate, lastFreeDay, type BillingStatus } from "@/lib/billing";
import { IconArrowRight } from "@/lib/icons";
import { formatPrice, TRIAL_LABEL, VAT_NOTE } from "@/lib/pricing";

/** The subscription is one object: its state, its facts and its one action, on one card. */
const PLAN_CARD = `${CARD} space-y-5 p-5 sm:p-7`;
import { toast } from "@/lib/ui";

/**
 * המנוי (`/billing`, linked from /account and from Today's reminder). api/app/routers/billing.py.
 *
 * The free month is ours and needs no card. Here the owner sees when it ends and subscribes
 * with PayPal's own buttons (PayPal or a card, typed into PayPal's window). States: payment
 * not open on this server, in the free month, the month over, active, cancelled (open until
 * the paid period ends), a failed charge.
 *
 * One dark action per page (UI-RULES 1): PayPal's buttons. Cancelling is a quiet outline
 * button with a confirmation. No invoice claims: tax invoices are not issued yet.
 */
export default function BillingPage() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [justSubscribed, setJustSubscribed] = useState(false);

  const load = useCallback(() => {
    billingEndpoints
      .status()
      .then((next) => {
        setStatus(next);
        setFailed(false);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) return; // AppShell redirects
        setFailed(true);
      });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const onConfirmed = useCallback((next: BillingStatus) => {
    setStatus(next);
    setJustSubscribed(true);
    toast("המנוי הופעל");
  }, []);

  return (
    <AppShell>
      <div className="mx-auto max-w-[640px]">
        <PageHeader title="המנוי" />

        {failed ? (
          <SetupNotice tone="error" title="לא הצלחנו לטעון את פרטי המנוי. נסו לרענן את העמוד." />
        ) : !status ? (
          <p className="text-[14px] text-[color:var(--ink-soft)]" role="status">
            טוענים…
          </p>
        ) : (
          <BillingBody status={status} setStatus={setStatus} justSubscribed={justSubscribed} onConfirmed={onConfirmed} />
        )}

        <p className="mt-8">
          <Link href="/account" className={`${TEXT_ACTION} !text-[color:var(--ink-soft)] hover:!text-[color:var(--ink)]`}>
            <IconArrowRight className="h-4 w-4" />
            חזרה לחשבון
          </Link>
        </p>
      </div>
    </AppShell>
  );
}

function BillingBody({
  status,
  setStatus,
  justSubscribed,
  onConfirmed,
}: {
  status: BillingStatus;
  setStatus: (next: BillingStatus) => void;
  justSubscribed: boolean;
  onConfirmed: (next: BillingStatus) => void;
}) {
  const price = `${formatPrice(status.price_ils)} לחודש, ${VAT_NOTE}.`;
  const freeUntil = lastFreeDay(status.trial.ends_at);
  const sub = status.subscription;

  if (status.exempt) {
    return (
      <div className={PLAN_CARD}>
        <p className="text-[17px] font-semibold leading-7 tracking-[-0.01em] text-[color:var(--ink)]">
          החשבון שלכם פתוח בלי תשלום.
        </p>
        <p className="text-[14px] leading-6 text-[color:var(--ink-soft)]">אין מנוי להפעיל ולא נבקש תשלום.</p>
      </div>
    );
  }

  if (!status.configured) {
    return (
      <div className={PLAN_CARD}>
        <p className="text-[17px] font-semibold leading-7 tracking-[-0.01em] text-[color:var(--ink)]">
          {TRIAL_LABEL}. אחר כך {price}
        </p>
        <SetupNotice title="התשלום עוד לא פתוח">החודש החינמי ממשיך כרגיל. לא נבקש תשלום לפני שהוא ייפתח כאן.</SetupNotice>
      </div>
    );
  }

  if (status.state === "active" && sub) {
    return (
      <div className={PLAN_CARD}>
        {justSubscribed ? (
          <SetupNotice tone="success" title="המנוי הופעל" />
        ) : (
          <p className="text-[17px] font-semibold leading-7 tracking-[-0.01em] text-[color:var(--ink)]">המנוי פעיל.</p>
        )}
        <Rows
          rows={[
            !sub.next_billing_time
              ? null
              : status.trial.ended
                ? `החיוב הבא: ${formatBillingDate(sub.next_billing_time)}.`
                : `החיוב הראשון: ${formatBillingDate(sub.next_billing_time)}, אחרי שהחודש החינמי נגמר.`,
            price,
            "התשלום דרך פייפאל. את פרטי הכרטיס אנחנו לא רואים.",
          ]}
        />
        <CancelSubscription status={status} onCancelled={setStatus} />
      </div>
    );
  }

  if (status.state === "payment_failed" && !status.needs_payment) {
    // Still ACTIVE at PayPal, which retries the charge: a second subscription would double it.
    return (
      <div className={PLAN_CARD}>
        <SetupNotice tone="attention" title="החיוב האחרון לא עבר">
          פייפאל ינסה לחייב שוב. כדי שזה יעבור, עדכנו את אמצעי התשלום בחשבון הפייפאל שלכם.
        </SetupNotice>
        <Rows rows={[price]} />
        <CancelSubscription status={status} onCancelled={setStatus} />
      </div>
    );
  }

  // Everything else subscribes: the free month, after it, cancelled, suspended.
  const firstCharge = status.start_time ? formatBillingDate(status.start_time) : "";
  let lead: ReactNode;
  if (status.state === "cancelled" && sub?.paid_through) {
    lead = `המנוי בוטל. הכול פתוח עד ${formatBillingDate(sub.paid_through)}.`;
  } else if (status.state === "payment_failed") {
    lead = "החיובים לא עברו, והמנוי הושהה. אפשר להפעיל מנוי חדש, והקודם יבוטל.";
  } else if (status.trial.ended) {
    lead = `החודש החינמי נגמר ב-${freeUntil}.`;
  } else {
    lead =
      status.trial.days_left <= 1
        ? "היום הוא היום האחרון של החודש החינמי."
        : `החודש החינמי נגמר ב-${freeUntil}. נשארו ${status.trial.days_left} ימים.`;
  }

  return (
    <div className={PLAN_CARD}>
      <p className="text-[17px] font-semibold leading-7 tracking-[-0.01em] text-[color:var(--ink)]">{lead}</p>
      {status.locked ? (
        <p className="text-[14px] leading-6 text-[color:var(--ink-soft)]">
          כדי להמשיך ליצור פוסטים ותוכניות, צריך מנוי. כל מה שכבר נוצר נשאר פתוח.
        </p>
      ) : null}
      <Rows
        rows={[
          price,
          !firstCharge
            ? "החיוב הראשון ביום ההפעלה."
            : status.trial.ended
              ? `החיוב הראשון ב-${firstCharge}, כשהתקופה ששילמתם עליה נגמרת.`
              : `החיוב הראשון רק ב-${firstCharge}, אחרי שהחודש החינמי נגמר.`,
          "אפשר לבטל בכל רגע, כאן בעמוד.",
          "משלמים בפייפאל, עם חשבון פייפאל או בכרטיס אשראי. את פרטי הכרטיס אנחנו לא רואים.",
        ]}
      />
      {status.needs_payment ? <PayPalSubscribe status={status} onConfirmed={onConfirmed} /> : null}
    </div>
  );
}

function Rows({ rows }: { rows: (string | null)[] }) {
  return (
    <ul className="divide-y divide-[var(--rule)] border-t border-[var(--rule)]">
      {rows.filter(Boolean).map((row) => (
        <li key={row} className="py-3 text-[15px] leading-6 text-[color:var(--ink)]">
          {row}
        </li>
      ))}
    </ul>
  );
}

function CancelSubscription({ status, onCancelled }: { status: BillingStatus; onCancelled: (next: BillingStatus) => void }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const until = status.subscription?.next_billing_time ?? status.trial.ends_at;

  async function cancel() {
    setPending(true);
    setError("");
    try {
      const next = await billingEndpoints.cancel();
      setOpen(false);
      onCancelled(next);
      toast("המנוי בוטל");
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "לא הצלחנו לבטל את המנוי. נסו שוב.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <UIAction variant="secondary" onClick={() => setOpen(true)}>
        לבטל את המנוי
      </UIAction>
      <UIDialog
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        title="לבטל את המנוי?"
        description={until ? `לא נחייב יותר. הכול נשאר פתוח עד ${formatBillingDate(until)}.` : "לא נחייב יותר."}
      >
        {error ? <SetupNotice tone="error" title={error} /> : null}
        <div className="mt-4 flex flex-wrap gap-3">
          <UIAction variant="danger" busy={pending} busyLabel="מבטלים…" onClick={() => void cancel()}>
            לבטל את המנוי
          </UIAction>
          <UIAction variant="text" disabled={pending} onClick={() => setOpen(false)}>
            להשאיר את המנוי
          </UIAction>
        </div>
      </UIDialog>
    </>
  );
}
