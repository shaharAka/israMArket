export type TrackingPlatform = "wix" | "shopify" | "wordpress" | "other";
export type TrackingDraft = { platform: TrackingPlatform | ""; step: "platform" | "install" | "check" };

export function trackingGuideKey(businessId: number | undefined, provider: "google" | "meta" | "tiktok") {
  return businessId ? `isramarket:tracking-guide:${businessId}:${provider}` : "";
}

/** Installation instructions are a draft, never evidence that events arrived. */
export function restoreTrackingDraft(raw: string | null): TrackingDraft {
  const initial: TrackingDraft = { platform: "", step: "platform" };
  try {
    const value = JSON.parse(raw || "null");
    if (!value || !["platform", "install", "check"].includes(value.step)) return initial;
    const platform = ["wix", "shopify", "wordpress", "other"].includes(value.platform) ? value.platform : "";
    if (value.step === "install" && !platform) return initial;
    return { platform, step: value.step };
  } catch { return initial; }
}
