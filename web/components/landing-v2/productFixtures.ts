import type { BrandLanguage, RoadmapPost, StrategyPayload } from "@/lib/api";
import type { BrandDna } from "@/lib/dna/library";
import type { ContentLanguage } from "@/lib/content-language";
import type { MonthPlanData } from "@/components/plan/MonthPlanOverview";
import { BUSINESS_EXAMPLES, type ExamplePath } from "./businessExamples";
import { POST_EXAMPLES } from "./postExamples";

type Translate = (source: string) => string;

/** Local presentation fixtures only. No API calls, account state or paid generation. */
export function productFixtures(path: ExamplePath, t: Translate, contentLanguage: ContentLanguage = "he"): { plan: MonthPlanData; posts: RoadmapPost[]; brand: BrandLanguage; campaign: Pick<StrategyPayload, "roadmap" | "weekly_breakdown" | "business_name" | "brand_language" | "brand_dna"> } {
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
  // Three different creative jobs, not one photo with three interchangeable headlines.
  // Every public campaign belongs to one business and uses the actual editor renderer.
  const creative = {
    products: {
      display: "frank-ruhl-libre", weight: 700,
      invite: "מחר בבוקר, החלה כבר מחכה לכם.", action: "להזמין מראש",
      invitationCaption: "את החלה של שישי אפשר להזמין כבר בחמישי. שלחו לנו הודעה, ואנחנו נכין אותה לאיסוף בבוקר.",
      process: "לפני התנור, הכול מתחיל בידיים.", image: "/showcase/bakery-braiding-ai.png",
      processCaption: "לשים, קולעים, נותנים לבצק זמן. החלה של שישי מתחילה אצלנו הרבה לפני שהמאפייה נפתחת. להזמנה מראש, שלחו הודעה.",
    },
    services: {
      display: "bellefair", weight: 400,
      invite: "לפני שבוחרים צבע, בוחרים איך רוצים להרגיש בבית.", action: "לקבוע שיחת היכרות",
      invitationCaption: "לא בטוחים איך לחבר בין הצבע, הרצפה והריהוט? בשיחת היכרות נתחיל מהבית שלכם ומה שחשוב לכם בו.",
      process: "הבית מתחיל בחיבורים הקטנים.", image: "/showcase/interior-materials-ai.png",
      processCaption: "העץ, הבד והצבע לא נבחרים בנפרד. אנחנו מניחים אותם יחד, בודקים באור של הבית ורק אז מחליטים. רוצים לחשוב על הבית שלכם יחד? בואו נדבר.",
    },
    saas: {
      display: "heebo", weight: 700,
      invite: "יש לכם עסק לנהל. תנו לנו להכין את השיווק.", action: "להתחיל התנסות",
      invitationCaption: "לא עוד רשימת רעיונות שנשארת במגירה. אנחנו חוקרים את העסק, בונים תוכנית ומכינים את הפוסטים. אתם בודקים ומאשרים.",
      process: "מהתוכנית לפוסט הבא שלכם.", image: "/showcase/platform-plan-clean.png",
      processCaption: "זה מה שתראו בפלטפורמה: תוכנית לעסק שלכם, הפוסטים שנכין ממנה והסבר פשוט של התוצאות. מתחילים בהיכרות עם העסק.",
    },
    nonprofit: {
      display: "assistant", weight: 700,
      invite: "גם אתם יכולים להיות חלק מהעשייה.", action: "לתמוך בפעילות",
      invitationCaption: "רוצים להצטרף? בעמוד שלנו תוכלו לקרוא על הפעילות, לבחור איך לתמוך וליצור איתנו קשר.",
      process: "מאחורי כל אריזה, אנשים שאכפת להם.", image: "/showcase/nonprofit-volunteer-detail-ai.png",
      processCaption: "ממיינים את המצרכים, מכינים את התיקים ואורזים יחד. כך נראה עוד יום של עשייה במעגל קרוב. בעמוד הפעילות תוכלו להכיר אותנו ולבחור איך לעזור.",
    },
  }[path];
  const dna: BrandDna = {
    version: 2, type: { display: creative.display, display_weight: creative.weight, text: "assistant", text_weight: 400, scale: "large" },
    colors: { ink: business.color, paper: business.soft, accent: business.color },
    compositions: ["full_bleed", "type_led", "inset_frame"], motif: { kind: "none" },
    signature: { kind: "name_only", use_logo: false }, copy: { headline_accent: false },
  };
  const campaignPosts: RoadmapPost[] = posts.length ? [
    { ...posts[0], uid: `${posts[0].uid}-introduce`, date_hint: t("יום שלישי"),
      title: t(source?.headline || business.draft).replace(/\n/g, " "), caption: t(source?.caption || business.caption),
      has_overlay: false, overlay_headline: "", design: { composition: "full_bleed", text_mode: "photo_only" },
      cta: t(source?.action || business.draft), audience_name: t(business.audience),
      measure: { metric: "saves", label_he: t("שמירות"), link_code: "" },
      plan_link: { goal: t(business.plan), week: 1, week_focus: t(business.recommendation) } },
    { ...posts[0], uid: `${posts[0].uid}-invite`, date_hint: t("יום חמישי"),
      title: t(creative.invite), overlay_headline: t(creative.invite), caption: t(creative.invitationCaption),
      image_url: undefined, has_overlay: true, overlay_theme: "type_hero", design: { composition: "type_led", text_mode: "type_led" },
      cta: t(creative.action), audience_name: t(business.audience),
      measure: { metric: "site_visits", label_he: t("כניסות לאתר"), link_code: "" },
      plan_link: { goal: t(business.plan), week: 1, week_focus: t(business.recommendation) } },
    { ...posts[0], uid: `${posts[0].uid}-process`, week: 2, date_hint: t("יום שלישי"),
      title: t(creative.process), overlay_headline: t(creative.process), caption: t(creative.processCaption),
      image_url: creative.image, has_overlay: true, overlay_theme: "framed_inset",
      design: { composition: "inset_frame", text_mode: "headline", text_position: "top" },
      cta: t(creative.action), audience_name: t(business.audience),
      measure: { metric: "site_visits", label_he: t("כניסות לאתר"), link_code: "" },
      plan_link: { goal: t(business.plan), week: 2, week_focus: t("בודקים מה עבד ומכינים את הפוסט הבא.") } },
  ] : [];
  return { plan, posts, brand, campaign: { business_name: t(business.name), brand_language: brand, brand_dna: dna,
    roadmap: { theme: t(business.plan), summary: t(business.learned), posts: campaignPosts }, weekly_breakdown: plan.weekly_breakdown } };
}
