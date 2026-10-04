"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AppShell,
  Button,
  ErrorNote,
  PageHeader,
} from "@/components/AppShell";
import { CARD, FIELD, LABEL, TEXT_ACTION } from "@/components/account/setupStyles";
import { UIAction } from "@/components/design/Controls";
import { GUIDES } from "@/components/help/guides";
import { HowToFind } from "@/components/help/HowToFind";
import { SendToHelper } from "@/components/help/SendToHelper";
import { MetaConnection } from "@/components/integrations/MetaConnection";
import { connectionRecommendation, type ConnectionKey } from "@/components/integrations/connectionRecommendation";
import { PendingLinks } from "@/components/integrations/PendingLinks";
import { SourceReadState, sourcePresentation } from "@/components/integrations/SourceReadState";
import {
  endpoints,
  exitDemo,
  isDemo,
  type Business,
  type IntegrationsPayload,
  type SetupPayload,
} from "@/lib/api";
import {
  IconCheck,
  IconChevron,
  IconCopy,
  IconLink,
  IconWhatsApp,
} from "@/lib/icons";
import { copyText, toast } from "@/lib/ui";
import {
  FIXED_SOURCES,
  SOURCE_HINT_HE,
  whatsappEndpoints,
  type WhatsappPayload,
} from "@/lib/whatsapp";

/** A connection's card: depth, no frame; the details row sits close to the bottom edge. */
const ROW_CARD = `${CARD} px-5 pb-2 pt-5 sm:px-6 sm:pb-3 sm:pt-6`;

/** The quiet counterpart of a text action: "לנתק" is available, never inviting. */
const QUIET_ACTION =
  "inline-flex min-h-11 items-center text-[14px] font-medium text-[color:var(--ink-muted)] underline-offset-4 transition-colors hover:text-[color:var(--danger)] hover:underline";

/** A list to choose from: the field, without the browser's arrow (SelectFrame draws a chevron). */
const SELECT = `${FIELD} cursor-pointer appearance-none pe-10`;

/** A block inside an expand, after the first: a hairline above, never a box around. */
const DETAIL_BLOCK = "border-t border-[var(--rule)] pt-4";

/** The short heading of a block inside an expand. */
const DETAIL_TITLE = "font-semibold text-[color:var(--ink)]";

/** With nothing to recommend, going back to the plan is the page's one filled button. */
const BACK_TO_PLAN =
  "drawn-button inline-flex min-h-12 items-center justify-center bg-[var(--primary)] px-6 text-[15px] text-white hover:bg-[var(--primary-dark)]";

const CODE_CHIP = "rounded-md bg-[var(--paper)] px-1.5 py-0.5 font-mono text-[12px] shadow-[inset_0_0_0_1px_var(--rule)]";

/**
 * חיבורים — where the plan gets real numbers from.
 *
 * Plain Hebrew on the face (UI-RULES rule 4): Google Analytics is "נתוני האתר", because that
 * is what it is to the owner, and the product's own name appears once, inside the row's
 * expand, for whoever has to find it in Google. OAuth, `.env` keys and webhooks are for
 * operators; the customer screen explains availability and recovery instead.
 */
export default function IntegrationsPage() {
  const [data, setData] = useState<IntegrationsPayload | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [demo] = useState(() => typeof window !== "undefined" && isDemo());
  const [error, setError] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("error") || "";
  });
  const [successNote, setSuccessNote] = useState(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    if (params.get("ga4") === "connected") {
      // The one place that says consent was granted; the row below only asks for the site.
      return "הגישה לגוגל אושרה. נשאר לבחור את האתר.";
    }
    if (params.get("meta") === "connected") {
      return "התחברתם לפייסבוק. נשאר רק לבחור את הדף העסקי. אם הוא מקושר לאינסטגרם, גם החשבון ייבחר איתו.";
    }
    return "";
  });
  const [secret, setSecret] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [setup, setSetup] = useState<SetupPayload | null>(null);
  const [expanded, setExpanded] = useState<ConnectionKey | null | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    const key = window.location.hash.slice(1);
    return ["website", "whatsapp", "ga4", "meta"].includes(key) ? key as ConnectionKey : undefined;
  });

  // Selection still needs the owner's confirmation, even when only one site is listed.
  const [selectedGa4Property, setSelectedGa4Property] = useState("");
  const [savingGa4, setSavingGa4] = useState(false);

  // Website scanner state
  const [websiteInput, setWebsiteInput] = useState("");
  const [scanningWebsite, setScanningWebsite] = useState(false);

  // The WhatsApp tracked link. Loaded on its own so a failure here never blanks the page.
  const [whatsapp, setWhatsapp] = useState<WhatsappPayload | null>(null);

  async function reload(forceLive = false) {
    await endpoints
      .integrations(forceLive)
      .then((integrationsRes) => {
        setData(integrationsRes);
        const sites = integrationsRes.integrations.find(item => item.provider === "ga4")?.properties;
        if (sites?.length === 1) setSelectedGa4Property(sites[0].property_id);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "לא הצלחנו לטעון את החיבורים.");
      });

    await whatsappEndpoints
      .get()
      .then(setWhatsapp)
      .catch(() => {
        // The row shows its own empty state; the other connections still load.
      });

    await endpoints.setup().then(setSetup).catch(() => { setSetup(null); });

    await endpoints
      .business()
      .then((bizRes) => {
        if (bizRes.business) {
          setBusiness(bizRes.business);
          setWebsiteInput(bizRes.business.website_url || "");
        }
      })
      .catch(() => {
        // Business not yet enrolled or non-blocking
      });
  }

  useEffect(() => {
    reload().catch((err) =>
      setError(err instanceof Error ? err.message : "לא הצלחנו לטעון את החיבורים.")
    );
  }, []);

  const ga4Item = data?.integrations.find((item) => item.provider === "ga4");
  const metaItem = data?.integrations.find((item) => item.provider === "meta");

  const ga4Connected = Boolean(ga4Item?.connected);
  const ga4State = ga4Item?.source_readiness;
  const ga4HasSelection = Boolean(ga4Item?.external_id && ga4Item.status !== "select_property");
  const ga4Presentation = sourcePresentation(ga4State, savingGa4);
  const metaConnected = Boolean(metaItem?.connected);

  const ga4NeedsSelection = ga4Item?.status === "select_property" && Boolean(ga4Item.properties?.length);
  const metaNeedsSelection = ["select_page", "select_assets"].includes(metaItem?.status || "");

  async function handleStartGa4() {
    setError("");
    setSuccessNote("");
    if (demo) {
      toast("בדמו מוצגים נתונים של מאפייה לדוגמה. כדי לחבר את נתוני האתר, עברו לעסק שלכם.");
      return;
    }
    if (!data?.ga4_ready) {
      setError(
        "החיבור לגוגל עדיין לא זמין. אפשר להמשיך בתוכנית ולחזור לכאן בהמשך."
      );
      return;
    }
    try {
      const { url } = await endpoints.ga4Start();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא הצלחנו להתחיל את החיבור לגוגל");
    }
  }

  async function handleSaveGa4Property() {
    if (!selectedGa4Property) {
      setError("בחרו את האתר מהרשימה");
      return;
    }
    const prop = ga4Item?.properties?.find((p) => p.property_id === selectedGa4Property);
    setSavingGa4(true);
    setError("");
    try {
      const result = await endpoints.ga4Property({
        property_id: selectedGa4Property,
        display_name: prop ? `${prop.display_name} (${prop.account})` : selectedGa4Property,
      });
      setSuccessNote("");
      setData(previous => previous ? { ...previous, integrations: previous.integrations.map(item => item.provider === "ga4" ? result.integration : item) } : previous);
      if (result.integration.source_readiness?.status === "ready") toast("קראנו את נתוני האתר");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא הצלחנו לשמור את האתר שבחרתם");
    } finally {
      setSavingGa4(false);
    }
  }

  async function handleReadGa4() {
    if (demo) { toast("זהו דמו. לא נקראים נתונים מחשבון אמיתי."); return; }
    setSavingGa4(true); setError(""); setSuccessNote("");
    try {
      const result = await endpoints.ga4Read();
      setData(previous => previous ? { ...previous, integrations: previous.integrations.map(item => item.provider === "ga4" ? result.integration : item) } : previous);
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא הצלחנו לבדוק את הנתונים. נסו שוב.");
    } finally { setSavingGa4(false); }
  }

  async function handleDisconnect(provider: "ga4" | "meta") {
    if (demo) {
      toast("בדמו החיבורים הם רק לדוגמה");
      return;
    }
    setError("");
    try {
      await endpoints.disconnectIntegration(provider);
      toast(provider === "ga4" ? "החיבור לנתוני האתר נותק" : "החיבור לאינסטגרם נותק");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא הצלחנו לנתק את החיבור");
    }
  }

  async function handleUpdateWebsite() {
    if (!websiteInput.trim()) {
      setError("הזינו כתובת אתר מלאה, למשל https://myshop.co.il");
      return;
    }
    setScanningWebsite(true);
    setError("");
    try {
      await endpoints.scanWebsite(websiteInput.trim());
      setSuccessNote("קראנו את האתר ועדכנו את הצבעים והסגנון.");
      toast("הצבעים והסגנון עודכנו מהאתר");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא הצלחנו לקרוא את האתר");
    } finally {
      setScanningWebsite(false);
    }
  }

  const recommendation = connectionRecommendation(business, setup, data, Boolean(whatsapp?.number_e164));
  const primaryKey = recommendation?.key || null;
  // Providers the server cannot offer yet, and that are not already connected (the demo's are).
  const unavailableCount = data && !demo ? [!data.ga4_ready && !ga4Connected, !data.meta_ready && !metaConnected].filter(Boolean).length : 0;
  const activeKey = expanded === undefined ? primaryKey : expanded;

  const connectionRows: Record<ConnectionKey, ReactNode> = {
    website: (
<ConnectionSection source="website" title="האתר של העסק" status={business?.website_url ? "כתובת נשמרה" : "לבחירה"} open={activeKey === "website"} onOpen={setExpanded}>
          <section className={ROW_CARD}>
            <div className="pb-3">
              <label htmlFor="business-website" className={LABEL}>כתובת האתר</label>
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <input
                  id="business-website"
                  type="url"
                  value={websiteInput}
                  onChange={(e) => setWebsiteInput(e.target.value)}
                  placeholder="https://myshop.co.il"
                  dir="ltr"
                  className={`${FIELD} sm:flex-1`}
                />
                <Button
                  size="md"
                  tone="primary"
                  variant={primaryKey === "website" ? "solid" : "outline"}
                  disabled={scanningWebsite}
                  onClick={handleUpdateWebsite}
                  className="shrink-0 whitespace-nowrap"
                >
                  {scanningWebsite ? "קוראים את האתר…" : business?.website_url ? "לקרוא שוב את האתר" : "לקרוא את האתר"}
                </Button>
              </div>
              <HowToFind topic="website" className="mt-1" />
            </div>

            <RowDetails summary="מה זה נותן, ומה אם אין לי אתר?">
              <p>
                אנחנו קוראים מהאתר את הצבעים, הלוגו, הגופנים וסגנון הצילום, ואת מה שאתם מוכרים.
                לפי זה אנחנו בונים פוסטים שנראים כאילו העסק שלכם הכין אותם.
              </p>
              <p>
                אין אתר, או שהוא עוד בבנייה? זה בסדר. השאירו את השדה ריק, ונעבוד מתיאור העסק
                ומהעמודים באינסטגרם ובפייסבוק. כשהאתר יעלה, חזרו לכאן ולחצו ״לקרוא שוב את האתר״.
              </p>
            </RowDetails>
          </section>

          {/* ============================================================== */}
          {/* CONNECTION 2: the WhatsApp tracked link (ours, nothing to connect) */}
          {/* ============================================================== */}
          </ConnectionSection>
    ),
    whatsapp: (
<ConnectionSection source="whatsapp" title="קישור הוואטסאפ" status={whatsapp?.number_e164 ? "פעיל" : "לבחירה"} open={activeKey === "whatsapp"} onOpen={setExpanded}>
          <WhatsappRow data={whatsapp} primary={primaryKey === "whatsapp"} onChange={setWhatsapp} />
          </ConnectionSection>
    ),
    ga4: (
<ConnectionSection source="ga4" title="נתוני האתר" status={ga4NeedsSelection ? "נשאר לבחור אתר" : ga4Item ? ga4Presentation.label : data && !data.ga4_ready ? "עדיין לא זמין" : "לא מחובר"} account={ga4Item?.display_name?.replace(/\s*\(GA4\)\s*$/, "")} open={activeKey === "ga4"} onOpen={setExpanded}>
          <section className={ROW_CARD}>
            <div className="pb-3">
              {/* "Signing in with Google is not measurement" is in the expand below. */}
              {ga4NeedsSelection ? (
                <div className="rounded-xl bg-[var(--soft)] p-4 sm:p-5">
                  <p className="text-[14px] font-medium leading-6 text-[color:var(--ink)]">
                    בחרו את האתר של העסק. אחרי הבחירה נבדוק את הנתונים שלו.
                  </p>
                  <label htmlFor="ga4-property" className={`${LABEL} mt-4`}>בחירת האתר</label>
                  <div className="flex flex-col gap-2.5 sm:flex-row">
                    <SelectFrame>
                    <select
                      id="ga4-property"
                      value={selectedGa4Property}
                      onChange={(e) => setSelectedGa4Property(e.target.value)}
                      className={SELECT}
                    >
                      <option value="">-- בחרו את האתר --</option>
                      {ga4Item?.properties?.map((prop) => (
                        <option key={prop.property_id} value={prop.property_id}>
                          {prop.display_name || "אתר ללא שם"}{prop.account ? ` (${prop.account})` : ""}
                        </option>
                      ))}
                    </select>
                    </SelectFrame>

                    <Button
                      size="md"
                      tone="primary"
                      variant={primaryKey === "ga4" ? "solid" : "outline"}
                      disabled={savingGa4 || !selectedGa4Property}
                      onClick={handleSaveGa4Property}
                      className="shrink-0 whitespace-nowrap"
                    >
                      {savingGa4 ? "בודקים את הנתונים…" : "זה האתר שלי"}
                    </Button>
                  </div>
                </div>
              ) : ga4HasSelection ? (
                <>
                <ConnectedLine
                  account={
                    <>
                      האתר שנבחר:{" "}
                      {/* Google's product code ("GA4") is not the owner's business name. */}
                      <strong className="font-semibold text-[color:var(--ink)]">
                        {(ga4Item?.display_name || ga4Item?.external_id || "").replace(/\s*\(GA4\)\s*$/, "")}
                      </strong>
                    </>
                  }
                >
                  {!(["reconnect", "no_properties"].includes(ga4State?.status || "")) ? <button type="button" onClick={handleStartGa4} className={TEXT_ACTION}>
                    להחליף חשבון
                  </button> : null}
                  <button type="button" onClick={() => handleDisconnect("ga4")} className={QUIET_ACTION}>
                    לנתק
                  </button>
                </ConnectedLine>
                {ga4State ? <SourceReadState state={ga4State} checking={savingGa4} onRetry={handleReadGa4} onReconnect={handleStartGa4} primary={primaryKey === "ga4"} /> : null}
                </>
              ) : ga4Item?.source_readiness?.status === "no_properties" ? (
                <SourceReadState state={ga4Item.source_readiness} onRetry={handleReadGa4} onReconnect={handleStartGa4} primary={primaryKey === "ga4"} />
              ) : (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <Button
                    size="md"
                    tone="primary"
                    variant={primaryKey === "ga4" ? "solid" : "outline"}
                    onClick={handleStartGa4}
                    disabled={!data?.ga4_ready}
                  >
                    <IconLink className="h-4 w-4" />
                    <span>לחבר את נתוני האתר</span>
                  </Button>
                  <span className="text-[13px] text-[color:var(--ink-muted)]">
                    {/* Shortened for the word budget; the full sentence is in the expand. */}
                    {data && !data.ga4_ready ? "החיבור עדיין לא זמין. אפשר להמשיך בתוכנית." : "אישור לקריאת נתונים, בלי למסור סיסמה."}
                  </span>
                </div>
              )}
              {/* Connected from a different Google account than the one used to sign in:
                  allowed, and said, with the account's address (routers/integrations.py). */}
              {ga4Item?.account_note_he ? (
                <p role="note" className="mt-3 flex items-start gap-2.5 text-[13px] leading-6 text-[color:var(--sand-dark)]">
                  <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--sun)]" />
                  {ga4Item.account_note_he}
                </p>
              ) : null}
              {ga4Connected ? null : <HowToFind topic="google_analytics" className="mt-1" />}
            </div>

            <RowDetails summary="מה זה נותן, ואיך משיגים גישה?">
              <p>
                בגוגל הכלי נקרא Google Analytics (גוגל אנליטיקס). הוא מראה כניסות לאתר ואת המקורות שלהן.
                פניות וקניות אפשר לספור רק אם הן הוגדרו ונמדדות באתר. לחיצה לבדה אינה לקוח.
                החיבור כאן קורא נתונים קיימים; הוא אינו מתקין את המדידה באתר.
              </p>
              <p>הכניסה עם Google מזהה אתכם בישראמארקט, ואינה מחברת את המדידה. קריאת נתוני האתר דורשת אישור נפרד, עם חשבון שיש לו גישה למדידה. אפשר לבחור חשבון אחר.</p>
              <div>
                <p className={DETAIL_TITLE}>1. מישהו אחר בנה או מנהל לכם את האתר?</p>
                <p className="mt-1">
                  בקשו ממנו להוסיף את הג׳ימייל שלכם כ<strong>צופה</strong> בנתוני האתר בגוגל
                  (שם ההרשאה באנגלית: Viewer). לא צריך הרשאות ניהול.
                </p>
                <div className="mt-2">
                  <SendToHelper
                    title="ההודעה למי שבנה את האתר"
                    message={GUIDES.google_analytics.stuck.message}
                    copiedNote="ההודעה הועתקה. שלחו אותה בוואטסאפ למי שבנה את האתר"
                  />
                </div>
              </div>
              <div className={DETAIL_BLOCK}>
                <p className={DETAIL_TITLE}>2. האתר עוד לא מחובר לגוגל בכלל?</p>
                <p className="mt-1">
                  פותחים חשבון בחינם ב-
                  <a
                    href="https://analytics.google.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-[color:var(--primary)] underline-offset-4 hover:underline"
                  >
                    analytics.google.com
                  </a>
                  , מוסיפים את האתר (בגוגל זה נקרא ״נכס״) ומדביקים את הקוד שקיבלתם בהגדרות האתר:
                  בוויקס, בוורדפרס או בשופיפיי.
                </p>
              </div>
              <div className={DETAIL_BLOCK}>
                <p className={DETAIL_TITLE}>3. אין לעסק אתר בכלל?</p>
                <p className="mt-1">
                  אפשר לדלג על החיבור הזה ולחבר רק את אינסטגרם ופייסבוק. שם נמדוד כמה אנשים ראו
                  את הפוסטים ואיך הגיבו.
                </p>
              </div>
            </RowDetails>
          </section>

          {/* ============================================================== */}
          {/* CONNECTION 4: Instagram & Facebook */}
          {/* ============================================================== */}
          </ConnectionSection>
    ),
    meta: (
<ConnectionSection source="meta" title="פייסבוק ואינסטגרם" status={metaConnected ? sourcePresentation(metaItem?.source_readiness).label : metaNeedsSelection ? "נשאר לבחור דף" : data && !data.meta_ready ? "עדיין לא זמין" : "לא מחובר"} account={metaItem?.display_name} open={activeKey === "meta"} onOpen={setExpanded}>
          <section className={ROW_CARD}>
            <div className="pb-3">
              <MetaConnection primary={primaryKey === "meta"} item={metaItem} ready={Boolean(data?.meta_ready)} demo={demo} website={business?.website_url || ""} onChanged={() => { setExpanded("meta"); return reload(true); }} onDisconnect={metaConnected ? () => handleDisconnect("meta") : undefined} />
            </div>

            <RowDetails summary="מה זה נותן, ומה אם האינסטגרם שלי פרטי?">
              <p>
                מכאן אנחנו לומדים מה הקהל שלכם באמת אוהב: כמה אנשים ראו כל פוסט, כמה שמרו וכמה
                הגיבו. את מה שעבד נעשה שוב בעדכון הבא של התוכנית.
              </p>
              <p>
                מתחברים עם חשבון הפייסבוק שמנהל את הדף, כי פייסבוק ואינסטגרם שייכות לאותה
                חברה.
              </p>
              <div>
                <p className={DETAIL_TITLE}>1. החשבון שלכם פרטי?</p>
                <p className="mt-1">
                  פייסבוק נותנת נתונים רק על חשבונות מקצועיים (זה בחינם). כדי לעבור: באפליקציית אינסטגרם › פרופיל ›
                  תפריט › הגדרות ופעילות (Settings and activity) › סוג חשבון וכלים › <strong>מעבר לחשבון מקצועי</strong> ›
                  עסק או יוצר תוכן.
                </p>
              </div>
              <div className={DETAIL_BLOCK}>
                <p className={DETAIL_TITLE}>2. האינסטגרם חייב להיות מקושר לדף בפייסבוק</p>
                <p className="mt-1">
                  במסלול החיבור שלנו, בלי דף עסקי בפייסבוק אין גישה לנתוני האינסטגרם. אפשר לפתוח דף
                  פשוט בחינם, ולחבר אליו את האינסטגרם בהגדרות הדף, תחת <strong>חשבונות מקושרים</strong>.
                </p>
              </div>
              <div className={DETAIL_BLOCK}>
                <p className={DETAIL_TITLE}>3. מישהו אחר מנהל לכם את הדף?</p>
                <p className="mt-1">
                  בקשו ממנו לוודא שיש לחשבון הפייסבוק שלכם הרשאת מנהל או גישת משימות בדף.
                </p>
                <div className="mt-2">
                  <SendToHelper
                    title="ההודעה למי שמנהל את הדף"
                    message={GUIDES.instagram_business.stuck.message}
                    copiedNote="ההודעה הועתקה. שלחו אותה בוואטסאפ למי שמנהל את הדף"
                  />
                </div>
              </div>
            </RowDetails>
          </section>
          </ConnectionSection>
    ),
  };
  const sourceOrder: ConnectionKey[] = ["website", "whatsapp", "ga4", "meta"];
  if (primaryKey) { sourceOrder.splice(sourceOrder.indexOf(primaryKey), 1); sourceOrder.unshift(primaryKey); }

  return (
    <AppShell>
      <div className="mx-auto max-w-[800px]">
        <PageHeader title="חיבורים" subtitle="מחברים את מה שיעזור לדייק את התוכנית." />

        {/* One quiet line for demo/real mode instead of a band: this page is about the
            connections, not about the mode. The sun marks "this is a sample". */}
        {demo ? (
          <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <p className="flex min-w-0 items-start gap-3 text-[14px] leading-6 text-[color:var(--ink-soft)]">
              <span aria-hidden className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--sun)] shadow-[0_0_0_4px_var(--sand)]" />
              <span>
                <span className="font-semibold text-[color:var(--ink)]">דמו: מאפיית לחם תום.</span> החיבורים כאן לדוגמה,
                כדי שתראו איך זה נראה כשהכול מחובר.
              </span>
            </p>
            <UIAction
              variant="secondary"
              onClick={() => {
                exitDemo();
                // Remount the shell too: its identity and first-run gate belong to
                // the real session, and sample rows must never become account rows.
                window.location.reload();
              }}
              className="shrink-0 self-start !min-h-11 !px-4 !text-[14px] sm:self-auto"
            >
              לעבור לעסק שלי
            </UIAction>
          </div>
        ) : (
          <div className="mb-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
            <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-[color:var(--ink-soft)]">
              <span className="font-semibold text-[color:var(--ink)]">העסק:</span>
              <span>{business?.name || "עסק בלי שם"}</span>
              {business?.website_url ? (
                <a
                  href={business.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  dir="ltr"
                  className="min-w-0 truncate text-[13px] text-[color:var(--ink-muted)] underline-offset-4 hover:text-[color:var(--ink)] hover:underline"
                >
                  {business.website_url}
                </a>
              ) : null}
            </p>

            <button
              type="button"
              onClick={async () => {
                await endpoints.enterDemo();
                window.location.reload();
              }}
              className={`${TEXT_ACTION} shrink-0`}
            >
              לראות את הדמו של לחם תום
            </button>
          </div>
        )}

        {business ? <PendingLinks key={business.id} business={business} onSaved={setBusiness} /> : null}
        {error ? (
          <div className="mb-6">
            <ErrorNote message={error} />
            {/* A failed Google or Facebook sign-in is almost always the wrong account or a
                missing link between accounts, and the guide is exactly that answer. */}
            {errorHelp(error) === "google_analytics" ? (
              <HowToFind topic="google_analytics" label="איך מוצאים את החשבון הנכון?" />
            ) : errorHelp(error) === "instagram_business" ? (
              <HowToFind topic="instagram_business" label="מה צריך כדי לחבר?" />
            ) : null}
          </div>
        ) : null}

        {successNote ? (
          <div className="mb-6 flex items-center gap-2.5 rounded-xl bg-[var(--good-soft)] px-4 py-3 text-[14px] font-medium leading-6 text-[color:var(--good)]">
            <IconCheck className="h-5 w-5 shrink-0" />
            <span>{successNote}</span>
          </div>
        ) : null}

        {data || error ? <div className="mb-6 space-y-2">
          {recommendation ? <>
            <p className="text-[13px] font-medium text-[var(--ink-muted)]">כדאי להתחיל כאן</p>
            {/* The open row right below already carries the title; say it only when it is closed. */}
            {activeKey !== primaryKey ? <h2 className="text-[20px] font-semibold text-[var(--ink)]">{recommendation.title}</h2> : null}
            <p className="max-w-[42em] text-[15px] leading-6 text-[var(--ink-soft)]">{recommendation.why}</p>
          </> : <p className="text-[15px] leading-6 text-[var(--ink-soft)]">{unavailableCount === 2 ? "החיבורים עוד לא זמינים. התוכנית ממשיכה בלעדיהם." : unavailableCount ? "חלק מהחיבורים עוד לא זמינים. התוכנית ממשיכה בלעדיהם." : "אפשר להמשיך בתוכנית. החיבורים זמינים כאן כשתצטרכו אותם."}</p>}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {recommendation && activeKey !== primaryKey ? <UIAction onClick={() => setExpanded(primaryKey)}>לפתוח את החיבור המומלץ</UIAction> : null}
            <Link href="/strategy" className={recommendation ? TEXT_ACTION : BACK_TO_PLAN}>{recommendation ? "להמשיך בתוכנית ולחבר אחר כך" : "לחזור לתוכנית"}</Link>
          </div>
        </div> : null}

        <div className="space-y-4">
          {sourceOrder.map(source => <div key={source}>{connectionRows[source]}</div>)}
        </div>

        {/* Technical, and only for the people who need it: no card, just a line that opens. */}
        <details className="group mt-10 border-t border-[var(--rule)]">
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-1.5 pt-2 text-[13px] font-semibold text-[color:var(--ink-muted)] transition-colors hover:text-[color:var(--ink)] [&::-webkit-details-marker]:hidden">
            <span>חיבור למערכות אחרות (טכני)</span>
            <Chevron />
          </summary>

          <div className="mt-3 space-y-4">
            <p className="text-[14px] leading-7 text-[color:var(--ink-soft)]">
              הזינו כתובת, ונשלח אליה הודעה אוטומטית בכל פעם שנבנית תוכנית חודשית חדשה או המלצות לשבוע.
              למשל, כדי להעביר אותן ל-Zapier או למערכת לניהול לקוחות. בשפה הטכנית: Webhook.
            </p>

            <div className="flex flex-col gap-2.5 sm:flex-row">
              <input
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://your-crm-webhook-url.com"
                dir="ltr"
                className={`${FIELD} sm:flex-1`}
              />
              <Button
                size="md"
                className="shrink-0 whitespace-nowrap"
                variant="outline"
                onClick={async () => {
                  if (!webhookUrl) return;
                  const created = await endpoints.createWebhook({
                    url: webhookUrl,
                    events: "recommendations,strategy",
                  });
                  setSecret(created.secret);
                  setWebhookUrl("");
                  await reload();
                  toast("הכתובת נוספה");
                }}
              >
                להוסיף את הכתובת
              </Button>
            </div>

            {secret ? (
              <div className="rounded-xl bg-[var(--soft)] p-4 text-[13px] leading-6 text-[color:var(--ink)]">
                <span className="mb-2 block font-semibold">קוד סודי לחתימה (מוצג רק פעם אחת, שמרו אותו):</span>
                <code className={`${CODE_CHIP} inline-block break-all !px-2.5 !py-1.5`}>{secret}</code>
              </div>
            ) : null}

            {data?.webhooks && data.webhooks.length > 0 ? (
              <div className="pt-2">
                <span className={LABEL}>כתובות פעילות:</span>
                <ul className={`${CARD} divide-y divide-[var(--rule)]`}>
                  {data.webhooks.map((hook) => (
                    <li key={hook.id} className="flex items-center justify-between gap-3 px-4 py-2">
                      <span dir="ltr" className="min-w-0 truncate font-mono text-[12px] text-[color:var(--ink-soft)]">
                        {hook.url}
                      </span>
                      <button
                        type="button"
                        className={`${QUIET_ACTION} shrink-0 !text-[13px]`}
                        onClick={async () => {
                          await endpoints.deleteWebhook(hook.id);
                          await reload();
                          toast("הכתובת נמחקה");
                        }}
                      >
                        למחוק את הכתובת
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </details>
      </div>
    </AppShell>
  );
}

function ConnectionSection({ source, title, status, account, open, onOpen, children }: {
  source: ConnectionKey; title: string; status: string; account?: string; open: boolean;
  onOpen: (value: ConnectionKey | null) => void; children: ReactNode;
}) {
  return <details id={source === "whatsapp" ? "whatsapp-connection" : source} open={open} className="group/connection scroll-mt-20 border-b border-[var(--rule)]" onToggle={event => {
    if (event.currentTarget.open !== open) onOpen(event.currentTarget.open ? source : null);
  }}>
    <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 [&::-webkit-details-marker]:hidden">
      <span className="min-w-0"><strong className="text-[16px] font-semibold text-[var(--ink)]">{title}</strong>{account ? <span className="mt-1 block truncate text-[13px] text-[var(--ink-soft)]">{account}</span> : null}</span>
      <span className="flex shrink-0 items-center gap-3 text-[13px] text-[var(--ink-muted)]">{status}<IconChevron className="h-4 w-4 -rotate-90 transition-transform duration-200 ease-[cubic-bezier(.2,.7,.2,1)] group-open/connection:rotate-90 motion-reduce:transition-none" /></span>
    </summary>
    {children}
  </details>;
}

/**
 * קישור הוואטסאפ — the owner types the number once and gets one short link per place a
 * customer can tap "write to us". The face says what is counted and what is not in one
 * line (the honesty rule keeps it visible); the message text, the post links and the
 * privacy detail are one tap down.
 */
function WhatsappRow({
  data,
  primary,
  onChange,
}: {
  data: WhatsappPayload | null;
  primary: boolean;
  onChange: (next: WhatsappPayload) => void;
}) {
  const isSet = Boolean(data?.number_e164);
  const [editing, setEditing] = useState(false);
  // null = untouched, so the field shows the stored (or suggested) value until typed in.
  const [number, setNumber] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isFixed = (key: string) => (FIXED_SOURCES as readonly string[]).includes(key);
  const fixed = (data?.links || [])
    .filter((link) => isFixed(link.source_key))
    .sort((a, b) => WHATSAPP_COPY_ORDER.indexOf(a.source_key) - WHATSAPP_COPY_ORDER.indexOf(b.source_key));
  const postLinks = (data?.links || []).filter((link) => !isFixed(link.source_key));
  const showForm = !isSet || editing;
  const numberValue = number ?? (editing ? data?.number_display || "" : data?.suggested_number || "");
  const textValue = text ?? data?.default_text_he ?? "";

  async function save(body: { number: string; default_text_he?: string }, done: string) {
    setSaving(true);
    setError("");
    try {
      const next = await whatsappEndpoints.save(body);
      onChange(next);
      setEditing(false);
      setNumber(null);
      setText(null);
      toast(done);
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא הצלחנו לשמור את המספר. נסו שוב.");
    } finally {
      setSaving(false);
    }
  }

  return (
    // `#whatsapp`: the free month's journey links here (lib/trial.ts).
    <section id="whatsapp" className={`${ROW_CARD} scroll-mt-20`}>
      <RowHead
        icon={IconWhatsApp}
        title="קישור הוואטסאפ"
        status={isSet ? "פעיל" : "לא הוגדר"}
        tone={isSet ? "good" : "muted"}
        // What is counted and what is not, as the row's one line: on the face, never
        // behind the expand (UI-RULES rule 7 never drops a "we cannot measure this").
        note="סופרים לחיצות, לא הודעות שנשלחו. הקוד בהודעה מראה מאיפה הגיעה הפנייה."
      />

      <div className="pb-3">
        {showForm ? (
          <div>
            <label htmlFor="whatsapp-number" className={LABEL}>
              מספר הוואטסאפ של העסק
            </label>
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <input
                id="whatsapp-number"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={numberValue}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="050-1234567"
                dir="ltr"
                className={`${FIELD} text-right sm:flex-1`}
              />
              <Button
                size="md"
                tone="primary"
                variant={primary ? "solid" : "outline"}
                disabled={saving || !numberValue.trim()}
                onClick={() => void save({ number: numberValue }, isSet ? "המספר עודכן" : "הקישורים מוכנים")}
                className="shrink-0 whitespace-nowrap"
              >
                {saving ? "שומרים…" : isSet ? "לשמור את המספר" : "ליצור את הקישורים"}
              </Button>
            </div>
            {editing ? (
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setNumber(null);
                  setError("");
                }}
                className={`${QUIET_ACTION} mt-1`}
              >
                לבטל
              </button>
            ) : null}
          </div>
        ) : (
          // One copy button per place, the place as its label: the owner's job here is "copy
          // the bio link", and a list of four rows with four URLs cost the page 40 words
          // (UI-RULES rule 7). The URL is in each button's tooltip, and the number moved
          // into the expand below — it is set once.
          <div>
            <p className={LABEL}>להעתיק קישור:</p>
            <div className="flex flex-wrap gap-2">
              {fixed.map((link) => (
                <button
                  key={link.code}
                  type="button"
                  onClick={() => void copyText(link.url, `הקישור ל${link.label_he} הועתק`)}
                  aria-label={`להעתיק את הקישור ל${link.label_he}`}
                  title={link.url}
                  className="group/copy inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--rule-dark)] bg-[var(--paper)] px-3.5 text-[14px] font-medium text-[color:var(--ink)] transition-[border-color,background-color] duration-200 hover:border-[var(--ink-faint)] hover:bg-[var(--soft)] active:bg-[var(--primary-soft)]"
                >
                  <IconCopy className="h-4 w-4 shrink-0 text-[color:var(--ink-muted)] transition-colors group-hover/copy:text-[color:var(--primary)]" />
                  {WHATSAPP_SHORT[link.source_key] || link.label_he}
                </button>
              ))}
            </div>
          </div>
        )}

        {error ? (
          <p className="mt-3 rounded-lg bg-[var(--danger-soft)] px-3.5 py-2.5 text-[13px] leading-5 text-[color:var(--danger)]">
            {error}
          </p>
        ) : null}

        {isSet ? null : <HowToFind topic="whatsapp_business" label="איך כותבים את המספר?" className="mt-1" />}
      </div>

      <RowDetails indent summary={isSet ? "המספר וההודעה" : "מה נספר ומה לא"}>
        {isSet && !editing ? (
          <p className="flex flex-wrap items-center gap-x-4">
            <span>
              המספר:{" "}
              <strong dir="ltr" className="font-semibold text-[color:var(--ink)]">
                {data?.number_display}
              </strong>
            </span>
            <button type="button" onClick={() => setEditing(true)} className={TEXT_ACTION}>
              לשנות את המספר
            </button>
          </p>
        ) : null}
        {isSet ? (
          <div className={DETAIL_BLOCK}>
            <label htmlFor="whatsapp-text" className={LABEL}>
              ההודעה שהלקוח שולח
            </label>
            <textarea
              id="whatsapp-text"
              value={textValue}
              maxLength={300}
              rows={2}
              onChange={(e) => setText(e.target.value)}
              placeholder={data?.default_text_fallback_he}
              className={`${FIELD} resize-y`}
            />
            <p className="mt-2">
              בסוף ההודעה נוסיף קוד קצר לפי המקום, למשל <bdi>(קוד: IG-BIO)</bdi>. אם הלקוח
              מוחק אותו, לא נדע מאיפה הגיע.
            </p>
            <Button
              size="md"
              variant="outline"
              disabled={saving || text === null}
              onClick={() =>
                void save({ number: data?.number_e164 || "", default_text_he: textValue }, "ההודעה נשמרה")
              }
              className="mt-3"
            >
              {saving ? "שומרים…" : "לשמור את ההודעה"}
            </Button>
          </div>
        ) : null}
        <div className={isSet ? DETAIL_BLOCK : ""}>
          <p className={DETAIL_TITLE}>איפה שמים כל קישור</p>
          <ul className="mt-1 space-y-1">
            {FIXED_SOURCES.map((key) => (
              <li key={key}>
                <strong className="font-semibold text-[color:var(--ink)]">{WHATSAPP_LABELS[key]}:</strong> {SOURCE_HINT_HE[key]}
              </li>
            ))}
            <li>
              <strong className="font-semibold text-[color:var(--ink)]">פוסטים:</strong> כל פוסט שמזמין לכתוב בוואטסאפ מקבל קישור משלו, בערכת הפרסום של
              הפוסט.
            </li>
          </ul>
        </div>
        {postLinks.length ? (
          <div className={DETAIL_BLOCK}>
            <p className={DETAIL_TITLE}>הקישורים של הפוסטים</p>
            <ul className="mt-1 divide-y divide-[var(--rule)]">
              {postLinks.map((link) => (
                <li key={link.code} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate">{link.label_he}</span>
                  <button
                    type="button"
                    onClick={() => void copyText(link.url, "הקישור הועתק")}
                    className={`${TEXT_ACTION} shrink-0`}
                  >
                    <IconCopy className="h-4 w-4" />
                    להעתיק
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className={DETAIL_BLOCK}>
          <p className={DETAIL_TITLE}>מה נספר ומה לא</p>
          <p className="mt-1">
            נספרת כל לחיצה על הקישור, ואם אותו אדם לחץ פעמיים, זה נספר פעמיים. לא נדע אם ההודעה
            נשלחה או אם נסגרה עסקה. את זה רק אתם רואים בוואטסאפ.
          </p>
          <p className="mt-2">
            תצוגה מקדימה של הקישור, למשל כשמדביקים אותו בצ׳אט, לא נספרת. על כל לחיצה אנחנו שומרים רק
            את היום, את הקישור ואת סוג המכשיר בערך. לא את כתובת הרשת של המכשיר, ולא מי לחץ.{" "}
            <a href="/security#whatsapp" className="font-semibold text-[color:var(--primary)] underline-offset-4 hover:underline">
              עוד על הפרטיות
            </a>
          </p>
        </div>
      </RowDetails>
    </section>
  );
}

/** The copy buttons' labels: the place, as short as it can be and still be read. */
const WHATSAPP_SHORT: Record<string, string> = {
  "ig-bio": "ביו באינסטגרם",
  story: "סטורי",
  gbp: "הכרטיס בגוגל",
  default: "כללי",
};

/** Bio first: it is the link most owners paste first. */
const WHATSAPP_COPY_ORDER = ["ig-bio", "story", "gbp", "default"];

const WHATSAPP_LABELS: Record<string, string> = {
  default: "הקישור הכללי",
  "ig-bio": "הביו באינסטגרם",
  story: "סטורי",
  gbp: "הכרטיס של העסק בגוגל",
};

/**
 * Which guide answers a failed connection. Only sign-in failures get one: "the server is not
 * set up" (`בשרת`) is for whoever runs the server, and no owner guide fixes it.
 */
function errorHelp(error: string): "google_analytics" | "instagram_business" | null {
  if (!error || /בשרת/.test(error)) return null;
  if (/גוגל/.test(error)) return "google_analytics";
  if (/פייסבוק|אינסטגרם/.test(error)) return "instagram_business";
  return null;
}

/**
 * The top of a connection row: what this is, whether it is connected, and why it matters in
 * one clause. The owner should be able to answer "is it connected, and if not, what do I
 * press" without opening anything.
 */
type Tone = "good" | "waiting" | "muted";

const STATUS_TONE: Record<Tone, { text: string; dot: string }> = {
  good: { text: "text-[color:var(--good)]", dot: "bg-[var(--good)] shadow-[0_0_0_3px_var(--good-soft)]" },
  waiting: { text: "text-[color:var(--sand-dark)]", dot: "bg-[var(--sun)] shadow-[0_0_0_3px_var(--sand)]" },
  muted: { text: "text-[color:var(--ink-muted)]", dot: "bg-[var(--ink-faint)]" },
};

function RowHead({
  icon: Icon,
  title,
  status,
  tone,
  note,
}: {
  icon: (props: { className?: string }) => React.ReactElement;
  title: string;
  status: string;
  tone: Tone;
  note: string;
}) {
  const colour = STATUS_TONE[tone];
  return (
    <div className="flex items-start gap-4">
      <span
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--soft)] text-[color:var(--ink)]"
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <h2 className="text-[17px] font-[650] leading-7 tracking-[-0.01em] text-[color:var(--ink)]">{title}</h2>
          {/* Words first, a small dot beside them: connected reads green, the rest stays quiet. */}
          <span className={`inline-flex items-center gap-2 text-[13px] font-semibold ${colour.text}`}>
            <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${colour.dot}`} />
            {status}
          </span>
        </div>
        <p className="mt-0.5 text-[14px] leading-6 text-[color:var(--ink-soft)] sm:text-[15px]">{note}</p>
      </div>
    </div>
  );
}

/** A connected account, and the two things one can do with it: switch it, or let it go. */
function ConnectedLine({ account, children }: { account: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 rounded-xl bg-[var(--soft)] px-4 py-1 sm:ps-5">
      <p className="min-w-0 py-2.5 text-[14px] leading-6 text-[color:var(--ink-soft)]">{account}</p>
      <div className="flex items-center gap-5">{children}</div>
    </div>
  );
}

/** Holds a `SELECT` and its chevron, at the end side of the field (left, in RTL). */
function SelectFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-w-0 sm:flex-1">
      {children}
      <IconChevron className="pointer-events-none absolute end-3.5 top-1/2 h-4 w-4 -translate-y-1/2 -rotate-90 text-[color:var(--ink-muted)]" />
    </div>
  );
}

/** Detail on demand: the reasoning and the how-to sit one tap down, never above the row. */
function RowDetails({ summary, indent = false, children }: { summary: string; indent?: boolean; children: React.ReactNode }) {
  return (
    // `indent` lines the expand up with the text beside a RowHead icon; rows without one stay flush.
    <details className={`group mt-4 border-t border-[var(--rule)] ${indent ? "sm:ms-14" : ""}`}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-1.5 pt-1 text-[13px] font-semibold text-[color:var(--ink-soft)] transition-colors hover:text-[color:var(--ink)] [&::-webkit-details-marker]:hidden">
        {summary}
        <Chevron />
      </summary>
      <div className="space-y-4 pb-4 pt-1 text-[14px] leading-7 text-[color:var(--ink-soft)]">{children}</div>
    </details>
  );
}

/**
 * The disclosure chevron (DESIGN-STANDARD.md §4): an icon, never a typed glyph, which rule 7
 * would also count as a word on every closed expand. Points down; up when open.
 */
function Chevron() {
  return (
    <IconChevron className="h-4 w-4 shrink-0 -rotate-90 text-[color:var(--ink-muted)] transition-transform duration-200 ease-[cubic-bezier(.2,.7,.2,1)] group-open:rotate-90" />
  );
}
