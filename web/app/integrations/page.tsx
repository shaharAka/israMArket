"use client";

import { useEffect, useState } from "react";
import {
  AppShell,
  Button,
  ErrorNote,
} from "@/components/AppShell";
import { GUIDES } from "@/components/help/guides";
import { HowToFind } from "@/components/help/HowToFind";
import { SendToHelper } from "@/components/help/SendToHelper";
import { SectionHeader } from "@/components/SectionHeader";
import { PendingLinks } from "@/components/integrations/PendingLinks";
import {
  endpoints,
  exitDemo,
  isDemo,
  type Business,
  type IntegrationsPayload,
} from "@/lib/api";
import {
  IconCheck,
  IconCopy,
  IconLink,
} from "@/lib/icons";
import { SECTIONS } from "@/lib/sections";
import { copyText, toast } from "@/lib/ui";
import {
  FIXED_SOURCES,
  SOURCE_HINT_HE,
  whatsappEndpoints,
  type WhatsappPayload,
} from "@/lib/whatsapp";

/** The one section colour system — this page used to carry its own sand and sage. */
const TONE = SECTIONS.business;

/**
 * חיבורים — where the plan gets real numbers from.
 *
 * Plain Hebrew on the face (UI-RULES rule 4): Google Analytics is "נתוני האתר", because that
 * is what it is to the owner, and the product's own name appears once, inside the row's
 * expand, for whoever has to find it in Google. OAuth, `.env` keys and webhooks are for
 * whoever set up the server; they live behind expands marked for technical users.
 */
export default function IntegrationsPage() {
  const [data, setData] = useState<IntegrationsPayload | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [demo, setDemo] = useState(() => typeof window !== "undefined" && isDemo());
  const [error, setError] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("error") || "";
  });
  const [successNote, setSuccessNote] = useState(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    if (params.get("ga4") === "connected") {
      return "התחברתם לגוגל. נשאר רק לבחור את האתר מהרשימה (בגוגל הוא נקרא ״נכס״).";
    }
    if (params.get("meta") === "connected") {
      return "התחברתם לפייסבוק. נשאר רק לבחור את הדף העסקי. אם הוא מקושר לאינסטגרם, גם החשבון ייבחר איתו.";
    }
    return "";
  });
  const [secret, setSecret] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [devConfigOpen, setDevConfigOpen] = useState(false);

  // Which account/page was chosen, right after the owner approved the connection at the
  // provider. "נכס" is Google's word for the owner's site, so the copy explains it.
  const [selectedGa4Property, setSelectedGa4Property] = useState("");
  const [selectedMetaPage, setSelectedMetaPage] = useState("");
  const [savingGa4, setSavingGa4] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);

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
  const metaConnected = Boolean(metaItem?.connected);

  const ga4NeedsSelection = ga4Item?.status === "select_property" && Boolean(ga4Item.properties?.length);
  const metaNeedsSelection = metaItem?.status === "select_page" && Boolean(ga4Item ? metaItem?.pages?.length : false);

  async function handleStartGa4() {
    setError("");
    setSuccessNote("");
    if (demo) {
      toast("בדמו מוצגים נתונים של מאפייה לדוגמה. כדי לחבר את נתוני האתר, עברו לעסק שלכם.");
      return;
    }
    if (!data?.ga4_ready) {
      setError(
        "אי אפשר עדיין להתחבר לגוגל בלחיצה, כי החיבור לא הוגדר בשרת. מי שהקים לכם את המערכת ימצא הנחיות למטה."
      );
      setDevConfigOpen(true);
      return;
    }
    try {
      const { url } = await endpoints.ga4Start();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא הצלחנו להתחיל את החיבור לגוגל");
    }
  }

  async function handleStartMeta() {
    setError("");
    setSuccessNote("");
    if (demo) {
      toast("בדמו מוצגים נתונים של מאפייה לדוגמה. כדי לחבר את האינסטגרם, עברו לעסק שלכם.");
      return;
    }
    if (!data?.meta_ready) {
      setError(
        "אי אפשר עדיין להתחבר לפייסבוק בלחיצה, כי החיבור לא הוגדר בשרת. מי שהקים לכם את המערכת ימצא הנחיות למטה."
      );
      setDevConfigOpen(true);
      return;
    }
    try {
      const { url } = await endpoints.metaStart();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא הצלחנו להתחיל את החיבור לפייסבוק");
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
      await endpoints.ga4Property({
        property_id: selectedGa4Property,
        display_name: prop ? `${prop.display_name} (${prop.account})` : selectedGa4Property,
      });
      setSuccessNote("נתוני האתר מחוברים.");
      toast("נתוני האתר חוברו");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא הצלחנו לשמור את האתר שבחרתם");
    } finally {
      setSavingGa4(false);
    }
  }

  async function handleSaveMetaPage() {
    if (!selectedMetaPage) {
      setError("בחרו דף מהרשימה");
      return;
    }
    const page = metaItem?.pages?.find((p) => p.page_id === selectedMetaPage);
    setSavingMeta(true);
    setError("");
    try {
      await endpoints.metaAccount({
        page_id: selectedMetaPage,
        instagram_id: page?.instagram_id || "",
        display_name: page?.display_name || selectedMetaPage,
      });
      setSuccessNote("הדף בפייסבוק והאינסטגרם מחוברים.");
      toast("אינסטגרם ופייסבוק מחוברים");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא הצלחנו לשמור את הדף בפייסבוק");
    } finally {
      setSavingMeta(false);
    }
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

  // The page's one dark button belongs to the first channel that still needs something,
  // in the order the rows appear. When everything is connected (the demo, or a finished
  // setup) the page is asking for nothing, so nothing competes: the actions that remain —
  // re-scanning the site, switching the demo off — are outlines and links.
  // The WhatsApp link comes right after the site: it takes a minute, needs no account and
  // no approval, and it is the measurement the plan promises from day one.
  const whatsappSet = Boolean(whatsapp?.number_e164);
  const primaryKey: "website" | "whatsapp" | "ga4" | "meta" | null = !business?.website_url
    ? "website"
    : whatsapp && !whatsappSet
      ? "whatsapp"
      : !ga4Connected
        ? "ga4"
        : !metaConnected
          ? "meta"
          : null;

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl">
        <SectionHeader
          section="business"
          title="חיבורים"
          subtitle="כך התוכנית נבנית לפי מספרים אמיתיים, לא לפי ניחושים."
        />

        {/* One quiet strip for demo/real mode instead of a box, and the switch is a link-weight
            action: this page is about the connections, not about the mode. */}
        {demo ? (
          <div
            className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-y px-4 py-3"
            style={{ background: TONE.surface, borderColor: TONE.border }}
          >
            <p className="text-xs leading-5" style={{ color: TONE.accent }}>
              <span className="font-bold">דמו: מאפיית לחם תום.</span> החיבורים כאן לדוגמה,
              כדי שתראו איך זה נראה כשהכול מחובר.
            </p>
            <button
              type="button"
              onClick={() => {
                exitDemo();
                setDemo(false);
                reload(true);
                toast("עברתם לעסק שלכם");
              }}
              className="shrink-0 rounded-md border border-[var(--rule-dark)] bg-white px-3.5 py-2 text-xs font-bold text-[var(--ink)] transition-colors hover:bg-[var(--primary-soft)]"
            >
              לעבור לעסק שלי
            </button>
          </div>
        ) : (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-y border-[var(--rule)] px-4 py-3 text-xs">
            <p className="flex flex-wrap items-center gap-2 text-[var(--ink-soft)]">
              <span className="font-bold text-[var(--ink)]">העסק:</span>
              <span className="font-semibold">{business?.name || "עסק בלי שם"}</span>
              {business?.website_url ? (
                <a
                  href={business.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[11px] underline hover:text-[var(--ink)]"
                >
                  {business.website_url}
                </a>
              ) : null}
            </p>

            <button
              type="button"
              onClick={async () => {
                await endpoints.enterDemo();
                setDemo(true);
                reload();
                toast("עברתם לדמו של מאפיית לחם תום");
              }}
              className="shrink-0 text-xs text-[var(--ink-soft)] underline underline-offset-4 hover:text-[var(--ink)]"
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
          <div
            className="mb-6 flex items-center gap-2 rounded-md border p-4 text-xs font-semibold sm:text-sm"
            style={{ background: TONE.surface, borderColor: TONE.border, color: TONE.accent }}
          >
            <IconCheck className="h-5 w-5 shrink-0" />
            <span>{successNote}</span>
          </div>
        ) : null}

        {/* Developer-only: the server is missing the keys that make the one-click connection
            work. A quiet band, not a card, and hidden in demo mode. */}
        {(!data?.ga4_ready || !data?.meta_ready) && !demo ? (
          <div className="mb-6 border-y border-[var(--rule)] bg-[var(--canvas)] px-4 py-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[var(--ink-soft)]">
                <span className="font-bold text-[var(--ink)]">הגדרות שרת:</span>{" "}
                {!data?.ga4_ready && !data?.meta_ready
                  ? "חסרים מפתחות החיבור לגוגל ולפייסבוק, ולכן אי אפשר להתחבר בלחיצה."
                  : !data?.ga4_ready
                    ? "חסר מפתח החיבור לגוגל, ולכן אי אפשר להתחבר לגוגל בלחיצה."
                    : "חסר מפתח החיבור לפייסבוק, ולכן אי אפשר להתחבר לאינסטגרם בלחיצה."}
              </p>
              <button
                type="button"
                onClick={() => setDevConfigOpen(!devConfigOpen)}
                className="font-bold text-[var(--ink)] underline underline-offset-2"
              >
                {devConfigOpen ? "להסתיר את ההנחיות" : "הנחיות למי שמתקין את השרת"}
              </button>
            </div>

            {devConfigOpen ? (
              <div className="mt-3 space-y-3 border-t border-[var(--rule)] pt-3 text-[var(--ink-soft)]">
                <p>
                  כדי שבעלי העסק יוכלו להתחבר בלחיצה אחת עם חשבון גוגל או פייסבוק, הגדירו את המפתחות האלה בקבצים <code className="rounded border border-[var(--rule-dark)] bg-white px-1.5 py-0.5 font-mono">.env</code> ו-<code className="rounded border border-[var(--rule-dark)] bg-white px-1.5 py-0.5 font-mono">api/.env</code>:
                </p>
                <div className="space-y-1 overflow-x-auto rounded border border-[var(--rule-dark)] bg-white p-3 font-mono text-[11px] text-[var(--ink)]">
                  <div># Google Analytics 4 (Google Cloud Console OAuth 2.0 Web Client)</div>
                  <div>GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com</div>
                  <div>GOOGLE_CLIENT_SECRET=your-google-client-secret</div>
                  <div className="text-[var(--ink-muted)]"># Authorized redirect URIs (deploy/gcp/google-oauth.md):</div>
                  <div className="text-[var(--ink-muted)]">#   http://localhost:3000/backend/integrations/ga4/callback</div>
                  <div className="text-[var(--ink-muted)]">#   http://localhost:3000/backend/auth/google/callback</div>
                  <div className="pt-2"># Meta Graph API (Meta for Developers - Business App)</div>
                  <div>META_APP_ID=your-facebook-app-id</div>
                  <div>META_APP_SECRET=your-facebook-app-secret</div>
                  <div className="text-[var(--ink-muted)]"># Valid OAuth Redirect URI: http://localhost:8000/integrations/meta/callback</div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* One container for all three connections, a hairline between the rows. Every row
            answers the same two questions in the same order: is it connected, and what do I
            press. Why it matters lives behind the row's expand. */}
        <section className="overflow-hidden rounded-lg border border-[var(--rule)] bg-white">
          {/* ============================================================== */}
          {/* CONNECTION 1: Business Website & Brand Scraper */}
          {/* ============================================================== */}
          <div className="p-5 sm:p-6">
            <RowHead
              mark="אתר"
              title="האתר של העסק"
              status={business?.website_url ? "מחובר" : "לא הוגדר"}
              tone={business?.website_url ? "emerald" : "slate"}
              note="מכאן אנחנו לומדים את הצבעים, הסגנון והניסוחים."
            />

            <label htmlFor="business-website" className="mb-2 mt-4 block text-xs font-bold text-[var(--ink-soft)]">כתובת האתר</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="business-website"
                type="url"
                value={websiteInput}
                onChange={(e) => setWebsiteInput(e.target.value)}
                placeholder="https://myshop.co.il"
                dir="ltr"
                className="min-h-11 min-w-0 flex-1 rounded border border-[var(--rule-dark)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] focus:border-[var(--ink)] focus:outline-none"
              />
              <Button
                size="md"
                tone="primary"
                variant={primaryKey === "website" ? "solid" : "outline"}
                disabled={scanningWebsite}
                onClick={handleUpdateWebsite}
              >
                {scanningWebsite ? "קוראים את האתר…" : business?.website_url ? "לקרוא שוב את האתר" : "לקרוא את האתר"}
              </Button>
            </div>
            <HowToFind topic="website" className="mt-1" />

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
          </div>

          {/* ============================================================== */}
          {/* CONNECTION 2: the WhatsApp tracked link (ours, nothing to connect) */}
          {/* ============================================================== */}
          <WhatsappRow data={whatsapp} primary={primaryKey === "whatsapp"} onChange={setWhatsapp} />

          {/* ============================================================== */}
          {/* CONNECTION 3: Google Analytics */}
          {/* ============================================================== */}
          <div className="border-t border-[var(--rule)] p-5 sm:p-6">
            <RowHead
              mark="גוגל"
              title="נתוני האתר"
              status={ga4Connected ? "מחובר" : ga4NeedsSelection ? "נשאר לבחור" : "לא מחובר"}
              tone={ga4Connected ? "emerald" : ga4NeedsSelection ? "amber" : "slate"}
              note="כמה נכנסו לאתר, מאיפה הגיעו ומה קנו."
            />

            <div className="mt-4">
              {ga4NeedsSelection ? (
                <div className="rounded-md p-4" style={{ background: TONE.surface }}>
                  <p className="text-xs font-bold text-[var(--ink)]">
                    אישרתם את הכניסה לגוגל. נשאר לבחור את האתר מהרשימה (בגוגל הוא נקרא
                    ״נכס״):
                  </p>
                  <label htmlFor="ga4-property" className="mb-2 mt-3 block text-xs font-bold text-[var(--ink-soft)]">בחירת האתר</label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <select
                      id="ga4-property"
                      value={selectedGa4Property}
                      onChange={(e) => setSelectedGa4Property(e.target.value)}
                      className="min-h-11 min-w-0 flex-1 rounded border border-[var(--rule-dark)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:border-[var(--ink)] focus:outline-none"
                    >
                      <option value="">-- בחרו את האתר --</option>
                      {ga4Item?.properties?.map((prop) => (
                        <option key={prop.property_id} value={prop.property_id}>
                          {prop.display_name} ({prop.account}) — מזהה {prop.property_id}
                        </option>
                      ))}
                    </select>

                    <Button
                      size="md"
                      tone="primary"
                      variant={primaryKey === "ga4" ? "solid" : "outline"}
                      disabled={savingGa4 || !selectedGa4Property}
                      onClick={handleSaveGa4Property}
                    >
                      {savingGa4 ? "שומרים…" : "זה האתר שלי"}
                    </Button>
                  </div>
                </div>
              ) : ga4Connected ? (
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <p className="flex items-center gap-2 text-xs" style={{ color: TONE.accent }}>
                    <IconCheck className="h-4 w-4 shrink-0" />
                    <span>
                      מחובר לאתר:{" "}
                      {/* Google's product code ("GA4") is not the owner's business name. */}
                      <strong>{(ga4Item?.display_name || ga4Item?.external_id || "").replace(/\s*\(GA4\)\s*$/, "")}</strong>
                    </span>
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleStartGa4}
                      className="text-xs font-bold text-[var(--ink)] underline underline-offset-4"
                    >
                      להחליף חשבון
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDisconnect("ga4")}
                      className="text-xs text-[var(--ink-muted)] underline underline-offset-4 hover:text-[var(--ink)]"
                    >
                      לנתק
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <Button
                    size="md"
                    tone="primary"
                    variant={primaryKey === "ga4" ? "solid" : "outline"}
                    onClick={handleStartGa4}
                  >
                    <IconLink className="h-4 w-4" />
                    <span>לחבר את נתוני האתר</span>
                  </Button>
                  <span className="text-xs text-[var(--ink-muted)]">
                    {/* Shortened for the word budget; the full sentence is in the expand. */}
                    בלי לתת לנו סיסמה.
                  </span>
                </div>
              )}
            </div>
            {/* Connected from a different Google account than the one used to sign in:
                allowed, and said, with the account's address (routers/integrations.py). */}
            {ga4Item?.account_note_he ? (
              <p role="note" className="mt-2 text-xs leading-5 text-[var(--sand-dark)]">
                {ga4Item.account_note_he}
              </p>
            ) : null}
            {ga4Connected ? null : <HowToFind topic="google_analytics" className="mt-1" />}

            <RowDetails summary="מה זה נותן, ואיך משיגים גישה?">
              <p>
                בגוגל הכלי נקרא Google Analytics (גוגל אנליטיקס). בלעדיו, שיווק ברשתות הוא ניחוש. שם רואים כמה אנשים נכנסו
                לאתר, מאיפה הגיעו, מה קנו ואילו פוסטים באמת הביאו לקוחות. לפי זה אנחנו משפרים את התוכנית של
                החודש הבא.
              </p>
              <p>מתחברים עם חשבון הגוגל שלכם, ולא נותנים לנו סיסמה.</p>
              <div>
                <p className="font-bold text-[var(--ink)]">1. מישהו אחר בנה או מנהל לכם את האתר?</p>
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
              <div className="border-t border-[var(--rule)] pt-3">
                <p className="font-bold text-[var(--ink)]">2. האתר עוד לא מחובר לגוגל בכלל?</p>
                <p className="mt-1">
                  פותחים חשבון בחינם ב-
                  <a
                    href="https://analytics.google.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-[var(--ink)] underline"
                  >
                    analytics.google.com
                  </a>
                  , מוסיפים את האתר (בגוגל זה נקרא ״נכס״) ומדביקים את הקוד שקיבלתם בהגדרות האתר:
                  בוויקס, בוורדפרס או בשופיפיי.
                </p>
              </div>
              <div className="border-t border-[var(--rule)] pt-3">
                <p className="font-bold text-[var(--ink)]">3. אין לעסק אתר בכלל?</p>
                <p className="mt-1">
                  אפשר לדלג על החיבור הזה ולחבר רק את אינסטגרם ופייסבוק. שם נמדוד כמה אנשים ראו
                  את הפוסטים ואיך הגיבו.
                </p>
              </div>
            </RowDetails>
          </div>

          {/* ============================================================== */}
          {/* CONNECTION 4: Instagram & Facebook */}
          {/* ============================================================== */}
          <div className="border-t border-[var(--rule)] p-5 sm:p-6">
            <RowHead
              mark="אינסטה"
              title="אינסטגרם ופייסבוק"
              status={metaConnected ? "מחובר" : metaNeedsSelection ? "נשאר לבחור" : "לא מחובר"}
              tone={metaConnected ? "emerald" : metaNeedsSelection ? "amber" : "slate"}
              note="מי ראה את הפוסטים, ומה אהבו."
            />

            <div className="mt-4">
              {metaNeedsSelection ? (
                <div className="rounded-md p-4" style={{ background: TONE.surface }}>
                  <p className="text-xs font-bold text-[var(--ink)]">
                    אישרתם את הכניסה. נשאר לבחור את הדף העסקי. אם הוא מקושר לאינסטגרם, גם
                    החשבון ייבחר איתו.
                  </p>
                  <label htmlFor="meta-page" className="mb-2 mt-3 block text-xs font-bold text-[var(--ink-soft)]">בחירת דף עסקי</label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <select
                      id="meta-page"
                      value={selectedMetaPage}
                      onChange={(e) => setSelectedMetaPage(e.target.value)}
                      className="min-h-11 min-w-0 flex-1 rounded border border-[var(--rule-dark)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:border-[var(--ink)] focus:outline-none"
                    >
                      <option value="">-- בחרו דף מהרשימה --</option>
                      {metaItem?.pages?.map((page) => (
                        <option key={page.page_id} value={page.page_id}>
                          {page.display_name} {page.instagram_id ? "(עם אינסטגרם מקושר)" : "(בלי אינסטגרם מקושר)"}
                        </option>
                      ))}
                    </select>

                    <Button
                      size="md"
                      tone="primary"
                      variant={primaryKey === "meta" ? "solid" : "outline"}
                      disabled={savingMeta || !selectedMetaPage}
                      onClick={handleSaveMetaPage}
                    >
                      {savingMeta ? "שומרים…" : "זה הדף שלי"}
                    </Button>
                  </div>
                </div>
              ) : metaConnected ? (
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <p className="flex items-center gap-2 text-xs" style={{ color: TONE.accent }}>
                    <IconCheck className="h-4 w-4 shrink-0" />
                    <span>
                      מחובר לדף:{" "}
                      <strong>{metaItem?.display_name || metaItem?.external_id}</strong>
                    </span>
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleStartMeta}
                      className="text-xs font-bold text-[var(--ink)] underline underline-offset-4"
                    >
                      להחליף דף
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDisconnect("meta")}
                      className="text-xs text-[var(--ink-muted)] underline underline-offset-4 hover:text-[var(--ink)]"
                    >
                      לנתק
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <Button
                    size="md"
                    tone="primary"
                    variant={primaryKey === "meta" ? "solid" : "outline"}
                    onClick={handleStartMeta}
                  >
                    <IconLink className="h-4 w-4" />
                    <span>לחבר את אינסטגרם ופייסבוק</span>
                  </Button>
                  <span className="text-xs text-[var(--ink-muted)]">
                    עם החשבון שמנהל את הדף.
                  </span>
                </div>
              )}
            </div>
            {metaConnected ? null : (
              <HowToFind topic="instagram_business" label="מה צריך כדי לחבר?" className="mt-1" />
            )}

            <RowDetails summary="מה זה נותן, ומה אם האינסטגרם שלי פרטי?">
              <p>
                מכאן אנחנו לומדים מה הקהל שלכם באמת אוהב: כמה אנשים ראו כל פוסט, כמה שמרו וכמה
                הגיבו. את מה שעבד נעשה שוב בתוכנית של החודש הבא.
              </p>
              <p>
                מתחברים עם חשבון הפייסבוק שמנהל את הדף, כי פייסבוק ואינסטגרם שייכות לאותה
                חברה.
              </p>
              <div>
                <p className="font-bold text-[var(--ink)]">1. החשבון שלכם פרטי?</p>
                <p className="mt-1">
                  פייסבוק נותנת נתונים רק על חשבונות מקצועיים (זה בחינם). כדי לעבור: באפליקציית אינסטגרם › פרופיל ›
                  תפריט › הגדרות ופעילות (Settings and activity) › סוג חשבון וכלים › <strong>מעבר לחשבון מקצועי</strong> ›
                  עסק או יוצר תוכן.
                </p>
              </div>
              <div className="border-t border-[var(--rule)] pt-3">
                <p className="font-bold text-[var(--ink)]">2. האינסטגרם חייב להיות מקושר לדף בפייסבוק</p>
                <p className="mt-1">
                  זו דרישה של פייסבוק: בלי דף עסקי בפייסבוק אין גישה לנתוני האינסטגרם. אפשר לפתוח דף
                  פשוט בחינם, ולחבר אליו את האינסטגרם בהגדרות הדף, תחת <strong>חשבונות מקושרים</strong>.
                </p>
              </div>
              <div className="border-t border-[var(--rule)] pt-3">
                <p className="font-bold text-[var(--ink)]">3. מישהו אחר מנהל לכם את הדף?</p>
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
          </div>
        </section>

        {/* Technical, and only for the people who need it: no card, just a line that opens. */}
        <details className="group mt-6 border-t border-[var(--rule)] pt-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-bold text-[var(--ink-soft)] hover:text-[var(--ink)]">
            <span>חיבור למערכות אחרות (טכני)</span>
            <Caret />
          </summary>

          <div className="mt-4 space-y-4">
            <p className="text-xs leading-relaxed text-[var(--ink-soft)]">
              הזינו כתובת, ונשלח אליה הודעה אוטומטית בכל פעם שנבנית תוכנית חודשית חדשה או המלצות לשבוע.
              למשל, כדי להעביר אותן ל-Zapier או למערכת לניהול לקוחות. בשפה הטכנית: Webhook.
            </p>

            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://your-crm-webhook-url.com"
                className="flex-1 rounded-md border border-[var(--rule-dark)] bg-[var(--canvas)] px-3.5 py-2 text-sm text-[var(--ink)] focus:border-[var(--ink)] focus:outline-none"
              />
              <Button
                size="sm"
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
              <div
                className="rounded-md border p-3 text-xs"
                style={{ background: TONE.surface, borderColor: TONE.border, color: TONE.accent }}
              >
                <span className="mb-1 block font-bold">קוד סודי לחתימה (מוצג רק פעם אחת, שמרו אותו):</span>
                <code className="rounded border bg-white px-2 py-1 font-mono" style={{ borderColor: TONE.border }}>
                  {secret}
                </code>
              </div>
            ) : null}

            {data?.webhooks && data.webhooks.length > 0 ? (
              <div className="space-y-2 pt-2">
                <span className="block text-xs font-bold text-[var(--ink)]">כתובות פעילות:</span>
                {data.webhooks.map((hook) => (
                  <div
                    key={hook.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-[var(--rule)] bg-[var(--canvas)] p-3 text-xs"
                  >
                    <span className="max-w-md truncate font-mono text-[var(--ink-soft)]">{hook.url}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        await endpoints.deleteWebhook(hook.id);
                        await reload();
                        toast("הכתובת נמחקה");
                      }}
                    >
                      למחוק את הכתובת
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </details>
      </div>
    </AppShell>
  );
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
    <div id="whatsapp" className="scroll-mt-20 border-t border-[var(--rule)] p-5 sm:p-6">
      <RowHead
        mark="וואטסאפ"
        title="קישור הוואטסאפ"
        status={isSet ? "פעיל" : "לא הוגדר"}
        tone={isSet ? "emerald" : "slate"}
        // What is counted and what is not, as the row's one line: on the face, never
        // behind the expand (UI-RULES rule 7 never drops a "we cannot measure this").
        note="סופרים לחיצות, לא הודעות שנשלחו. הקוד בהודעה מראה מאיפה הגיעה הפנייה."
      />

      {showForm ? (
        <div className="mt-4">
          <label htmlFor="whatsapp-number" className="mb-2 block text-xs font-bold text-[var(--ink-soft)]">
            מספר הוואטסאפ של העסק
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="whatsapp-number"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={numberValue}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="050-1234567"
              dir="ltr"
              className="min-h-11 min-w-0 flex-1 rounded border border-[var(--rule-dark)] bg-[var(--canvas)] px-3 py-2 text-right text-sm text-[var(--ink)] focus:border-[var(--ink)] focus:outline-none"
            />
            <Button
              size="md"
              tone="primary"
              variant={primary ? "solid" : "outline"}
              disabled={saving || !numberValue.trim()}
              onClick={() => void save({ number: numberValue }, isSet ? "המספר עודכן" : "הקישורים מוכנים")}
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
              className="mt-2 min-h-11 text-xs text-[var(--ink-soft)] underline underline-offset-4"
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
        <div className="mt-4">
          <p className="text-xs font-bold text-[var(--ink-soft)]">להעתיק קישור:</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {fixed.map((link) => (
              <button
                key={link.code}
                type="button"
                onClick={() => void copyText(link.url, `הקישור ל${link.label_he} הועתק`)}
                aria-label={`להעתיק את הקישור ל${link.label_he}`}
                title={link.url}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-[var(--rule-dark)] bg-white px-3 text-xs font-bold text-[var(--ink)] hover:bg-[var(--canvas)]"
              >
                <IconCopy className="h-3.5 w-3.5" />
                {WHATSAPP_SHORT[link.source_key] || link.label_he}
              </button>
            ))}
          </div>
        </div>
      )}

      {error ? (
        <p className="mt-2 rounded-md border border-[var(--danger-rule)] bg-[var(--danger-soft)] px-2.5 py-1.5 text-[13px] leading-5 text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      {isSet ? null : <HowToFind topic="whatsapp_business" label="איך כותבים את המספר?" className="mt-1" />}

      <RowDetails summary={isSet ? "המספר וההודעה" : "מה נספר ומה לא"}>
        {isSet && !editing ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              המספר:{" "}
              <strong dir="ltr" className="text-[var(--ink)]">
                {data?.number_display}
              </strong>
            </span>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="min-h-11 font-bold text-[var(--ink)] underline underline-offset-4"
            >
              לשנות את המספר
            </button>
          </p>
        ) : null}
        {isSet ? (
          <div className="border-t border-[var(--rule)] pt-3">
            <label htmlFor="whatsapp-text" className="block font-bold text-[var(--ink)]">
              ההודעה שהלקוח שולח
            </label>
            <textarea
              id="whatsapp-text"
              value={textValue}
              maxLength={300}
              rows={2}
              onChange={(e) => setText(e.target.value)}
              placeholder={data?.default_text_fallback_he}
              className="mt-1.5 w-full rounded-md border border-[var(--rule-dark)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] focus:border-[var(--ink)] focus:outline-none"
            />
            <p className="mt-1">
              בסוף ההודעה נוסיף קוד קצר לפי המקום, למשל <bdi>(קוד: IG-BIO)</bdi>. אם הלקוח
              מוחק אותו, לא נדע מאיפה הגיע.
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={saving || text === null}
              onClick={() =>
                void save({ number: data?.number_e164 || "", default_text_he: textValue }, "ההודעה נשמרה")
              }
              className="mt-2"
            >
              {saving ? "שומרים…" : "לשמור את ההודעה"}
            </Button>
          </div>
        ) : null}
        <div className={isSet ? "border-t border-[var(--rule)] pt-3" : ""}>
          <p className="font-bold text-[var(--ink)]">איפה שמים כל קישור</p>
          <ul className="mt-1 space-y-0.5">
            {FIXED_SOURCES.map((key) => (
              <li key={key}>
                <strong>{WHATSAPP_LABELS[key]}:</strong> {SOURCE_HINT_HE[key]}
              </li>
            ))}
            <li>
              <strong>פוסטים:</strong> כל פוסט שמזמין לכתוב בוואטסאפ מקבל קישור משלו, בערכת הפרסום של
              הפוסט.
            </li>
          </ul>
        </div>
        {postLinks.length ? (
          <div className="border-t border-[var(--rule)] pt-3">
            <p className="font-bold text-[var(--ink)]">הקישורים של הפוסטים</p>
            <ul className="mt-1 space-y-1">
              {postLinks.map((link) => (
                <li key={link.code} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate">{link.label_he}</span>
                  <button
                    type="button"
                    onClick={() => void copyText(link.url, "הקישור הועתק")}
                    className="min-h-11 shrink-0 font-bold text-[var(--ink)] underline underline-offset-2"
                  >
                    להעתיק
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="border-t border-[var(--rule)] pt-3">
          <p className="font-bold text-[var(--ink)]">מה נספר ומה לא</p>
          <p className="mt-1">
            נספרת כל לחיצה על הקישור, ואם אותו אדם לחץ פעמיים, זה נספר פעמיים. לא נדע אם ההודעה
            נשלחה או אם נסגרה עסקה. את זה רק אתם רואים בוואטסאפ.
          </p>
          <p className="mt-1">
            תצוגה מקדימה של הקישור, למשל כשמדביקים אותו בצ׳אט, לא נספרת. על כל לחיצה אנחנו שומרים רק
            את היום, את הקישור ואת סוג המכשיר בערך. לא את כתובת הרשת של המכשיר, ולא מי לחץ.{" "}
            <a href="/security#whatsapp" className="font-bold text-[var(--ink)] underline">
              עוד על הפרטיות
            </a>
          </p>
        </div>
      </RowDetails>
    </div>
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
function RowHead({
  mark,
  title,
  status,
  tone,
  note,
}: {
  mark: string;
  title: string;
  status: string;
  tone: "emerald" | "amber" | "slate";
  note: string;
}) {
  return (
    <div className="flex items-start gap-4">
      <span aria-hidden className="mt-1 w-12 shrink-0 border-b-2 border-[var(--sun)] pb-2 text-[10px] font-bold text-[var(--primary)]">{mark}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-lg font-bold text-[var(--ink)]">{title}</h2>
          <span className={`text-xs font-bold ${tone === "emerald" ? "text-[var(--primary)]" : tone === "amber" ? "text-[var(--sand-dark)]" : "text-[var(--ink-muted)]"}`}>{status}</span>
        </div>
        <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">{note}</p>
      </div>
    </div>
  );
}

/** Detail on demand: the reasoning and the how-to sit one tap down, never above the row. */
function RowDetails({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="group mt-4 border-t border-[var(--rule)] pt-3">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-xs font-bold text-[var(--ink-soft)] hover:text-[var(--ink)]">
        <Caret />
        {summary}
      </summary>
      <div className="mt-3 space-y-3 text-xs leading-relaxed text-[var(--ink-soft)]">{children}</div>
    </details>
  );
}

/**
 * The disclosure caret, drawn as a CSS triangle rather than a "▾" glyph: rule 7 counts
 * `main.innerText`, and a text glyph is counted as a word on every closed expand.
 */
function Caret() {
  return (
    <span
      aria-hidden
      className="h-0 w-0 shrink-0 border-x-[4px] border-t-[5px] border-x-transparent border-t-[var(--ink-muted)] transition-transform duration-200 group-open:rotate-180"
    />
  );
}
