"use client";

import { useEffect, useState } from "react";
import {
  AppShell,
  Badge,
  Button,
  Card,
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
  IconSparkles,
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
      return "חשבון Google Analytics אומת בהצלחה! בחרו את הנכס המתאים לסיום החיבור.";
    }
    if (params.get("meta") === "connected") {
      return "חשבון Meta אומת בהצלחה! בחרו את הדף וחשבון האינסטגרם לסיום החיבור.";
    }
    return "";
  });
  const [secret, setSecret] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [devConfigOpen, setDevConfigOpen] = useState(false);

  // Selection states after OAuth callback
  const [selectedGa4Property, setSelectedGa4Property] = useState("");
  const [selectedMetaPage, setSelectedMetaPage] = useState("");
  const [savingGa4, setSavingGa4] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);

  // Website scanner state
  const [websiteInput, setWebsiteInput] = useState("");
  const [scanningWebsite, setScanningWebsite] = useState(false);

  // Guide accordion toggles
  const [openGuide, setOpenGuide] = useState<{ [key: string]: boolean }>({});

  function toggleGuide(key: string) {
    setOpenGuide((prev) => ({ ...prev, [key]: !prev[key] }));
  }

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
      toast("במצב הדגמה מוצגים נתוני מאפייה לדוגמה. עברו לחיבור עסק אמיתי כדי לחבר את ה-GA4 שלכם.");
      return;
    }
    if (!data?.ga4_ready) {
      setError(
        "חיבור Google OAuth עדיין לא מוגדר בשרת. יש להגדיר GOOGLE_CLIENT_ID ו-GOOGLE_CLIENT_SECRET בקובץ .env של השרת."
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
        "חיבור Meta OAuth עדיין לא מוגדר בשרת. יש להגדיר META_APP_ID ו-META_APP_SECRET בקובץ .env של השרת."
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
      setSuccessNote("נכס Google Analytics נבחר וחובר בהצלחה!");
      toast("נכס Google Analytics חובר בהצלחה");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשמירת נכס Google Analytics");
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
      toast(provider === "ga4" ? "גוגל אנליטיקס נותק" : "אינסטגרם נותק");
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

  return (
    <AppShell>
      <PageHeader
        title="חיבורי רשתות ונתונים"
        subtitle="חברו את האתר, גוגל אנליטיקס ואינסטגרם כדי שהמערכת תלמד את שפת המותג שלכם ותבצע אופטימיזציה שבועית לפי תוצאות אמת"
      />

      {/* Demo Mode Notice & Real Business Switcher */}
      {demo ? (
        <div className="mb-6 rounded-lg border border-[#dedcd4] bg-[#f4f1ea] p-4 text-[#191b18]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-white border border-[#c8c5b8]">
                <IconSparkles className="w-5 h-5 text-[#191b18]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm">אתם צופים כרגע במצב הדגמה</span>
                  <Badge tone="slate">מאפיית לחם תום</Badge>
                </div>
                <p className="text-xs text-[#5e6159] mt-0.5">
                  החיבורים המוצגים להלן הם נתוני הדמיה כדי להמחיש כיצד המערכת נראית כשהערוצים מסונכרנים.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  exitDemo();
                  setDemo(false);
                  reload(true);
                  toast("עברתם לצפייה בחשבון האמיתי שלכם");
                }}
                className="drawn-button inline-flex items-center gap-1.5 bg-[#191b18] px-4 py-2 text-xs font-bold text-white hover:bg-[#2c2f29]"
              >
                <span>מעבר לחיבור עסק אמיתי</span>
                <span>←</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#e5e3da] bg-white px-4 py-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#191b18]">עסק פעיל:</span>
            <span className="font-semibold text-[#5e6159]">{business?.name || "עסק ללא שם"}</span>
            {business?.website_url ? (
              <a
                href={business.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#5e6159] hover:text-[#191b18] underline font-mono text-[11px]"
              >
                {business.website_url}
              </a>
            ) : null}
          </div>

          <button
            type="button"
            onClick={async () => {
              await endpoints.enterDemo();
              setDemo(true);
              reload();
              toast("עברתם למצב הדגמה (מאפיית לחם תום)");
            }}
            className="text-xs text-[#5e6159] hover:text-[#191b18] underline underline-offset-4"
          >
            צפייה בהדגמה (לחם תום)
          </button>
        </div>
      )}

      <ErrorNote message={error} />

      {successNote ? (
        <div className="mb-6 rounded-lg border border-[#c8d6c4] bg-[#e8eee5] p-4 text-xs sm:text-sm font-semibold text-[#2d3f32] flex items-center gap-2">
          <IconCheck className="w-5 h-5 shrink-0 text-[#2d3f32]" />
          <span>{successNote}</span>
        </div>
      ) : null}

      {/* Developer Env Diagnostics Callout (when credentials missing on server) */}
      {(!data?.ga4_ready || !data?.meta_ready) && !demo ? (
        <div className="mb-6 rounded-lg border border-[#e5e3da] bg-[#faf8f5] p-4 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[#191b18]">הגדרות שרת (OAuth API):</span>
              <span className="text-[#5e6159]">
                {!data?.ga4_ready && !data?.meta_ready
                  ? "חסרים מפתחות התחברות לגוגל ולמטא בקובץ .env"
                  : !data?.ga4_ready
                  ? "חסר מפתח התחברות לגוגל אנליטיקס בקובץ .env"
                  : "חסר מפתח התחברות למטא/אינסטגרם בקובץ .env"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setDevConfigOpen(!devConfigOpen)}
              className="text-[#191b18] font-bold underline underline-offset-2"
            >
              {devConfigOpen ? "הסתר הנחיות הגדרה ▲" : "הצג הנחיות הגדרה ב-.env ▼"}
            </button>
          </div>

          {devConfigOpen ? (
            <div className="mt-3 pt-3 border-t border-[#e5e3da] space-y-3 text-[#5e6159]">
              <p>
                כדי לאפשר לבעל העסק להתחבר בלחיצה אחת עם חשבון Google או Facebook שלו, יש להגדיר את המפתחות הבאים בקובץ <code className="bg-white px-1.5 py-0.5 rounded border border-[#dedcd4] font-mono">.env</code> ו-<code className="bg-white px-1.5 py-0.5 rounded border border-[#dedcd4] font-mono">api/.env</code>:
              </p>
              <div className="bg-white p-3 rounded border border-[#dedcd4] font-mono text-[11px] text-[#191b18] space-y-1 overflow-x-auto">
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

      {/* Main 3 Connections Grid */}
      <div className="space-y-6 mb-8">
        {/* ============================================================== */}
        {/* CONNECTION 1: Business Website & Brand Scraper */}
        {/* ============================================================== */}
        <Card>
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-[#e5e3da]">
            <div className="flex items-start gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#dedcd4] bg-[#f4f1ea] font-black text-[#191b18]">
                WWW
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-[#191b18]">אתר האינטרנט של העסק</h2>
                  <Badge tone={business?.website_url ? "emerald" : "slate"}>
                    {business?.website_url ? "סרוק ומסונכרן ✓" : "לא הוגדר"}
                  </Badge>
                </div>
                <p className="text-xs text-[#5e6159] mt-0.5">
                  מקור האמת לשפת המותג, צבעי העיצוב, סגנון הצילום והצעות הערך
                </p>
              </div>
            </div>

            {business?.website_url ? (
              <span className="font-mono text-xs text-[#5e6159] bg-[#f9f8f6] px-2.5 py-1 rounded border border-[#e5e3da]">
                {business.website_url}
              </span>
            ) : null}
          </div>

          {/* Form to update or scan */}
          <div className="mt-4 pt-1">
            <label className="block text-xs font-bold text-[#191b18] mb-1.5">
              כתובת האתר לסריקה ועדכון שפת המותג:
            </label>
            <div className="flex flex-col sm:flex-row gap-2 max-w-2xl">
              <input
                type="url"
                value={websiteInput}
                onChange={(e) => setWebsiteInput(e.target.value)}
                placeholder="https://myshop.co.il"
                className="flex-1 rounded-md border border-[#dedcd4] bg-[#faf8f5] px-3 py-2 text-sm text-[#191b18] focus:outline-none focus:border-[#191b18]"
              />
              <Button
                size="sm"
                tone="primary"
                disabled={scanningWebsite}
                onClick={handleUpdateWebsite}
              >
                {scanningWebsite ? "סורק אתר ומעדכן מותג..." : "סרוק ורענן מותג מהאתר"}
              </Button>
            </div>
          </div>

          {/* Value Explanation: What it adds & Why we need it */}
          <div className="mt-5 grid gap-4 sm:grid-cols-2 pt-4 border-t border-[#e5e3da] text-xs leading-relaxed text-[#5e6159]">
            <div className="rounded-md bg-[#faf8f5] p-3.5 border border-[#eae6dc]">
              <span className="font-bold text-[#191b18] block mb-1">מה החיבור הזה מוסיף?</span>
              <ul className="space-y-1">
                <li>• סריקה אוטומטית של פלטת צבעי המותג, לוגו, גופנים וסגנון צילום.</li>
                <li>• חילוץ תיאורי המוצרים, השירותים המובילים והצעות הערך הייחודיות שלכם.</li>
                <li>• יצירת פוסטים ותמונות שנראים כאילו הסטודיו הפנימי שלכם עיצב אותם.</li>
              </ul>
            </div>
            <div className="rounded-md bg-[#faf8f5] p-3.5 border border-[#eae6dc]">
              <span className="font-bold text-[#191b18] block mb-1">למה המערכת צריכה את זה?</span>
              <p>
                במקום שתצטרכו לשבת שעות ולהגדיר צבעים וניסוחים ידנית, המערכת מיישרת קו עם האתר הקיים בלחיצה אחת ויוצרת תוכן שנשמע ונראה בול כמו העסק שלכם מהרגע הראשון.
              </p>
            </div>
          </div>

          {/* Help Accordion if user doesn't have access or website */}
          <div className="mt-4 pt-3 border-t border-[#e5e3da]">
            <button
              type="button"
              onClick={() => toggleGuide("website")}
              className="flex w-full items-center justify-between text-right text-xs font-bold text-[#5e6159] hover:text-[#191b18]"
            >
              <span>אין לכם אתר עדיין, או שהאתר בבנייה? לחצו כאן להסבר</span>
              <span>{openGuide.website ? "▲" : "▼"}</span>
            </button>

            {openGuide.website ? (
              <div className="mt-3 space-y-2 text-xs text-[#5e6159] bg-[#f9f8f6] p-4 rounded-md border border-[#e5e3da]">
                <p>
                  <strong>אין לכם אתר פעיל?</strong> זה בסדר גמור! אתם לא חייבים אתר כדי להשתמש במערכת. המערכת תבנה את שפת המותג לפי תיאור העסק שהזנתם, וחשבון האינסטגרם והפייסבוק שלכם.
                </p>
                <p>
                  <strong>האתר סגור בסיסמה או בבנייה?</strong> השאירו את השדה ריק בינתיים. כשהאתר יעלה לאוויר לציבור, הזינו את כתובתו כאן ולחצו &quot;סרוק ורענן מותג מהאתר&quot;.
                </p>
              </div>
            ) : null}
          </div>
        </Card>

        {/* ============================================================== */}
        {/* CONNECTION 2: Google Analytics 4 (GA4) */}
        {/* ============================================================== */}
        <Card>
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-[#e5e3da]">
            <div className="flex items-start gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#dedcd4] bg-[#f2eee5] font-black text-[#191b18]">
                GA4
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-[#191b18]">גוגל אנליטיקס 4 (GA4)</h2>
                  <Badge tone={ga4Connected ? "emerald" : ga4NeedsSelection ? "amber" : "slate"}>
                    {ga4Connected
                      ? "מחובר ✓"
                      : ga4NeedsSelection
                      ? "דרושה בחירת נכס"
                      : "לא מחובר"}
                  </Badge>
                </div>
                <p className="text-xs text-[#5e6159] mt-0.5">
                  למדידת כניסות לאתר, מקורות תנועה, רכישות ופניות לקוחות
                </p>
              </div>
            </div>

            {ga4Connected ? (
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-[#5e6159] bg-[#f9f8f6] px-2.5 py-1 rounded border border-[#e5e3da]">
                  {ga4Item?.display_name || ga4Item?.external_id}
                </span>
                <button
                  type="button"
                  onClick={() => handleDisconnect("ga4")}
                  className="text-xs text-[#8b8e84] hover:text-[#191b18] underline"
                >
                  נתק
                </button>
              </div>
            ) : null}
          </div>

          {/* Action Area: Selection Dropdown OR Connect Button */}
          <div className="mt-4 pt-1">
            {ga4NeedsSelection ? (
              <div className="rounded-lg border border-[#e2d7c3] bg-[#fcf9f2] p-4 space-y-3">
                <div>
                  <span className="block text-xs font-bold text-[#191b18]">
                    החשבון אומת! בחרו את נכס ה-Google Analytics המשויך לאתר שלכם:
                  </span>
                  <span className="text-xs text-[#5e6159]">
                    נמצאו נכסים בחשבון ה-Google שלכם. בחרו את הנכס הנכון לסיום החיבור:
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 max-w-xl">
                  <select
                    value={selectedGa4Property}
                    onChange={(e) => setSelectedGa4Property(e.target.value)}
                    className="flex-1 rounded-md border border-[#dedcd4] bg-white px-3 py-2 text-sm text-[#191b18] focus:outline-none focus:border-[#191b18]"
                  >
                    <option value="">-- בחרו נכס מהרשימה --</option>
                    {ga4Item?.properties?.map((prop) => (
                      <option key={prop.property_id} value={prop.property_id}>
                        {prop.display_name} ({prop.account}) — מזהה {prop.property_id}
                      </option>
                    ))}
                  </select>

                  <Button
                    size="sm"
                    tone="primary"
                    disabled={savingGa4 || !selectedGa4Property}
                    onClick={handleSaveGa4Property}
                  >
                    {savingGa4 ? "שומר..." : "אישור ובחירת נכס זה"}
                  </Button>
                </div>
              </div>
            ) : ga4Connected ? (
              <div className="flex items-center justify-between text-xs text-[#2d3f32] bg-[#e8eee5] p-3 rounded-md border border-[#c8d6c4]">
                <div className="flex items-center gap-2">
                  <IconCheck className="w-4 h-4 text-[#2d3f32]" />
                  <span>גוגל אנליטיקס מחובר ומסונכרן עם נכס: <strong>{ga4Item?.display_name || ga4Item?.external_id}</strong></span>
                </div>
                <button
                  type="button"
                  onClick={handleStartGa4}
                  className="text-xs font-bold text-[#191b18] hover:underline"
                >
                  החלף חשבון / התחבר מחדש
                </button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <Button
                  size="md"
                  tone="primary"
                  onClick={handleStartGa4}
                >
                  <IconLink className="w-4 h-4" />
                  <span>חבר את חשבון Google Analytics</span>
                </Button>
                <span className="text-xs text-[#8b8e84]">
                  התחברות ישירה ומאובטחת דרך חשבון Google
                </span>
              </div>
            )}
          </div>

          {/* Value Explanation: What it adds & Why we need it */}
          <div className="mt-5 grid gap-4 sm:grid-cols-2 pt-4 border-t border-[#e5e3da] text-xs leading-relaxed text-[#5e6159]">
            <div className="rounded-md bg-[#faf8f5] p-3.5 border border-[#eae6dc]">
              <span className="font-bold text-[#191b18] block mb-1">מה החיבור הזה מוסיף?</span>
              <ul className="space-y-1">
                <li>• מדידה כמה אנשים נכנסו לאתר בפועל מכל פוסט ומכל ערוץ.</li>
                <li>• מעקב המרות ופניות: רכישות, טפסי לידים ולחיצות חיוג או וואטסאפ.</li>
                <li>• זיהוי עמודי המוצרים הפופולריים ושעות השיא שבהן לקוחות גולשים באתר.</li>
              </ul>
            </div>
            <div className="rounded-md bg-[#faf8f5] p-3.5 border border-[#eae6dc]">
              <span className="font-bold text-[#191b18] block mb-1">למה המערכת צריכה את זה?</span>
              <p>
                שיווק ברשת ללא אנליטיקס הוא ניחוש עיוור. הנתונים מאפשרים למערכת לזהות אילו נושאים ופוסטים באמת מביאים לקוחות משלמים, ולחדד את התוכנית של החודש הבא בהתאם.
              </p>
            </div>
          </div>

          {/* Help Accordion: If user doesn't have access yet */}
          <div className="mt-4 pt-3 border-t border-[#e5e3da]">
            <button
              type="button"
              onClick={() => toggleGuide("ga4")}
              className="flex w-full items-center justify-between text-right text-xs font-bold text-[#5e6159] hover:text-[#191b18]"
            >
              <span>אין לכם גישה ל-Google Analytics או שאינכם בטוחים איך להשיג? לחצו כאן לעזרה</span>
              <span>{openGuide.ga4 ? "▲" : "▼"}</span>
            </button>

            {openGuide.ga4 ? (
              <div className="mt-3 space-y-3 text-xs text-[#5e6159] bg-[#f9f8f6] p-4 rounded-md border border-[#e5e3da]">
                <div>
                  <h4 className="font-bold text-[#191b18] mb-1">1. מישהו אחר בנה או מנהל לכם את האתר?</h4>
                  <p className="mb-2">
                    בקשו מבונה האתרים או מאיש הדיגיטל שלכם להוסיף את הג&#39;ימייל שלכם כ-<strong>Viewer (צופה)</strong> בנכס ה-GA4. אין צורך בהרשאות ניהול (Admin).
                  </p>
                  <div className="bg-white p-2.5 rounded border border-[#dedcd4] flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-[#191b18] truncate">
                      &quot;היי, תוכל בבקשה להוסיף את הג&#39;ימייל שלי כ-Viewer ב-Google Analytics של האתר שלנו? תודה!&quot;
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        copyText(
                          "היי, תוכל בבקשה להוסיף את הג'ימייל שלי כ-Viewer ב-Google Analytics של האתר שלנו? תודה!",
                          "ההודעה הועתקה! שלחו אותה בווטסאפ לבונה האתרים"
                        )
                      }
                      className="shrink-0 text-xs font-bold text-[#191b18] hover:underline inline-flex items-center gap-1"
                    >
                      <IconCopy className="w-3.5 h-3.5" />
                      <span>העתק נוסח</span>
                    </button>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#e5e3da]">
                  <h4 className="font-bold text-[#191b18] mb-1">2. עדיין לא מותקן גוגל אנליטיקס באתר בכלל?</h4>
                  <p>
                    פתחו בחינם חשבון בכתובת <a href="https://analytics.google.com" target="_blank" rel="noopener noreferrer" className="text-[#191b18] underline font-semibold">analytics.google.com</a>, צרו נכס (Property), והעתיקו את קוד ה-Measurement ID (למשל G-XXXXXXX) אל הגדרות התוספים במערכת הניהול של האתר (וויקס, וורדפרס, שופיפיי).
                  </p>
                </div>

                <div className="pt-2 border-t border-[#e5e3da]">
                  <h4 className="font-bold text-[#191b18] mb-1">3. העסק פיזי לחלוטין בלי אתר אינטרנט?</h4>
                  <p>
                    אין בעיה! אפשר לדלג על חיבור GA4 ולהתמקד בחיבור אינסטגרם ופייסבוק למדידת חשיפה ומעורבות מקומית.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </Card>

        {/* ============================================================== */}
        {/* CONNECTION 3: Instagram & Facebook (Meta Graph API) */}
        {/* ============================================================== */}
        <Card>
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-[#e5e3da]">
            <div className="flex items-start gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#dedcd4] bg-[#f2eee5] font-black text-[#191b18]">
                IG/FB
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-[#191b18]">אינסטגרם ופייסבוק (Meta)</h2>
                  <Badge tone={metaConnected ? "emerald" : metaNeedsSelection ? "amber" : "slate"}>
                    {metaConnected
                      ? "מחובר ✓"
                      : metaNeedsSelection
                      ? "דרושה בחירת דף"
                      : "לא מחובר"}
                  </Badge>
                </div>
                <p className="text-xs text-[#5e6159] mt-0.5">
                  למדידת חשיפה (Reach), צפיות ברילס, שמירות ושיתופים של פוסטים
                </p>
              </div>
            </div>

            {metaConnected ? (
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-[#5e6159] bg-[#f9f8f6] px-2.5 py-1 rounded border border-[#e5e3da]">
                  {metaItem?.display_name || metaItem?.external_id}
                </span>
                <button
                  type="button"
                  onClick={() => handleDisconnect("meta")}
                  className="text-xs text-[#8b8e84] hover:text-[#191b18] underline"
                >
                  נתק
                </button>
              </div>
            ) : null}
          </div>

          {/* Action Area: Selection Dropdown OR Connect Button */}
          <div className="mt-4 pt-1">
            {metaNeedsSelection ? (
              <div className="rounded-lg border border-[#e2d7c3] bg-[#fcf9f2] p-4 space-y-3">
                <div>
                  <span className="block text-xs font-bold text-[#191b18]">
                    החשבון אומת! בחרו את הדף וחשבון האינסטגרם של העסק:
                  </span>
                  <span className="text-xs text-[#5e6159]">
                    נמצאו דפי פייסבוק בחשבון שלכם. בחרו את הדף הנכון:
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 max-w-xl">
                  <select
                    value={selectedMetaPage}
                    onChange={(e) => setSelectedMetaPage(e.target.value)}
                    className="flex-1 rounded-md border border-[#dedcd4] bg-white px-3 py-2 text-sm text-[#191b18] focus:outline-none focus:border-[#191b18]"
                  >
                    <option value="">-- בחרו דף מהרשימה --</option>
                    {metaItem?.pages?.map((page) => (
                      <option key={page.page_id} value={page.page_id}>
                        {page.display_name} {page.instagram_id ? "(כולל אינסטגרם מקושר)" : "(ללא אינסטגרם מקושר)"}
                      </option>
                    ))}
                  </select>

                  <Button
                    size="sm"
                    tone="primary"
                    disabled={savingMeta || !selectedMetaPage}
                    onClick={handleSaveMetaPage}
                  >
                    {savingMeta ? "שומר..." : "אישור ובחירת דף זה"}
                  </Button>
                </div>
              </div>
            ) : metaConnected ? (
              <div className="flex items-center justify-between text-xs text-[#2d3f32] bg-[#e8eee5] p-3 rounded-md border border-[#c8d6c4]">
                <div className="flex items-center gap-2">
                  <IconCheck className="w-4 h-4 text-[#2d3f32]" />
                  <span>אינסטגרם ופייסבוק מחוברים ומסונכרנים עם: <strong>{metaItem?.display_name || metaItem?.external_id}</strong></span>
                </div>
                <button
                  type="button"
                  onClick={handleStartMeta}
                  className="text-xs font-bold text-[#191b18] hover:underline"
                >
                  החלף דף / התחבר מחדש
                </button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <Button
                  size="md"
                  tone="primary"
                  onClick={handleStartMeta}
                >
                  <IconLink className="w-4 h-4" />
                  <span>חבר את אינסטגרם ופייסבוק</span>
                </Button>
                <span className="text-xs text-[#8b8e84]">
                  התחברות דרך חשבון Facebook שמנהל את דף העסק
                </span>
              </div>
            )}
          </div>

          {/* Value Explanation: What it adds & Why we need it */}
          <div className="mt-5 grid gap-4 sm:grid-cols-2 pt-4 border-t border-[#e5e3da] text-xs leading-relaxed text-[#5e6159]">
            <div className="rounded-md bg-[#faf8f5] p-3.5 border border-[#eae6dc]">
              <span className="font-bold text-[#191b18] block mb-1">מה החיבור הזה מוסיף?</span>
              <ul className="space-y-1">
                <li>• חשיפה אמיתית (Reach) ומספר צפיות ברילס ובפוסטים.</li>
                <li>• שמירות, שיתופים ותגובות מכל פוסט שפורסם.</li>
                <li>• השוואה בין פורמטים: מה עובד חזק יותר עבור הקהל שלכם (רילס מול קרוסלה).</li>
              </ul>
            </div>
            <div className="rounded-md bg-[#faf8f5] p-3.5 border border-[#eae6dc]">
              <span className="font-bold text-[#191b18] block mb-1">למה המערכת צריכה את זה?</span>
              <p>
                כדי ללמוד מה הקהל שלכם הכי אוהב לראות. המערכת מזהה אילו הוקים עבדו הכי טוב ומשכפלת את ההצלחה בתוכנית של החודש הבא.
              </p>
            </div>
          </div>

          {/* Help Accordion: If user doesn't have access or Instagram business yet */}
          <div className="mt-4 pt-3 border-t border-[#e5e3da]">
            <button
              type="button"
              onClick={() => toggleGuide("meta")}
              className="flex w-full items-center justify-between text-right text-xs font-bold text-[#5e6159] hover:text-[#191b18]"
            >
              <span>אין לכם חשבון מקצועי או שהאינסטגרם לא מקושר לפייסבוק? לחצו כאן לעזרה</span>
              <span>{openGuide.meta ? "▲" : "▼"}</span>
            </button>

            {openGuide.meta ? (
              <div className="mt-3 space-y-3 text-xs text-[#5e6159] bg-[#f9f8f6] p-4 rounded-md border border-[#e5e3da]">
                <div>
                  <h4 className="font-bold text-[#191b18] mb-1">1. יש לכם חשבון אינסטגרם פרטי?</h4>
                  <p>
                    מטא מאפשרת שליפת נתונים רק מחשבונות מקצועיים (חינם לגמרי). פתחו את אפליקציית אינסטגרם בטלפון &gt; פרופיל &gt; תפריט ☰ &gt; הגדרות ופרטיות &gt; סוג חשבון וכלים &gt; <strong>העבר לחשבון מקצועי</strong> &gt; בחרו &#39;עסק&#39; או &#39;יוצר תוכן&#39;.
                  </p>
                </div>

                <div className="pt-2 border-t border-[#e5e3da]">
                  <h4 className="font-bold text-[#191b18] mb-1">2. חובה: קישור חשבון האינסטגרם לדף פייסבוק</h4>
                  <p>
                    דרישה רשמית של מטא: לא ניתן לגשת לנתוני אינסטגרם בלי שהוא יהיה מקושר לדף פייסבוק עסקי. אם אין לכם דף פייסבוק, צרו דף עסקי בסיסי בחינם ב-Facebook, ובהגדרות הדף תחת <strong>חשבונות מקושרים (Linked Accounts)</strong> חברו את האינסטגרם.
                  </p>
                </div>

                <div className="pt-2 border-t border-[#e5e3da]">
                  <h4 className="font-bold text-[#191b18] mb-1">3. מנהל סושיאל או סוכנות מנהלים לכם את הדף?</h4>
                  <p className="mb-2">
                    בקשו מהם לוודא שמשתמש הפייסבוק שלכם הוא בעל הרשאת מנהל (Admin) או גישת משימות בדף.
                  </p>
                  <div className="bg-white p-2.5 rounded border border-[#dedcd4] flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-[#191b18] truncate">
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
                      className="shrink-0 text-xs font-bold text-[#191b18] hover:underline inline-flex items-center gap-1"
                    >
                      <IconCopy className="w-3.5 h-3.5" />
                      <span>העתק נוסח</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      {/* Advanced Webhooks Accordion */}
      <Card>
        <button
          className="flex w-full items-center justify-between text-right cursor-pointer"
          onClick={() => setAdvancedOpen((v) => !v)}
        >
          <div>
            <h3 className="text-sm font-bold text-[#191b18]">הגדרות מתקדמות (וובהוקס / חיבור ל-CRM)</h3>
            <p className="text-xs text-[#5e6159] mt-0.5">
              חיבור למערכות חיצוניות כמו Smoove / Zapier / Make (רלוונטי רק למשתמשים טכניים)
            </p>
          </div>
          <span className="text-xs font-bold text-[#8b8e84]">{advancedOpen ? "סגור ▲" : "פתח ▼"}</span>
        </button>

        {advancedOpen ? (
          <div className="mt-5 border-t border-[#e5e3da] pt-5 space-y-4">
            <p className="text-xs text-[#5e6159] leading-relaxed">
              הזינו כתובת Webhook כדי לקבל התראות אוטומטיות בכל פעם שמיוצרת אסטרטגיה חודשית חדשה או המלצות שבועיות.
            </p>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://your-crm-webhook-url.com"
                className="flex-1 border border-[#dedcd4] rounded-md px-3.5 py-2 text-sm bg-[#faf8f5] text-[#191b18] focus:outline-none focus:border-[#191b18]"
              />
              <Button
                size="sm"
                tone="primary"
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
              <div className="bg-[#fcf9f2] border border-[#e2d7c3] rounded-md p-3 text-xs text-[#6b5f43]">
                <span className="font-bold block mb-1">קוד סודי לחתימה (נשמר פעם אחת בלבד):</span>
                <code className="bg-white px-2 py-1 rounded border border-[#e2d7c3] font-mono">
                  {secret}
                </code>
              </div>
            ) : null}

            {data?.webhooks && data.webhooks.length > 0 ? (
              <div className="space-y-2 pt-2">
                <span className="text-xs font-bold text-[#191b18] block">וובהוקים פעילים:</span>
                {data.webhooks.map((hook) => (
                  <div
                    key={hook.id}
                    className="flex items-center justify-between bg-[#faf8f5] border border-[#e5e3da] rounded-md p-3 text-xs"
                  >
                    <span className="font-mono text-[#5e6159] truncate max-w-md">{hook.url}</span>
                    <Button
                      size="sm"
                      tone="danger"
                      onClick={async () => {
                        await endpoints.deleteWebhook(hook.id);
                        await reload();
                        toast("הוובהוק נמחק");
                      }}
                    >
                      מחיקה
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>
    </AppShell>
  );
}
