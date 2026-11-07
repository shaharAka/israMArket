"use client";

import { TrackingSetupGuide } from "./TrackingSetupGuide";

/** Installation stays on the customer's website; the returned list is not proof of receipt. */
export function PixelSetupGuide({ onRefresh, busy, businessId }: { onRefresh: () => void; busy: boolean; businessId?: number }) {
  return <TrackingSetupGuide provider="meta" businessId={businessId} onReturn={onRefresh} busy={busy} returnLabel="לרענן את רשימת המעקבים" />;
}
