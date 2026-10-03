import type { Business, IntegrationsPayload, SetupPayload } from "@/lib/api";

export type ConnectionKey = "website" | "whatsapp" | "ga4" | "meta";
export type ConnectionRecommendation = { key: ConnectionKey; title: string; why: string };

/** The saved plan chooses the sources. A public link never counts as permission. */
export function connectionRecommendation(business: Business | null, setup: SetupPayload | null, data: IntegrationsPayload | null, whatsappSet: boolean): ConnectionRecommendation | null {
  if (!business || !setup || !data) return null;
  const items = setup.groups.flatMap(group => group.items);
  const planned = business.quarter_plan?.integrations || [];
  const ga4 = data.integrations.find(item => item.provider === "ga4");
  const meta = data.integrations.find(item => item.provider === "meta");
  const googleWhy = planned.find(item => item.key === "ga4")?.why_he || "נבדוק מאיפה מגיעים אנשים לאתר ומה הם עושים בו, כדי לדייק את התוכנית.";
  const metaWhy = planned.find(item => ["instagram_insights", "facebook_insights", "meta_business"].includes(item.key))?.why_he || "נלמד אילו פוסטים מעוררים עניין, כדי לדייק את הפוסט הבא בתוכנית.";

  // An unfinished consent return comes first, even after a subsequent plan change.
  if (ga4?.status === "select_property" && ga4.properties?.length) return { key: "ga4", title: "לבחור את האתר", why: googleWhy };
  if (["select_page", "select_assets"].includes(meta?.status || "")) return { key: "meta", title: "לבחור את הדף העסקי", why: metaWhy };
  if (ga4?.external_id && ["unchecked", "reconnect", "unavailable"].includes(ga4.source_readiness?.status || "")) {
    return { key: "ga4", title: "לבדוק את נתוני האתר", why: googleWhy };
  }
  if (meta?.connected && ["unchecked", "reconnect", "permission", "unavailable"].includes(meta.source_readiness?.status || "")) {
    return { key: "meta", title: "לבדוק את נתוני פייסבוק ואינסטגרם", why: metaWhy };
  }
  if (!whatsappSet && planned.some(item => item.key === "whatsapp_link")) {
    return { key: "whatsapp", title: "להכין קישור לוואטסאפ", why: "נוכל לראות מאיפה לחצו לפנות אליכם. לחיצה אינה הודעה או לקוח." };
  }
  for (const item of items) {
    if (item.key === "google" && business.website_url && data.ga4_ready && !ga4?.connected) return { key: "ga4", title: item.title, why: googleWhy };
    if (item.key === "instagram" && data.meta_ready && !meta?.connected) return { key: "meta", title: "פייסבוק ואינסטגרם", why: metaWhy };
  }
  return null;
}
