"use client";

import { Copy, useCopy } from "@/components/language/LanguageProvider";

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
  const t = useCopy();
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
    toast(t("המנוי הופעל"));
  }, [t]);

  return (
    <AppShell>
      <div className="mx-auto max-w-[640px]">
        <PageHeader title={t("המנוי")} />

        {failed ? (
          <SetupNotice tone="error" title={t("לא הצלחנו לטעון את פרטי המנוי. נסו לרענן את העמוד.")} />
        ) : !status ? (
          <p className="text-[14px] text-[color:var(--ink-soft)]" role="status">
            <Copy text="טוענים…" /></p>
        ) : (
          <BillingBody status={status} setStatus={setStatus} justSubscribed={justSubscribed} onConfirmed={onConfirmed} />
        )}

        <p className="mt-8">
          <Link href="/account" className={`${TEXT_ACTION} !text-[color:var(--ink-soft)] hover:!text-[color:var(--ink)]`}>
            <IconArrowRight className="h-4 w-4" />
            <Copy text="חזרה לחשבון" /></Link>
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
  const t = useCopy();
  const price = t("{arg_0} לחודש, {arg_1}.", { arg_0: formatPrice(status.price_ils), arg_1: VAT_NOTE });
  const freeUntil = lastFreeDay(status.trial.ends_at);
  const sub = status.subscription;

  if (status.exempt) {
    return (
      <div className={PLAN_CARD}>
        <p className="text-[17px] font-semibold leading-7 tracking-[-0.01em] text-[color:var(--ink)]">
          <Copy text="החשבון שלכם פתוח בלי תשלום." /></p>
        <p className="text-[14px] leading-6 text-[color:var(--ink-soft)]"><Copy text="אין מנוי להפעיל ולא נבקש תשלום." /></p>
      </div>
    );
  }

  if (!status.configured) {
    return (
      <div className={PLAN_CARD}>
        <p className="text-[17px] font-semibold leading-7 tracking-[-0.01em] text-[color:var(--ink)]">
          {TRIAL_LABEL}<Copy text=". אחר כך" />{price}
        </p>
        <SetupNotice title={t("התשלום עוד לא פתוח")}><Copy text="החודש החינמי ממשיך כרגיל. לא נבקש תשלום לפני שהוא ייפתח כאן." /></SetupNotice>
      </div>
    );
  }

  if (status.state === "active" && sub) {
    return (
      <div className={PLAN_CARD}>
        {justSubscribed ? (
          <SetupNotice tone="success" title={t("המנוי הופעל")} />
        ) : (
          <p className="text-[17px] font-semibold leading-7 tracking-[-0.01em] text-[color:var(--ink)]"><Copy text="המנוי פעיל." /></p>
        )}
        <Rows
          rows={[
            !sub.next_billing_time
              ? null
              : status.trial.ended
                ? t("החיוב הבא: {arg_0}.", { arg_0: formatBillingDate(sub.next_billing_time) })
                : t("החיוב הראשון: {arg_0}, אחרי שהחודש החינמי נגמר.", { arg_0: formatBillingDate(sub.next_billing_time) }),
            price,
            t("התשלום דרך פייפאל. את פרטי הכרטיס אנחנו לא רואים."),
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
        <SetupNotice tone="attention" title={t("החיוב האחרון לא עבר")}>
          <Copy text="פייפאל ינסה לחייב שוב. כדי שזה יעבור, עדכנו את אמצעי התשלום בחשבון הפייפאל שלכם." /></SetupNotice>
        <Rows rows={[price]} />
        <CancelSubscription status={status} onCancelled={setStatus} />
      </div>
    );
  }

  // Everything else subscribes: the free month, after it, cancelled, suspended.
  const firstCharge = status.start_time ? formatBillingDate(status.start_time) : "";
  let lead: ReactNode;
  if (status.state === "cancelled" && sub?.paid_through) {
    lead = t("המנוי בוטל. הכול פתוח עד {arg_0}.", { arg_0: formatBillingDate(sub.paid_through) });
  } else if (status.state === "payment_failed") {
    lead = t("החיובים לא עברו, והמנוי הושהה. אפשר להפעיל מנוי חדש, והקודם יבוטל.");
  } else if (status.trial.ended) {
    lead = t("החודש החינמי נגמר ב-{arg_0}.", { arg_0: freeUntil });
  } else {
    lead =
      status.trial.days_left <= 1
        ? t("היום הוא היום האחרון של החודש החינמי.")
        : t("החודש החינמי נגמר ב-{arg_0}. נשארו {arg_1} ימים.", { arg_0: freeUntil, arg_1: status.trial.days_left });
  }

  return (
    <div className={PLAN_CARD}>
      <p className="text-[17px] font-semibold leading-7 tracking-[-0.01em] text-[color:var(--ink)]">{lead}</p>
      {status.locked ? (
        <p className="text-[14px] leading-6 text-[color:var(--ink-soft)]">
          <Copy text="כדי להמשיך ליצור פוסטים ותוכניות, צריך מנוי. כל מה שכבר נוצר נשאר פתוח." /></p>
      ) : null}
      <Rows
        rows={[
          price,
          !firstCharge
            ? t("החיוב הראשון ביום ההפעלה.")
            : status.trial.ended
              ? t("החיוב הראשון ב-{arg_0}, כשהתקופה ששילמתם עליה נגמרת.", { arg_0: firstCharge })
              : t("החיוב הראשון רק ב-{arg_0}, אחרי שהחודש החינמי נגמר.", { arg_0: firstCharge }),
          t("אפשר לבטל בכל רגע, כאן בעמוד."),
          t("משלמים בפייפאל, עם חשבון פייפאל או בכרטיס אשראי. את פרטי הכרטיס אנחנו לא רואים."),
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
  const t = useCopy();
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
      toast(t("המנוי בוטל"));
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("לא הצלחנו לבטל את המנוי. נסו שוב."));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <UIAction variant="secondary" onClick={() => setOpen(true)}>
        <Copy text="לבטל את המנוי" /></UIAction>
      <UIDialog
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        title={t("לבטל את המנוי?")}
        description={until ? t("לא נחייב יותר. הכול נשאר פתוח עד {arg_0}.", { arg_0: formatBillingDate(until) }) : t("לא נחייב יותר.")}
      >
        {error ? <SetupNotice tone="error" title={error} /> : null}
        <div className="mt-4 flex flex-wrap gap-3">
          <UIAction variant="danger" busy={pending} busyLabel={t("מבטלים…")} onClick={() => void cancel()}>
            <Copy text="לבטל את המנוי" /></UIAction>
          <UIAction variant="text" disabled={pending} onClick={() => setOpen(false)}>
            <Copy text="להשאיר את המנוי" /></UIAction>
        </div>
      </UIDialog>
    </>
  );
}
