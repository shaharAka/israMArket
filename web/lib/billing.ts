/**
 * Subscription billing (api/app/routers/billing.py, docs/billing.md).
 *
 * The free month is ours; near its end the owner subscribes on /billing with PayPal's own
 * buttons. Card details go to PayPal only: this file never sees more than a subscription
 * id, and the server reads that back from PayPal before trusting it.
 *
 * Kept out of lib/api.ts on purpose, like lib/trial.ts and lib/whatsapp.ts: one feature,
 * one owner, its own demo answer.
 */
import { ApiError, api, isDemo } from "@/lib/api";
import { PRICE_ILS } from "@/lib/pricing";

export type BillingState = "trial" | "trial_ended" | "active" | "payment_failed" | "cancelled";

export type BillingStatus = {
  /** PayPal credentials and the plan are set on this server. False = payment is not open yet. */
  configured: boolean;
  /** BILLING_ENFORCE is on (and PayPal is configured). */
  enforce: boolean;
  env: "sandbox" | "live";
  price_ils: number;
  currency: "ILS";
  trial: {
    started_at: string | null;
    /** The start of day 31 (UTC, "…Z"): when the free month is over. */
    ends_at: string | null;
    /** Free days left, today included. */
    days_left: number;
    ended: boolean;
  };
  state: BillingState;
  subscription: {
    status: string;
    /** Only while the subscription renews. */
    next_billing_time: string | null;
    /** A subscription that no longer renews: open until this moment. */
    paid_through: string | null;
    cancelled_at: string | null;
    payment_failed: boolean;
  } | null;
  /** Offer the PayPal buttons. */
  needs_payment: boolean;
  /** May start new AI generation. */
  access: boolean;
  /** Enforcement is on and access is not: generation answers 402. */
  locked: boolean;
  /** Today's one-line reminder: the free month's last week, or after it with nothing paid. */
  remind: boolean;
  client_id: string | null;
  plan_id: string | null;
  custom_id: string;
  /** When the first charge should happen, or null for "now". */
  start_time: string | null;
};

/** The demo has no account to bill: payment reads as "not open yet". */
function demoStatus(): BillingStatus {
  const ends = new Date();
  ends.setDate(ends.getDate() + 18);
  return {
    configured: false,
    enforce: false,
    env: "sandbox",
    price_ils: PRICE_ILS,
    currency: "ILS",
    trial: { started_at: null, ends_at: ends.toISOString(), days_left: 18, ended: false },
    state: "trial",
    subscription: null,
    needs_payment: true,
    access: true,
    locked: false,
    remind: false,
    client_id: null,
    plan_id: null,
    custom_id: "demo",
    start_time: null,
  };
}

const DEMO_REFUSAL = "בדמו אין מנוי.";

export const billingEndpoints = {
  status: () => (isDemo() ? Promise.resolve(demoStatus()) : api<BillingStatus>("/billing/status")),
  /** After PayPal's onApprove. The server fetches the subscription from PayPal and checks it. */
  confirm: (subscription_id: string) =>
    isDemo()
      ? Promise.reject(new ApiError(DEMO_REFUSAL, 400))
      : api<BillingStatus>("/billing/paypal/confirm", { method: "POST", body: JSON.stringify({ subscription_id }) }),
  cancel: () =>
    isDemo() ? Promise.reject(new ApiError(DEMO_REFUSAL, 400)) : api<BillingStatus>("/billing/cancel", { method: "POST" }),
};

/** "31 באוקטובר 2026", in Israel's calendar. */
export function formatBillingDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jerusalem" });
}

/**
 * The last free day. `ends_at` is the first moment *after* the free month (midnight
 * starting day 31), so the day the owner reads as "the free month ends" is the one before.
 */
export function lastFreeDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return formatBillingDate(new Date(date.getTime() - 60 * 60 * 1000).toISOString());
}

/* ------------------------------ PayPal JS SDK ----------------------------- */

type PayPalButtonsInstance = {
  render: (container: HTMLElement) => Promise<void>;
  close?: () => Promise<void>;
  isEligible?: () => boolean;
};

type PayPalSubscriptionActions = {
  subscription: {
    create: (options: Record<string, unknown>) => Promise<string>;
  };
};

export type PayPalNamespace = {
  Buttons: (options: {
    style?: Record<string, unknown>;
    createSubscription: (data: unknown, actions: PayPalSubscriptionActions) => Promise<string>;
    onApprove: (data: { subscriptionID?: string | null }) => Promise<void> | void;
    onCancel?: () => void;
    onError?: (error: unknown) => void;
  }) => PayPalButtonsInstance;
};

declare global {
  interface Window {
    paypal?: PayPalNamespace;
  }
}

let sdkPromise: Promise<PayPalNamespace> | null = null;
let sdkUrl = "";

/**
 * PayPal's JS SDK for subscriptions. `vault=true&intent=subscription` is what
 * Subscriptions require; card funding is left on, so PayPal shows "Debit or Credit Card"
 * next to the PayPal button wherever it offers it.
 */
export function loadPayPalSdk(clientId: string): Promise<PayPalNamespace> {
  const params = new URLSearchParams({
    "client-id": clientId,
    vault: "true",
    intent: "subscription",
    currency: "ILS",
    locale: "he_IL",
    components: "buttons",
  });
  const url = `https://www.paypal.com/sdk/js?${params.toString()}`;
  if (sdkPromise && sdkUrl === url) return sdkPromise;
  sdkUrl = url;
  sdkPromise = new Promise<PayPalNamespace>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.onload = () => (window.paypal ? resolve(window.paypal) : reject(new Error("paypal")));
    script.onerror = () => {
      sdkPromise = null;
      script.remove();
      reject(new Error("paypal"));
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}
