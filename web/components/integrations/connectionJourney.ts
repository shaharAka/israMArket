import type { IntegrationsPayload, MetaSourceReadiness } from "@/lib/api";

type Item = IntegrationsPayload["integrations"][number];
export type JourneyProvider = "ga4" | "meta" | "tiktok";
export type JourneyStep = "done" | "current" | "waiting";
export type ConnectionJourney = {
  steps: JourneyStep[];
  action: string;
  usable: boolean;
  checkedAt?: string | null;
  streams: { label: string; status: string; usable: boolean }[];
};

const READ_LABELS: Record<string, string> = {
  ready: "יש נתונים", empty: "עוד אין פעילות", partial: "יש נתונים חלקיים",
  permission: "צריך לאשר גישה", reconnect: "צריך לחדש גישה",
  unavailable: "הקריאה לא הושלמה", unchecked: "עוד לא נבדק",
  reading: "קוראים נתונים", link_instagram: "נשאר לקשר אינסטגרם",
  unsupported: "הנתון עדיין לא זמין", not_selected: "לא נבחר", not_connected: "לא מחובר",
};

/** Permission, selection and measured activity are independent. A guide never advances them. */
export function connectionJourney(provider: JourneyProvider, item: Item | undefined, available: boolean): ConnectionJourney {
  const source = provider === "tiktok" ? item?.tiktok_data?.source_readiness : item?.source_readiness;
  const status = source?.status || "unchecked";
  const renewing = ["reconnect", "permission"].includes(status);
  const permission = Boolean(item && ["connected", "select_property", "select_page", "select_assets", "select_account"].includes(item.status));
  const selected = Boolean(item?.connected && item.external_id);
  const usable = selected && ["ready", "partial"].includes(status);
  // An empty successful read completes setup, but supplies no activity to optimize.
  const read = selected && ["ready", "empty"].includes(status);
  const current = renewing ? 0 : !permission ? 0 : !selected ? 1 : 2;
  const steps: JourneyStep[] = [0, 1, 2].map(index => read && !renewing || index < current ? "done" : index === current ? "current" : "waiting");
  const action = !available ? "לראות איך מכינים את החיבור" : renewing ? "לחדש את הגישה"
    : !permission ? "לחבר את החשבון" : !selected ? provider === "ga4" ? "לבחור את האתר" : "לבחור את העסק"
    : status === "partial" ? "להשלים את החיבור" : read ? "לראות את הנתונים וההגדרות" : "לבדוק את הנתונים";
  const state = (name?: string) => ({ status: READ_LABELS[name || "unchecked"] || READ_LABELS.unchecked,
    usable: name === "ready" || name === "partial" });
  let streams: ConnectionJourney["streams"];
  if (provider === "meta") {
    const sections = (source as MetaSourceReadiness | undefined)?.sections;
    const selection = (source as MetaSourceReadiness | undefined)?.selection;
    const sectionState = (key: string, chosen: boolean) => {
      if (!chosen) return state("not_selected");
      const section = sections?.[key];
      return section?.retained_at ? { status: "נתונים שמורים", usable: false }
        : state(section?.recovery_status ? "partial" : section?.status);
    };
    // No global “connected” badge can establish readiness for every Meta product.
    streams = [
      { label: "פוסטים בפייסבוק", ...sectionState("facebook", Boolean(selected && selection?.page_id)) },
      { label: "פוסטים באינסטגרם", ...sectionState("social", Boolean(selected && selection?.instagram_id)) },
      ...(sections?.stories ? [{ label: "סטורי באינסטגרם", ...sectionState("stories", Boolean(selected && selection?.instagram_id)) }] : []),
      { label: "נתוני מודעות", ...sectionState("ads", Boolean(selected && item?.ad_account_id)) },
      { label: "אירועים מהאתר", status: item?.pixel_verification?.status === "receiving" ? "מתקבלים אירועים"
        : item?.pixel_id || selection?.pixel_id ? "נשאר לבדוק את המעקב" : "לא נבחר מעקב",
        usable: item?.pixel_verification?.status === "receiving" },
    ];
  } else if (provider === "tiktok") {
    streams = [{ label: "צפיות ותגובות לסרטונים", ...state(selected ? status : "not_connected") }];
  } else {
    streams = [{ label: "כניסות לאתר ומקורות שלהן", ...state(selected ? status : "not_connected") }];
  }
  return { steps: available ? steps : ["waiting", "waiting", "waiting"], action, usable: available && usable,
    checkedAt: source?.last_success_at, streams: streams.map(stream => available && !renewing ? stream : {
      ...stream, usable: false, status: stream.usable ? "נתונים שמורים" : !available ? "עדיין לא זמין" : "צריך לחדש גישה",
    }) };
}
