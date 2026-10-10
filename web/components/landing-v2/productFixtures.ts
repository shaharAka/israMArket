import type { BrandLanguage, RoadmapPost, StrategyPayload } from "@/lib/api";
import type { ContentLanguage } from "@/lib/content-language";
import type { MonthPlanData } from "@/components/plan/MonthPlanOverview";
import { BUSINESS_EXAMPLES, type ExamplePath } from "./businessExamples";
import { POST_EXAMPLES } from "./postExamples";

type Translate = (source: string) => string;

/** Local presentation fixtures only. No API calls, account state or paid generation. */
export function productFixtures(path: ExamplePath, t: Translate, contentLanguage: ContentLanguage = "he"): { plan: MonthPlanData; posts: RoadmapPost[]; brand: BrandLanguage; campaign: Pick<StrategyPayload, "roadmap" | "weekly_breakdown" | "business_name" | "brand_language"> } {
  const business = BUSINESS_EXAMPLES[path];
  const candidates = POST_EXAMPLES.filter(item => item.path === path);
  const source = candidates.find(item => item.key === ({ products: "bakery", services: "interior", saas: "software", nonprofit: "nonprofit" }[path]));
  const posts: RoadmapPost[] = (source ? [source] : candidates.slice(0, 1)).map(item => ({
    uid: `showcase-${path}-${item.key}`, content_language: contentLanguage, week: 1, date_hint: t("הפוסט הבא"), format: "image",
    title: t(business.draft), angle: t(business.recommendation), hook: t(business.draft),
    caption: t(business.caption), cta: "", calendar_tie: "", goal_fit: t(business.plan),
    image_url: item.image, image_source: "generated", image_action: "generated",
    overlay_headline: t(business.draft), overlay_theme: "lower_editorial",
    lifecycle: "ready", primary_outlet: "instagram", why_line: t(business.recommendation),
    owner_needs: [], approval_status: "review",
    plan_link: { goal: t(business.plan), week: 1, week_focus: t(business.recommendation) },
  }));
  const plan: MonthPlanData = {
    month_name_he: t("אוקטובר"),
    usp: { usp: t(business.plan), usp_one_liner: t(business.plan), growth_hypothesis: t(business.plan),
      why_now: t(business.learned), competitor_gaps: [], risks: [], proof_points: [], messaging_pillars: [] },
    roadmap: { theme: t(business.plan), summary: t(business.learned), posts },
    monthly_horizon_plan: { hypothesis: t(business.plan), targets: [t(business.measure)] },
    weekly_breakdown: [
      { week: 1, focus: t(business.recommendation), what_we_do: [t("כותבים ומעצבים פוסט לפי התוכנית.")],
        what_user_does: [t("לבדוק את התמונה, הטקסט והפרטים לפני הפרסום.")],
        metrics_target: [t(business.measure)], media_distribution: "Instagram" },
      { week: 2, focus: t("בודקים מה עבד ומכינים את הפוסט הבא."),
        what_we_do: [t("מסבירים את התוצאות ומציעים מה לשנות בהמשך.")],
        what_user_does: [t("לעדכן מה קרה בעסק בעקבות הפרסום.")],
        metrics_target: [t(business.metric)], media_distribution: "Instagram" },
    ],
  };
  const brand: BrandLanguage = {
    business_name: t(business.name), palette: [
      { role: "primary", hex: business.color, name: "" }, { role: "background", hex: business.soft, name: "" },
    ], typography: { primary: "", mood: "" }, visual_style: "", photography: "", voice: "",
    voice_examples: [], do_say: [], dont_say: [], messaging: [], offers_seen: [], audience: t(business.audience), logo_description: "",
  };
  const invitation = {
    products: { title: "שישי מתחיל בהזמנה מראש.", action: "להזמין מראש" },
    services: { title: "בוחרים צבע לבית? בואו נבחר יחד.", action: "לקבוע שיחת היכרות" },
    saas: { title: "מה תפרסמו השבוע? בואו נבנה קמפיין.", action: "להתחיל התנסות" },
    nonprofit: { title: "מה התרומה שלכם מאפשרת?", action: "לתמוך בפעילות" },
  }[path];
  const campaignPosts = posts.length ? [
    { ...posts[0], uid: `${posts[0].uid}-introduce`, date_hint: t("יום שלישי"),
      title: t(source?.headline || business.draft).replace(/\n/g, " "), caption: t(source?.caption || business.caption),
      cta: t(source?.action || business.draft), audience_name: t(business.audience),
      measure: { metric: "saves" as const, label_he: t("שמירות"), link_code: "" },
      plan_link: { goal: t(business.plan), week: 1, week_focus: t(business.recommendation) } },
    { ...posts[0], uid: `${posts[0].uid}-invite`, date_hint: t("יום חמישי"),
      title: t(invitation.title), overlay_headline: t(invitation.title), cta: t(invitation.action), audience_name: t(business.audience),
      measure: { metric: "site_visits" as const, label_he: t("כניסות לאתר"), link_code: "" },
      plan_link: { goal: t(business.plan), week: 1, week_focus: t(business.recommendation) } },
    { ...posts[0], uid: `${posts[0].uid}-next`, week: 2, date_hint: t("יום שלישי"),
      title: t(business.next), cta: t(invitation.action), audience_name: t(business.audience),
      measure: { metric: "site_visits" as const, label_he: t("כניסות לאתר"), link_code: "" },
      plan_link: { goal: t(business.plan), week: 2, week_focus: t("בודקים מה עבד ומכינים את הפוסט הבא.") } },
  ] : [];
  return { plan, posts, brand, campaign: { business_name: t(business.name), brand_language: brand,
    roadmap: { theme: t(business.plan), summary: t(business.learned), posts: campaignPosts }, weekly_breakdown: plan.weekly_breakdown } };
}
