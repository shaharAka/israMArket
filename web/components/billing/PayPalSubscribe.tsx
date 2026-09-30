"use client";

import { useEffect, useRef, useState } from "react";
import { SetupNotice } from "@/components/account/SetupNotice";
import { ApiError } from "@/lib/api";
import { billingEndpoints, loadPayPalSdk, type BillingStatus } from "@/lib/billing";

/**
 * PayPal's own subscribe buttons: a PayPal account, or "Debit or Credit Card" (card
 * funding is left on; PayPal decides where it is offered). Card details are typed into
 * PayPal's window, never into ours.
 *
 * createSubscription sends our plan, the owner's id as `custom_id` (the server refuses a
 * subscription whose custom_id is not the signed-in account), and `start_time` when the
 * first charge is in the future — the day the free month (or a paid period) ends.
 * Success is shown only after POST /billing/paypal/confirm answers: the server reads the
 * subscription back from PayPal before it counts.
 */
export function PayPalSubscribe({
  status,
  onConfirmed,
}: {
  status: BillingStatus;
  onConfirmed: (next: BillingStatus) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const confirmed = useRef(onConfirmed);
  const [phase, setPhase] = useState<"loading" | "ready" | "confirming">("loading");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    confirmed.current = onConfirmed;
  }, [onConfirmed]);

  const { client_id: clientId, plan_id: planId, custom_id: customId, start_time: startTime } = status;

  useEffect(() => {
    const node = container.current;
    if (!clientId || !planId || !node) return;
    let cancelled = false;
    let buttons: { close?: () => Promise<void> } | null = null;
    loadPayPalSdk(clientId)
      .then((paypal) => {
        if (cancelled) return;
        const instance = paypal.Buttons({
          style: { layout: "vertical", shape: "rect", label: "subscribe" },
          createSubscription: (_data, actions) => {
            setError("");
            setNote("");
            return actions.subscription.create({
              plan_id: planId,
              custom_id: customId,
              ...(startTime ? { start_time: startTime } : {}),
              application_context: {
                brand_name: "ישראמארקט",
                shipping_preference: "NO_SHIPPING",
                user_action: "SUBSCRIBE_NOW",
              },
            });
          },
          onApprove: async (data) => {
            const id = data.subscriptionID;
            if (!id) {
              setError("פייפאל לא החזיר מספר מנוי. נסו שוב.");
              return;
            }
            setPhase("confirming");
            try {
              const next = await billingEndpoints.confirm(id);
              if (!cancelled) confirmed.current(next);
            } catch (err) {
              if (cancelled) return;
              setPhase("ready");
              setError(
                err instanceof ApiError && err.message
                  ? err.message
                  : "המנוי אושר בפייפאל, אבל לא הצלחנו לשמור אותו אצלנו. רעננו את העמוד בעוד דקה.",
              );
            }
          },
          onCancel: () => setNote("התשלום לא הושלם. אפשר לנסות שוב מתי שתרצו."),
          onError: () => setError("לא הצלחנו לפתוח את התשלום בפייפאל. נסו שוב."),
        });
        buttons = instance;
        return instance.render(node).then(() => {
          if (!cancelled) setPhase("ready");
        });
      })
      .catch(() => {
        if (!cancelled) setError("לא הצלחנו לטעון את התשלום של פייפאל. בדקו את החיבור לאינטרנט ונסו שוב.");
      });
    return () => {
      cancelled = true;
      void buttons?.close?.().catch(() => {});
      node.innerHTML = "";
    };
  }, [clientId, planId, customId, startTime]);

  return (
    <div className="space-y-3">
      {phase === "loading" && !error ? (
        <p className="text-[14px] text-[color:var(--ink-soft)]" role="status">
          טוענים את התשלום של פייפאל…
        </p>
      ) : null}
      {phase === "confirming" ? (
        <p className="text-[14px] text-[color:var(--ink-soft)]" role="status">
          שומרים את המנוי…
        </p>
      ) : null}
      <div ref={container} aria-busy={phase !== "ready"} hidden={phase === "confirming"} />
      {error ? <SetupNotice tone="error" title={error} /> : null}
      {note ? <p className="text-[14px] leading-6 text-[color:var(--ink-soft)]">{note}</p> : null}
    </div>
  );
}
