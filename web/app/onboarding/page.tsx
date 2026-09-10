"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell, Badge, Button, ErrorNote } from "@/components/AppShell";
import {
  endpoints,
  generateUntilDone,
  isDemo,
  type BrandLanguage,
  type Competitor,
  type GrowthHypothesis,
} from "@/lib/api";
import { IconCheck, IconStore } from "@/lib/icons";
import { toast } from "@/lib/ui";

const BUSINESS_TYPES = [
  "מאפייה / קפה / מסעדה",
  "חנות פיזית / קמעונאות",
  "חנות אונליין (אי-קומרס)",
  "שירותים מקצועיים (עו\"ד, רו\"ח, ייעוץ)",
  "קליניקה, יופי ובריאות",
  "סטודיו לאימון / ספורט",
  "עיצוב / אדריכלות / נדל״ן",
  "הדרכות, קורסים וחינוך",
  "תיירות ואירוח",
  "עסק אחר",
];

const PRESENCE_MODELS: {
  key: "brick_and_mortar" | "online_only" | "hybrid";
  title: string;
  desc: string;
}[] = [
  {
    key: "brick_and_mortar",
    title: "חנות פיזית / סניף",
    desc: "לקוחות מגיעים למיקום פיזי",
  },
  {
    key: "online_only",
    title: "אונליין בלבד",
    desc: "אתר או שירות דיגיטלי",
  },
  {
    key: "hybrid",
    title: "משולב",
    desc: "חנות פיזית וגם הזמנות באתר",
  },
];

const STAGE_LABELS: Record<string, string> = {
  scan: "קוראים את האתר ואת שפת המותג…",
  usp: "מנסחים את הכיוון והבידול…",
  plan: "בונים את תוכנית החודש…",
  posts: "כותבים את הפוסטים לשבועות 1–2…",
  posts_late: "כותבים את הפוסטים לשבועות 3–4…",
  done: "התוכנית מוכנה",
};

const ROLE_LABELS: Record<string, string> = {
  primary: "צבע ראשי",
  accent: "צבע הדגשה",
  background: "רקע",
  ink: "טקסט",
  secondary: "משני",
};

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanNote, setScanNote] = useState("");
  const [generateStage, setGenerateStage] = useState("");

  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState(BUSINESS_TYPES[0]);
  const [offerings, setOfferings] = useState("");
  const [presenceType, setPresenceType] =
    useState<"brick_and_mortar" | "online_only" | "hybrid">("brick_and_mortar");
  const [location, setLocation] = useState("");
  const [website, setWebsite] = useState("");
  const [instagramLink, setInstagramLink] = useState("");
  const [whatsappLink, setWhatsappLink] = useState("");
  const [brand, setBrand] = useState<BrandLanguage | null>(null);
  const [paletteNote, setPaletteNote] = useState("");

  const [budget, setBudget] = useState(4500);
  const [goal, setGoal] = useState<"sales" | "brand_awareness">("sales");
  const [hypotheses, setHypotheses] = useState<GrowthHypothesis[]>([]);
  const [selectedHypothesis, setSelectedHypothesis] = useState("");
  const [competitors, setCompetitors] = useState<Competitor[]>([{ name: "", website_url: "" }]);

  useEffect(() => {
    if (isDemo()) {
      router.replace("/dashboard");
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const fromLanding = params.get("website") || "";
    endpoints
      .business()
      .then((res) => {
        const business = res.business;
        if (business?.onboarding_complete) {
          router.replace("/dashboard");
          return;
        }
        if (business?.name) setName(business.name);
        if (business?.business_type) setBusinessType(business.business_type);
        if (business?.offerings) setOfferings(business.offerings);
        if (business?.location) setLocation(business.location);
        if (business?.presence_type) setPresenceType(business.presence_type);
        if (business?.website_url) setWebsite(business.website_url);
        if (business?.social_links?.instagram) setInstagramLink(business.social_links.instagram);
        if (business?.social_links?.whatsapp) setWhatsappLink(business.social_links.whatsapp);
        if (business?.brand_language) setBrand(business.brand_language);
        if (business?.monthly_budget_ils) setBudget(business.monthly_budget_ils);
        if (!business?.website_url && fromLanding) setWebsite(fromLanding);
      })
      .catch(() => {
        if (fromLanding) setWebsite(fromLanding);
      });
  }, [router]);

  async function updateSwatch(index: number, hex: string) {
    if (!brand) return;
    const next = brand.palette.map((s, i) => (i === index ? { ...s, hex } : s));
    setBrand({ ...brand, palette: next });
    try {
      await endpoints.savePalette(next);
      setPaletteNote("הצבעים נשמרו ✓");
      window.setTimeout(() => setPaletteNote(""), 2500);
    } catch {
      setPaletteNote("שמירת הצבע נכשלה");
    }
  }

  async function handleScanWebsite() {
    if (!/^https?:\/\/.+/i.test(website.trim())) {
      setError("הזינו כתובת אתר מלאה שמתחילה ב-http:// או https://");
      return;
    }
    setError("");
    setBusy(true);
    setScanNote("קוראים את האתר ומחלצים צבעים, טון ומוצרים…");
    try {
      const result = await endpoints.scanWebsite(website.trim());
      const nextBrand = result.scan.brand_language;
      setBrand(nextBrand);
      if (nextBrand.business_name) setName(nextBrand.business_name);
      if (nextBrand.offers_seen?.length) setOfferings(nextBrand.offers_seen.join(", "));
      // City / neighbourhood is extracted from the site too, so the user does not have
      // to retype something we already read.
      const extracted = result.scan.extracted as { location?: string } | undefined;
      if (extracted?.location) setLocation(extracted.location);
      toast("שפת המותג נלמדה מהאתר");
    } catch (err) {
      setError(err instanceof Error ? err.message : "קריאת האתר נכשלה");
    } finally {
      setBusy(false);
      setScanNote("");
    }
  }

  async function goToStep2() {
    setError("");
    if (name.trim().length < 2) {
      setError("נא להזין שם עסק.");
      return;
    }
    if (offerings.trim().length < 3) {
      setError("נא לפרט מה העסק מוכר או מציע.");
      return;
    }
    setBusy(true);
    try {
      await endpoints.saveProfile({
        name,
        website_url: website,
        business_type: businessType,
        offerings,
        location,
        presence_type: presenceType,
        social_links: { instagram: instagramLink, whatsapp: whatsappLink },
        monthly_budget_ils: budget,
        competitors: competitors.filter((item) => item.name.trim()),
        primary_goal: goal,
      });
      if (brand) {
        const result = await endpoints.hypotheses();
        setHypotheses(result.hypotheses);
        setSelectedHypothesis(result.hypotheses[0]?.hypothesis || "");
      }
      setStep(2);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירת הפרופיל נכשלה");
    } finally {
      setBusy(false);
    }
  }

  async function generateMonth() {
    setError("");
    if (!Number.isFinite(budget) || budget < 0) {
      setError("התקציב החודשי חייב להיות מספר תקין בש״ח.");
      return;
    }
    if (!selectedHypothesis && hypotheses.length) {
      setError("בחרו כיוון צמיחה אחד.");
      return;
    }
    setBusy(true);
    setGenerateStage("usp");
    const poll = window.setInterval(() => {
      endpoints
        .business()
        .then((res) => {
          const stage = res.business?.generate_state?.stage;
          if (stage) setGenerateStage(stage);
        })
        .catch(() => {});
    }, 2500);
    try {
      await endpoints.saveProfile({
        name,
        website_url: website,
        business_type: businessType,
        offerings,
        location,
        presence_type: presenceType,
        social_links: { instagram: instagramLink, whatsapp: whatsappLink },
        monthly_budget_ils: budget,
        competitors: competitors.filter((item) => item.name.trim()),
        primary_goal: goal,
        growth_hypothesis: selectedHypothesis,
      });
      await generateUntilDone(endpoints.generate, setGenerateStage);
      toast("התוכנית החודשית מוכנה");
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "בניית התוכנית נכשלה");
    } finally {
      window.clearInterval(poll);
      setBusy(false);
      setGenerateStage("");
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="py-2">
          <p className="text-xs font-bold text-[#5e6159]">
            שלב {step} מתוך 2: {step === 1 ? "העסק והאתר" : "הכיוון לחודש"}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e6e4dc]">
            <div className="h-full bg-[#191b18] transition-all" style={{ width: step === 1 ? "50%" : "100%" }} />
          </div>
        </div>

        {error ? <ErrorNote message={error} /> : null}

        {step === 1 ? (
          <div className="space-y-6 rounded-lg border border-[#e6e4dc] bg-white p-6 sm:p-8">
            <div>
              <h2 className="text-2xl font-black text-[#191b18]">קודם האתר. אחר כך נדייק יחד.</h2>
              <p className="mt-1 text-sm text-[#5e6159]">
                נקרא את האתר, נמלא את הפרטים, ואתם רק מאשרים שזה נכון.
              </p>
            </div>

            <div className="border-t border-[#e6e4dc] pt-4">
              <label className="mb-1.5 block text-xs font-bold text-[#191b18]">כתובת האתר</label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="url"
                  value={website}
                  onChange={(event) => setWebsite(event.target.value)}
                  placeholder="https://myshop.co.il"
                  className="flex-1 rounded-md border border-[#dedcd4] bg-[#faf8f5] px-3 py-2 text-sm"
                />
                <Button onClick={() => void handleScanWebsite()} disabled={busy}>
                  {busy && scanNote ? "קוראים אתר…" : "קראו את האתר"}
                </Button>
              </div>
              {scanNote ? <p className="mt-2 text-xs font-bold text-[#2d3f32]">{scanNote}</p> : null}
              <p className="mt-2 text-xs text-[#8b8e84]">
                אין אתר עדיין? דלגו על הסריקה ומלאו שם ומה אתם מוכרים.
              </p>
            </div>

            {brand ? (
              <div className="space-y-3 rounded-md border border-[#c8d6c4] bg-[#e8eee5] p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#2d3f32]">שפת המותג מהאתר</span>
                  <Badge tone="emerald">נלמד מהאתר</Badge>
                </div>
                <div>
                  <p className="mb-1.5 text-[11px] text-[#4a5b4c]">
                    אפשר לתקן את הצבעים — הם קובעים איך ייראו כל הכרטיסים והפוסטים.
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    {brand.palette.map((swatch, i) => (
                      <label
                        key={`${swatch.role}-${i}`}
                        className="flex items-center gap-1.5"
                        title={swatch.role}
                      >
                        <input
                          type="color"
                          value={/^#[0-9a-fA-F]{6}$/.test(swatch.hex) ? swatch.hex : "#000000"}
                          onChange={(e) => void updateSwatch(i, e.target.value)}
                          className="h-7 w-7 cursor-pointer rounded-full border border-[#c7c4b8] bg-transparent p-0"
                        />
                        <span className="text-[10px] font-bold text-[#4a5b4c]">
                          {ROLE_LABELS[swatch.role] || swatch.role}
                        </span>
                      </label>
                    ))}
                  </div>
                  {paletteNote ? (
                    <p className="mt-1.5 text-[11px] font-bold text-[#2d3f32]">{paletteNote}</p>
                  ) : null}
                </div>
                <p className="text-xs text-[#2d3f32]">
                  <span className="font-bold">טון: </span>
                  {brand.voice}
                </p>
              </div>
            ) : null}

            <div className="grid gap-4 border-t border-[#e6e4dc] pt-4 sm:grid-cols-2">
              <Field label="שם העסק" value={name} onChange={setName} />
              <div>
                <label className="mb-1 block text-xs font-bold text-[#191b18]">סוג העסק</label>
                <select
                  value={businessType}
                  onChange={(event) => setBusinessType(event.target.value)}
                  className="w-full rounded-md border border-[#dedcd4] bg-white px-3 py-2 text-sm"
                >
                  {BUSINESS_TYPES.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <Field label="מה אתם מוכרים או מציעים" value={offerings} onChange={setOfferings} />
              </div>
              <Field label="עיר / שכונה" value={location} onChange={setLocation} />
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {PRESENCE_MODELS.map((model) => (
                <button
                  key={model.key}
                  type="button"
                  onClick={() => setPresenceType(model.key)}
                  className={`rounded-md border p-3 text-right ${
                    presenceType === model.key
                      ? "border-[#191b18] bg-[#191b18] text-white"
                      : "border-[#e6e4dc] bg-[#f8f7f4] text-[#191b18]"
                  }`}
                >
                  <span className="block text-xs font-bold">{model.title}</span>
                  <span className="mt-1 block text-[11px] opacity-80">{model.desc}</span>
                </button>
              ))}
            </div>

            <details className="border-t border-[#e6e4dc] pt-3">
              <summary className="cursor-pointer text-xs font-bold text-[#5e6159]">
                אינסטגרם או וואטסאפ (לא חובה)
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="אינסטגרם" value={instagramLink} onChange={setInstagramLink} />
                <Field label="קישור וואטסאפ" value={whatsappLink} onChange={setWhatsappLink} />
              </div>
            </details>

            <div className="flex justify-end border-t border-[#e6e4dc] pt-4">
              <Button onClick={() => void goToStep2()} disabled={busy}>
                {busy ? "שומרים…" : "המשך לבחירת כיוון"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6 rounded-lg border border-[#e6e4dc] bg-white p-6 sm:p-8">
            <div>
              <h2 className="text-2xl font-black text-[#191b18]">בחרו כיוון. אנחנו נבנה את החודש.</h2>
              <p className="mt-1 text-sm text-[#5e6159]">
                שלוש השערות מהאתר ומהעסק שלכם. בחרו אחת — לא צריך לנסח אסטרטגיה.
              </p>
            </div>

            {hypotheses.length ? (
              <div className="space-y-2">
                {hypotheses.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedHypothesis(item.hypothesis)}
                    className={`w-full rounded-md border p-4 text-right ${
                      selectedHypothesis === item.hypothesis
                        ? "border-[#191b18] bg-[#f4f3ee]"
                        : "border-[#e6e4dc] bg-white"
                    }`}
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span>
                        <span className="block text-sm font-bold text-[#191b18]">{item.title}</span>
                        <span className="mt-1 block text-sm leading-6 text-[#5e6159]">{item.hypothesis}</span>
                        <span className="mt-2 block text-xs text-[#8b8e84]">{item.why_this}</span>
                      </span>
                      {selectedHypothesis === item.hypothesis ? (
                        <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#191b18]" />
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="rounded-md border border-[#e6e4dc] bg-[#faf8f5] p-4 text-sm text-[#5e6159]">
                סרקו אתר בשלב הקודם כדי שנציע שלושה כיוונים. אפשר גם לכתוב כיוון אחד בעצמכם.
              </p>
            )}

            {!hypotheses.length ? (
              <textarea
                rows={3}
                value={selectedHypothesis}
                onChange={(event) => setSelectedHypothesis(event.target.value)}
                placeholder="אם נזמין חלות בוואטסאפ יומיים לפני שישי, נמכור יותר ונזרוק פחות."
                className="w-full rounded-md border border-[#dedcd4] p-3 text-sm"
              />
            ) : null}

            <div className="grid gap-4 border-t border-[#e6e4dc] pt-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-[#191b18]">תקציב שיווק חודשי (ש״ח)</label>
                <input
                  type="number"
                  value={budget}
                  onChange={(event) => setBudget(Number(event.target.value))}
                  className="w-full rounded-md border border-[#dedcd4] px-3 py-2 text-sm font-bold"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-[#191b18]">המטרה החודש</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setGoal("sales")}
                    className={`rounded-md border p-3 text-right text-xs font-bold ${
                      goal === "sales" ? "border-[#191b18] bg-[#191b18] text-white" : "border-[#e6e4dc]"
                    }`}
                  >
                    מכירות
                  </button>
                  <button
                    type="button"
                    onClick={() => setGoal("brand_awareness")}
                    className={`rounded-md border p-3 text-right text-xs font-bold ${
                      goal === "brand_awareness" ? "border-[#191b18] bg-[#191b18] text-white" : "border-[#e6e4dc]"
                    }`}
                  >
                    חשיפה
                  </button>
                </div>
              </div>
            </div>

            <details className="border-t border-[#e6e4dc] pt-3">
              <summary className="cursor-pointer text-xs font-bold text-[#5e6159]">מתחרים (לא חובה, מספיק שם)</summary>
              <div className="mt-3 space-y-2">
                {competitors.map((item, index) => (
                  <input
                    key={index}
                    value={item.name}
                    onChange={(event) => {
                      const next = [...competitors];
                      next[index] = { ...next[index], name: event.target.value };
                      if (index === competitors.length - 1 && event.target.value && competitors.length < 3) {
                        next.push({ name: "", website_url: "" });
                      }
                      setCompetitors(next);
                    }}
                    placeholder="שם מתחרה"
                    className="w-full rounded-md border border-[#dedcd4] px-3 py-2 text-sm"
                  />
                ))}
              </div>
            </details>

            {generateStage ? (
              <div className="flex items-center gap-3 rounded-md border border-[#e2d7c3] bg-[#fcf9f2] px-4 py-3 text-sm font-bold text-[#191b18]">
                <IconStore className="h-4 w-4" />
                {STAGE_LABELS[generateStage] || "בונים את החודש…"}
              </div>
            ) : null}

            <div className="flex items-center justify-between border-t border-[#e6e4dc] pt-4">
              <button type="button" onClick={() => setStep(1)} className="text-sm text-[#5e6159] underline">
                חזרה
              </button>
              <Button onClick={() => void generateMonth()} disabled={busy}>
                {busy ? STAGE_LABELS[generateStage] || "בונים…" : "בנו את החודש"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-bold text-[#191b18]">{label}</label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-[#dedcd4] bg-white px-3 py-2 text-sm"
      />
    </div>
  );
}
