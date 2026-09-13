"use client";

import { useEffect, useState } from "react";
import {
  AppShell,
  Badge,
  Button,
  ErrorNote,
  PageHeader,
} from "@/components/AppShell";
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
import { toast } from "@/lib/ui";

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
      return "התחברתם לגוגל בהצלחה. נשאר לבחור את הנכס — כך גוגל קוראת לאתר שלכם — כדי לסיים.";
    }
    if (params.get("meta") === "connected") {
      return "התחברתם לפייסבוק בהצלחה. נשאר לבחור את הדף העסקי (ואם הוא מקושר לאינסטגרם — גם החשבון) כדי לסיים.";
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

  async function reload(forceLive = false) {
    await endpoints
      .integrations(forceLive)
      .then((integrationsRes) => {
        setData(integrationsRes);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "שגיאה בטעינת החיבורים");
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
      setError(err instanceof Error ? err.message : "שגיאה בטעינת החיבורים")
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
      toast("במצב הדגמה מוצגים נתוני מאפייה לדוגמה. עברו לחיבור עסק אמיתי כדי לחבר את גוגל אנליטיקס.");
      return;
    }
    if (!data?.ga4_ready) {
      setError(
        "החיבור לגוגל עדיין לא הוגדר בשרת, ולכן אי אפשר להתחבר בלחיצה. חסרים GOOGLE_CLIENT_ID ו-GOOGLE_CLIENT_SECRET בקובץ .env של השרת."
      );
      setDevConfigOpen(true);
      return;
    }
    try {
      const { url } = await endpoints.ga4Start();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא ניתן להתחיל תהליך חיבור לגוגל");
    }
  }

  async function handleStartMeta() {
    setError("");
    setSuccessNote("");
    if (demo) {
      toast("במצב הדגמה מוצגים נתוני מאפייה לדוגמה. עברו לחיבור עסק אמיתי כדי לחבר את האינסטגרם שלכם.");
      return;
    }
    if (!data?.meta_ready) {
      setError(
        "החיבור לפייסבוק עדיין לא הוגדר בשרת, ולכן אי אפשר להתחבר בלחיצה. חסרים META_APP_ID ו-META_APP_SECRET בקובץ .env של השרת."
      );
      setDevConfigOpen(true);
      return;
    }
    try {
      const { url } = await endpoints.metaStart();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא ניתן להתחיל תהליך חיבור למטא");
    }
  }

  async function handleSaveGa4Property() {
    if (!selectedGa4Property) {
      setError("נא לבחור נכס מהרשימה");
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
      setSuccessNote("הנכס נבחר, והחיבור לגוגל אנליטיקס הושלם.");
      toast("החיבור לגוגל אנליטיקס הושלם");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשמירת הנכס בגוגל אנליטיקס");
    } finally {
      setSavingGa4(false);
    }
  }

  async function handleSaveMetaPage() {
    if (!selectedMetaPage) {
      setError("נא לבחור דף מהרשימה");
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
      setSuccessNote("דף הפייסבוק ואינסטגרם נבחרו וחוברו בהצלחה!");
      toast("אינסטגרם ופייסבוק חוברו בהצלחה");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשמירת דף פייסבוק");
    } finally {
      setSavingMeta(false);
    }
  }

  async function handleDisconnect(provider: "ga4" | "meta") {
    if (demo) {
      toast("במצב הדגמה החיבורים הם לדוגמה בלבד");
      return;
    }
    setError("");
    try {
      await endpoints.disconnectIntegration(provider);
      toast(provider === "ga4" ? "החיבור לגוגל אנליטיקס נותק" : "החיבור לאינסטגרם נותק");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בניתוק החיבור");
    }
  }

  async function handleUpdateWebsite() {
    if (!websiteInput.trim()) {
      setError("נא להזין כתובת אתר מלאה (לדוגמה https://myshop.co.il)");
      return;
    }
    setScanningWebsite(true);
    setError("");
    try {
      await endpoints.scanWebsite(websiteInput.trim());
      setSuccessNote("האתר נסרק בהצלחה ושפת המותג עודכנה במערכת!");
      toast("שפת המותג עודכנה מהאתר");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "סריקת האתר נכשלה");
    } finally {
      setScanningWebsite(false);
    }
  }

  function copyText(text: string, msg: string) {
    navigator.clipboard.writeText(text);
    toast(msg);
  }

  // The page's one dark button belongs to the first channel that still needs something,
  // in the order the rows appear. When everything is connected (the demo, or a finished
  // setup) the page is asking for nothing, so nothing competes: the actions that remain —
  // re-scanning the site, switching the demo off — are outlines and links.
  const primaryKey: "website" | "ga4" | "meta" | null = !business?.website_url
    ? "website"
    : !ga4Connected
      ? "ga4"
      : !metaConnected
        ? "meta"
        : null;

  return (
    <AppShell>
      <PageHeader
        title="חיבורים"
        subtitle="מה שהופך את התוכנית מניחושים למספרים אמיתיים."
      />

      {/* One quiet strip for demo/real mode instead of a box, and the switch is a link-weight
          action: this page is about the connections, not about the mode. */}
      {demo ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-y border-[#e2d7c3] bg-[#fcf9f2] px-4 py-3">
          <p className="text-xs leading-5 text-[#685f47]">
            <span className="font-bold">מצב הדגמה — מאפיית לחם תום.</span> החיבורים כאן לדוגמה,
            כדי שתראו איך המסך נראה כשהכול מחובר.
          </p>
          <button
            type="button"
            onClick={() => {
              exitDemo();
              setDemo(false);
              reload(true);
              toast("עברתם לצפייה בחשבון האמיתי שלכם");
            }}
            className="shrink-0 rounded-md border border-[#c7c4b8] bg-white px-3.5 py-2 text-xs font-bold text-[#20211f] transition-colors hover:bg-[#f4f3ee]"
          >
            מעבר לחיבור עסק אמיתי
          </button>
        </div>
      ) : (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-y border-[#e6e4dc] px-4 py-3 text-xs">
          <p className="flex flex-wrap items-center gap-2 text-[#5e6159]">
            <span className="font-bold text-[#191b18]">עסק פעיל:</span>
            <span className="font-semibold">{business?.name || "עסק ללא שם"}</span>
            {business?.website_url ? (
              <a
                href={business.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[11px] underline hover:text-[#191b18]"
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
              toast("עברתם למצב הדגמה (מאפיית לחם תום)");
            }}
            className="shrink-0 text-xs text-[#5e6159] underline underline-offset-4 hover:text-[#191b18]"
          >
            צפייה בהדגמה (לחם תום)
          </button>
        </div>
      )}

      {error ? (
        <div className="mb-6">
          <ErrorNote message={error} />
        </div>
      ) : null}

      {successNote ? (
        <div className="mb-6 flex items-center gap-2 rounded-md border border-[#c8d6c4] bg-[#e8eee5] p-4 text-xs font-semibold text-[#2d3f32] sm:text-sm">
          <IconCheck className="h-5 w-5 shrink-0 text-[#2d3f32]" />
          <span>{successNote}</span>
        </div>
      ) : null}

      {/* Developer-only: the server is missing the keys that make the one-click connection
          work. A quiet band, not a card, and hidden in demo mode. */}
      {(!data?.ga4_ready || !data?.meta_ready) && !demo ? (
        <div className="mb-6 border-y border-[#e5e3da] bg-[#faf8f5] px-4 py-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[#5e6159]">
              <span className="font-bold text-[#191b18]">הגדרות שרת:</span>{" "}
              {!data?.ga4_ready && !data?.meta_ready
                ? "חסרים מפתחות החיבור לגוגל ולפייסבוק, ולכן אי אפשר להתחבר בלחיצה."
                : !data?.ga4_ready
                  ? "חסר מפתח החיבור לגוגל, ולכן אי אפשר להתחבר לגוגל בלחיצה."
                  : "חסר מפתח החיבור לפייסבוק, ולכן אי אפשר להתחבר לאינסטגרם בלחיצה."}
            </p>
            <button
              type="button"
              onClick={() => setDevConfigOpen(!devConfigOpen)}
              className="font-bold text-[#191b18] underline underline-offset-2"
            >
              {devConfigOpen ? "הסתר הנחיות הגדרה ▲" : "הצג הנחיות הגדרה ב-.env ▼"}
            </button>
          </div>

          {devConfigOpen ? (
            <div className="mt-3 space-y-3 border-t border-[#e5e3da] pt-3 text-[#5e6159]">
              <p>
                כדי לאפשר לבעל העסק להתחבר בלחיצה אחת עם חשבון Google או Facebook שלו, יש להגדיר את המפתחות הבאים בקובץ <code className="rounded border border-[#dedcd4] bg-white px-1.5 py-0.5 font-mono">.env</code> ו-<code className="rounded border border-[#dedcd4] bg-white px-1.5 py-0.5 font-mono">api/.env</code>:
              </p>
              <div className="space-y-1 overflow-x-auto rounded border border-[#dedcd4] bg-white p-3 font-mono text-[11px] text-[#191b18]">
                <div># Google Analytics 4 (Google Cloud Console OAuth 2.0 Web Client)</div>
                <div>GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com</div>
                <div>GOOGLE_CLIENT_SECRET=your-google-client-secret</div>
                <div className="text-[#8b8e84]"># Authorized redirect URI: http://localhost:8000/integrations/ga4/callback</div>
                <div className="pt-2"># Meta Graph API (Meta for Developers - Business App)</div>
                <div>META_APP_ID=your-facebook-app-id</div>
                <div>META_APP_SECRET=your-facebook-app-secret</div>
                <div className="text-[#8b8e84]"># Valid OAuth Redirect URI: http://localhost:8000/integrations/meta/callback</div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* One container for all three connections, a hairline between the rows. Every row
          answers the same two questions in the same order: is it connected, and what do I
          press. Why it matters lives behind the row's expand. */}
      <section className="overflow-hidden rounded-lg border border-[#e6e4dc] bg-white">
        {/* ============================================================== */}
        {/* CONNECTION 1: Business Website & Brand Scraper */}
        {/* ============================================================== */}
        <div className="p-5 sm:p-6">
          <RowHead
            mark="אתר"
            title="האתר של העסק"
            status={business?.website_url ? "מחובר ומסונכרן" : "לא הוגדר"}
            tone={business?.website_url ? "emerald" : "slate"}
            note="מכאן אנחנו למדים את הצבעים, הסגנון והניסוחים."
          />

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <label htmlFor="business-website" className="sr-only">
              כתובת האתר
            </label>
            <input
              id="business-website"
              type="url"
              value={websiteInput}
              onChange={(e) => setWebsiteInput(e.target.value)}
              placeholder="https://myshop.co.il"
              className="flex-1 rounded-md border border-[#dedcd4] bg-[#faf8f5] px-3 py-2 text-sm text-[#191b18] focus:border-[#191b18] focus:outline-none"
            />
            <Button
              size="md"
              tone="primary"
              variant={primaryKey === "website" ? "solid" : "outline"}
              disabled={scanningWebsite}
              onClick={handleUpdateWebsite}
            >
              {scanningWebsite ? "סורק את האתר ומעדכן מותג…" : "סרוק ורענן מותג מהאתר"}
            </Button>
          </div>

          <RowDetails summary="מה הסריקה נותנת, ומה אם אין לי אתר?">
            <p>
              הסריקה קוראת מהאתר את פלטת הצבעים, הלוגו, הגופנים וסגנון הצילום, ואת תיאורי
              השירותים וההצעות — ומהם אנחנו בונים פוסטים שנראים כמו שהעסק שלכם היה עושה.
            </p>
            <p>
              אין אתר, או שהאתר עוד בבנייה? זה בסדר גמור. אפשר להשאיר את השדה ריק — המערכת
              תעבוד מתיאור העסק ומהעמודים באינסטגרם ובפייסבוק. כשהאתר יעלה, חזרו לכאן ולחצו
              &quot;סרוק ורענן מותג מהאתר&quot;.
            </p>
          </RowDetails>
        </div>

        {/* ============================================================== */}
        {/* CONNECTION 2: Google Analytics */}
        {/* ============================================================== */}
        <div className="border-t border-[#e9e8e3] p-5 sm:p-6">
          <RowHead
            mark="גוגל"
            title="גוגל אנליטיקס"
            status={ga4Connected ? "מחובר" : ga4NeedsSelection ? "נשאר לבחור" : "לא מחובר"}
            tone={ga4Connected ? "emerald" : ga4NeedsSelection ? "amber" : "slate"}
            note="המספרים של האתר: כמה נכנסו ומה קנו."
          />

          <div className="mt-4">
            {ga4NeedsSelection ? (
              <div className="rounded-md bg-[#fcf9f2] p-4">
                <p className="text-xs font-bold text-[#191b18]">
                  אישרתם את הכניסה לגוגל. נשאר לבחור את הנכס — כך גוגל קוראת לאתר שלכם
                  באנליטיקס:
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <label htmlFor="ga4-property" className="sr-only">
                    בחירת נכס בגוגל אנליטיקס
                  </label>
                  <select
                    id="ga4-property"
                    value={selectedGa4Property}
                    onChange={(e) => setSelectedGa4Property(e.target.value)}
                    className="flex-1 rounded-md border border-[#dedcd4] bg-white px-3 py-2 text-sm text-[#191b18] focus:border-[#191b18] focus:outline-none"
                  >
                    <option value="">-- בחרו נכס מהרשימה --</option>
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
                    {savingGa4 ? "שומר…" : "אישור ובחירת נכס זה"}
                  </Button>
                </div>
              </div>
            ) : ga4Connected ? (
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <p className="flex items-center gap-2 text-xs text-[#2d3f32]">
                  <IconCheck className="h-4 w-4 shrink-0" />
                  <span>
                    מחובר ל:{" "}
                    <strong>{ga4Item?.display_name || ga4Item?.external_id}</strong>
                  </span>
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleStartGa4}
                    className="text-xs font-bold text-[#191b18] underline underline-offset-4"
                  >
                    החלפת חשבון
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDisconnect("ga4")}
                    className="text-xs text-[#8b8e84] underline underline-offset-4 hover:text-[#191b18]"
                  >
                    ניתוק
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
                  <span>חבר את גוגל אנליטיקס</span>
                </Button>
                <span className="text-xs text-[#8b8e84]">
                  כניסה עם חשבון הגוגל שלכם, בלי סיסמה.
                </span>
              </div>
            )}
          </div>

          <RowDetails summary="מה זה נותן, ואיך משיגים גישה?">
            <p>
              בלעדיו שיווק ברשתות הוא ניחוש. משם רואים כמה אנשים נכנסו לאתר, מאיפה הגיעו ומה
              קנו, ואילו פוסטים ונושאים באמת הביאו לקוחות — ולפיהם אנחנו מחדדים את התוכנית של
              החודש הבא.
            </p>
            <p>החיבור עצמו הוא כניסה עם חשבון הגוגל שלכם, בלי סיסמה.</p>
            <div>
              <p className="font-bold text-[#191b18]">1. מישהו אחר בנה או מנהל לכם את האתר?</p>
              <p className="mt-1">
                בקשו ממנו להוסיף את הג&#39;ימייל שלכם כ-<strong>צופה (Viewer)</strong> באנליטיקס
                של האתר. אין צורך בהרשאות ניהול.
              </p>
              <div className="mt-2 flex items-center justify-between gap-2 rounded border border-[#dedcd4] bg-white p-2.5">
                <span className="truncate font-mono text-[11px] text-[#191b18]">
                  &quot;היי, תוכל בבקשה להוסיף את הג&#39;ימייל שלי כצופה באנליטיקס של האתר שלנו? תודה!&quot;
                </span>
                <button
                  type="button"
                  onClick={() =>
                    copyText(
                      "היי, תוכל בבקשה להוסיף את הג'ימייל שלי כצופה באנליטיקס של האתר שלנו? תודה!",
                      "ההודעה הועתקה! שלחו אותה בווטסאפ לבונה האתרים"
                    )
                  }
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-[#191b18] hover:underline"
                >
                  <IconCopy className="h-3.5 w-3.5" />
                  <span>העתק נוסח</span>
                </button>
              </div>
            </div>
            <div className="border-t border-[#e5e3da] pt-3">
              <p className="font-bold text-[#191b18]">2. אין אנליטיקס באתר בכלל?</p>
              <p className="mt-1">
                פותחים חשבון בחינם ב-
                <a
                  href="https://analytics.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-[#191b18] underline"
                >
                  analytics.google.com
                </a>
                , מוסיפים את האתר (בגוגל זה נקרא &quot;נכס&quot;), ומדביקים את הקוד שקיבלתם
                בהגדרות האתר — בוויקס, וורדפרס או שופיפיי.
              </p>
            </div>
            <div className="border-t border-[#e5e3da] pt-3">
              <p className="font-bold text-[#191b18]">3. העסק פיזי לגמרי, בלי אתר?</p>
              <p className="mt-1">
                אפשר לדלג על החיבור הזה ולהתחבר לאינסטגרם ולפייסבוק — משם נמדוד חשיפה
                ומעורבות קרוב לבית.
              </p>
            </div>
          </RowDetails>
        </div>

        {/* ============================================================== */}
        {/* CONNECTION 3: Instagram & Facebook */}
        {/* ============================================================== */}
        <div className="border-t border-[#e9e8e3] p-5 sm:p-6">
          <RowHead
            mark="אינסטה"
            title="אינסטגרם ופייסבוק"
            status={metaConnected ? "מחובר" : metaNeedsSelection ? "נשאר לבחור" : "לא מחובר"}
            tone={metaConnected ? "emerald" : metaNeedsSelection ? "amber" : "slate"}
            note="מה שקורה בעמוד ובאינסטגרם."
          />

          <div className="mt-4">
            {metaNeedsSelection ? (
              <div className="rounded-md bg-[#fcf9f2] p-4">
                <p className="text-xs font-bold text-[#191b18]">
                  אישרתם את הכניסה. נשאר לבחור את הדף העסקי — ואם הוא מקושר לאינסטגרם, גם
                  החשבון ייבחר איתו:
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <label htmlFor="meta-page" className="sr-only">
                    בחירת דף עסקי
                  </label>
                  <select
                    id="meta-page"
                    value={selectedMetaPage}
                    onChange={(e) => setSelectedMetaPage(e.target.value)}
                    className="flex-1 rounded-md border border-[#dedcd4] bg-white px-3 py-2 text-sm text-[#191b18] focus:border-[#191b18] focus:outline-none"
                  >
                    <option value="">-- בחרו דף מהרשימה --</option>
                    {metaItem?.pages?.map((page) => (
                      <option key={page.page_id} value={page.page_id}>
                        {page.display_name} {page.instagram_id ? "(כולל אינסטגרם מקושר)" : "(ללא אינסטגרם מקושר)"}
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
                    {savingMeta ? "שומר…" : "אישור ובחירת דף זה"}
                  </Button>
                </div>
              </div>
            ) : metaConnected ? (
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <p className="flex items-center gap-2 text-xs text-[#2d3f32]">
                  <IconCheck className="h-4 w-4 shrink-0" />
                  <span>
                    מחובר ל:{" "}
                    <strong>{metaItem?.display_name || metaItem?.external_id}</strong>
                  </span>
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleStartMeta}
                    className="text-xs font-bold text-[#191b18] underline underline-offset-4"
                  >
                    החלפת דף
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDisconnect("meta")}
                    className="text-xs text-[#8b8e84] underline underline-offset-4 hover:text-[#191b18]"
                  >
                    ניתוק
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
                  <span>חבר את אינסטגרם ופייסבוק</span>
                </Button>
                <span className="text-xs text-[#8b8e84]">
                  הכניסה עם חשבון הפייסבוק שמנהל את הדף.
                </span>
              </div>
            )}
          </div>

          <RowDetails summary="מה זה נותן, ומה אם האינסטגרם שלי פרטי?">
            <p>
              מכאן אנחנו לומדים מה הקהל באמת אוהב לראות — אילו חשיפות, צפיות, שמירות ותגובות
              כל פוסט הביא — ומשכפלים את מה שעבד בתוכנית של החודש הבא.
            </p>
            <p>
              החיבור נעשה עם חשבון הפייסבוק שמנהל את הדף. פייסבוק ואינסטגרם שייכות לאותה חברה,
              מטא.
            </p>
            <div>
              <p className="font-bold text-[#191b18]">1. החשבון שלכם פרטי?</p>
              <p className="mt-1">
                פייסבוק מוסרת נתונים רק מחשבונות מקצועיים (חינם): באפליקציית אינסטגרם › פרופיל ›
                תפריט › הגדרות ופרטיות › סוג חשבון וכלים › <strong>העבר לחשבון מקצועי</strong> ›
                עסק או יוצר תוכן.
              </p>
            </div>
            <div className="border-t border-[#e5e3da] pt-3">
              <p className="font-bold text-[#191b18]">2. חובה לקשר את האינסטגרם לדף פייסבוק</p>
              <p className="mt-1">
                זו דרישה של מטא: בלי דף פייסבוק עסקי אין גישה לנתוני האינסטגרם. אפשר לפתוח דף
                בסיסי בחינם, ובהגדרות הדף תחת <strong>חשבונות מקושרים</strong> לחבר את
                האינסטגרם.
              </p>
            </div>
            <div className="border-t border-[#e5e3da] pt-3">
              <p className="font-bold text-[#191b18]">3. מישהו אחר מנהל לכם את הדף?</p>
              <p className="mt-1">
                בקשו ממנו לוודא שיש לחשבון הפייסבוק שלכם הרשאת מנהל או גישת משימות בדף.
              </p>
              <div className="mt-2 flex items-center justify-between gap-2 rounded border border-[#dedcd4] bg-white p-2.5">
                <span className="truncate font-mono text-[11px] text-[#191b18]">
                  &quot;היי, תוכלו בבקשה לוודא שיש לי הרשאת מנהל או גישת משימות בדף הפייסבוק העסקי שלנו? תודה!&quot;
                </span>
                <button
                  type="button"
                  onClick={() =>
                    copyText(
                      "היי, תוכלו בבקשה לוודא שיש לי הרשאת מנהל או גישת משימות בדף הפייסבוק העסקי שלנו? תודה!",
                      "ההודעה הועתקה! שלחו אותה בווטסאפ למנהל הדף"
                    )
                  }
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-[#191b18] hover:underline"
                >
                  <IconCopy className="h-3.5 w-3.5" />
                  <span>העתק נוסח</span>
                </button>
              </div>
            </div>
          </RowDetails>
        </div>
      </section>

      {/* Technical, and only for the people who need it: no card, just a line that opens. */}
      <details className="group mt-6 border-t border-[#deddd8] pt-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-bold text-[#5e6159] hover:text-[#191b18]">
          <span>שליחת התראות אוטומטיות למערכות אחרות (למשל Zapier) — למשתמשים טכניים</span>
          <span aria-hidden className="transition-transform duration-200 group-open:rotate-180">
            ▾
          </span>
        </summary>

        <div className="mt-4 space-y-4">
          <p className="text-xs leading-relaxed text-[#5e6159]">
            הזינו כתובת Webhook כדי לקבל התראות אוטומטיות בכל פעם שמיוצרת אסטרטגיה חודשית חדשה
            או המלצות שבועיות.
          </p>

          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://your-crm-webhook-url.com"
              className="flex-1 rounded-md border border-[#dedcd4] bg-[#faf8f5] px-3.5 py-2 text-sm text-[#191b18] focus:border-[#191b18] focus:outline-none"
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
                toast("וובהוק נוסף בהצלחה!");
              }}
            >
              הוסף וובהוק
            </Button>
          </div>

          {secret ? (
            <div className="rounded-md border border-[#e2d7c3] bg-[#fcf9f2] p-3 text-xs text-[#6b5f43]">
              <span className="mb-1 block font-bold">קוד סודי לחתימה (נשמר פעם אחת בלבד):</span>
              <code className="rounded border border-[#e2d7c3] bg-white px-2 py-1 font-mono">
                {secret}
              </code>
            </div>
          ) : null}

          {data?.webhooks && data.webhooks.length > 0 ? (
            <div className="space-y-2 pt-2">
              <span className="block text-xs font-bold text-[#191b18]">וובהוקים פעילים:</span>
              {data.webhooks.map((hook) => (
                <div
                  key={hook.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-[#e5e3da] bg-[#faf8f5] p-3 text-xs"
                >
                  <span className="max-w-md truncate font-mono text-[#5e6159]">{hook.url}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await endpoints.deleteWebhook(hook.id);
                      await reload();
                      toast("הוובהוק נמחק");
                    }}
                  >
                    מחיקת הוובהוק
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </details>
    </AppShell>
  );
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
    <div className="flex items-start gap-3.5">
      <span
        aria-hidden
        className="flex h-10 w-12 shrink-0 items-center justify-center rounded-md bg-[#f4f1ea] text-[10px] font-black whitespace-nowrap text-[#191b18]"
      >
        {mark}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-bold text-[#191b18]">{title}</h2>
          <Badge tone={tone}>{status}</Badge>
        </div>
        <p className="mt-0.5 text-xs leading-5 text-[#5e6159]">{note}</p>
      </div>
    </div>
  );
}

/** Detail on demand: the reasoning and the how-to sit one tap down, never above the row. */
function RowDetails({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="group mt-4 border-t border-[#e9e8e3] pt-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-bold text-[#5e6159] hover:text-[#191b18]">
        <span aria-hidden className="transition-transform duration-200 group-open:rotate-180">
          ▾
        </span>
        {summary}
      </summary>
      <div className="mt-3 space-y-3 text-xs leading-relaxed text-[#5e6159]">{children}</div>
    </details>
  );
}
