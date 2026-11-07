import type { IntegrationsPayload } from "@/lib/api";

type Item = IntegrationsPayload["integrations"][number];
/** A consent return is not another request for consent: name the actual next step. */
export function connectionSummary(provider: string, item?: Item, available?: boolean) {
  const state = provider === "tiktok" ? item?.tiktok_data?.source_readiness : item?.source_readiness;
  const status = state?.status;
  if (available === false) return { label: "החיבור עדיין לא זמין", action: "לראות את אפשרויות החיבור" };
  if (["reconnect", "permission"].includes(status || "") || item?.status === "reconnect") return { label: "נשאר לחדש את הגישה", action: "לחדש את הגישה" };
  if (item?.connected && ["ready", "empty", "partial"].includes(status || "")) return {
    label: status === "empty" ? "הקריאה הצליחה. עוד אין פעילות" : status === "partial" ? "התקבלו נתונים חלקיים" : "הנתונים נקראו",
    action: status === "partial" ? "להשלים את החיבור" : "לבדוק את החיבור",
  };
  if (["no_properties", "no_sites"].includes(status || "")) return { label: "הגישה אושרה. האתר לא מופיע בחשבון", action: "לבחור חשבון גוגל אחר" };
  if (["select_property", "select_site"].includes(item?.status || "")) return { label: "הגישה אושרה. נשאר לבחור אתר", action: "לבחור את האתר" };
  if (["select_page", "select_assets", "select_account"].includes(item?.status || "")) return { label: "הגישה אושרה. נשאר לבחור את העסק", action: "לבחור את העסק" };
  if (item?.connected || status === "unavailable") return { label: "הגישה אושרה. נשאר לקרוא נתונים", action: "לבדוק את הנתונים" };
  return { label: "אפשר לחבר את החשבון שלכם", action: "להמשיך לחיבור" };
}
