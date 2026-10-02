"use client";

import { createContext, Suspense, useContext, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CardCanvas, CardStage, cardSize, useCardPlan, type CardRatio } from "@/components/CardCanvas";
import type { BrandLanguage, RoadmapPost } from "@/lib/api";
import { renderCardPng } from "@/lib/cardExport";
import { OUTCOME_LABEL } from "@/lib/dna/layout";
import { COLOR_ROLES, COLOR_ROLE_LABEL, COMPOSITION_KEYS, compositionDrawsPhoto, type BrandDna, type ColorRole, type CompositionKey } from "@/lib/dna/library";
import { resolveDna } from "@/lib/dna/resolve";
import { PHOTO_AREAS, SAMPLE_BUSINESSES, type SampleBusiness, type SamplePost } from "@/lib/dna/samples";

/** The v1 demo DNA as it was stored before Revision 1, to check old DNAs still draw. */
const V1_DNA: BrandDna = {
  version: 1,
  seed: 41827,
  field: "bakery",
  type: { display: "suez-one", display_weight: 400, text: "assistant", text_weight: 500, headline_case: "sentence", scale: "large" },
  colors: { ink: "#1a1512", paper: "#f3e6d4", accent: "#b8501f", accent_2: "#6f7f4f", on_photo: "#f6eadb", tint: "#ead3b8" },
  compositions: ["arch_window", "ticket", "full_bleed", "handwritten_note"],
  motif: { kind: "stamp", color: "accent", density: "mid" },
  signature: { kind: "stamp", use_logo: true },
  copy: { price_style: "tag", cta_style: "underline" },
  rationale_he: "קמח, חלודה ותנור: אותיות כבדות כמו שלט ישן ביפו, וחותמת כמו על שקית הלחם.",
};

const V1_POSTS: Partial<RoadmapPost>[] = [
  { overlay_headline: "החלות נגמרות לפני הצהריים", overlay_badge: "שישי ביפו", stat_highlight: "100 חלות כל שישי", cta: "להזמנה בוואטסאפ", design: { composition: "arch_window" } },
  { overlay_headline: "סופגניות עם ריבה של השוק", overlay_badge: "חנוכה בתנור", stat_highlight: "12 ₪ לסופגנייה טרייה", cta: "לשריין מגש", design: { composition: "ticket" } },
  { overlay_headline: "אופים כל לילה, בלי מלאי מאתמול", overlay_badge: "מהתנור ב-05:00", cta: "לבוא לדלפק", design: { composition: "handwritten_note" } },
];

function basePost(uid: string): RoadmapPost {
  return { week: 1, date_hint: "", format: "image", title: "", angle: "", hook: "", caption: "", cta: "", calendar_tie: "", goal_fit: "", uid };
}

function postFor(biz: SampleBusiness, sp: SamplePost, i: number): RoadmapPost {
  const photo = sp.photo || biz.photo;
  const area = PHOTO_AREAS[photo];
  const composition: CompositionKey = sp.mode === "type_led" ? "type_led" : sp.composition ?? "full_bleed";
  return {
    ...basePost(`${biz.id}-${i}`),
    title: sp.headline || "",
    image_url: photo,
    has_overlay: true,
    overlay_headline: sp.headline || "",
    overlay_sub: sp.sub || "",
    price: sp.price,
    design: { composition, text_mode: sp.mode, safe_area: area?.safe_area ?? null, focal: area?.focal ?? null },
  };
}

/** Every design for a business (`?all=1`): its words in each mode and photo composition. */
function allDesigns(biz: SampleBusiness): SamplePost[] {
  const words: SamplePost = biz.posts.find((p) => p.mode === "headline" && p.headline) ?? biz.posts.find((p) => p.headline) ?? { mode: "headline", headline: "" };
  const photoKeys = COMPOSITION_KEYS.filter((k) => compositionDrawsPhoto(k));
  return [
    { mode: "photo_only" },
    { mode: "type_led", headline: words.headline, sub: words.sub },
    ...photoKeys.map((k) => ({ mode: "headline" as const, composition: k, headline: words.headline, sub: words.sub, price: words.price })),
  ];
}

function brandOf(biz: SampleBusiness): BrandLanguage {
  return {
    business_name: biz.name,
    // The old palette, for the "no DNA yet" view (?nodna=1).
    palette: [
      { hex: biz.dna.colors.accent, role: "primary", name: "" },
      { hex: biz.dna.colors.accent_2 || biz.dna.colors.accent, role: "accent", name: "" },
      { hex: biz.dna.colors.paper, role: "background", name: "" },
      { hex: biz.dna.colors.ink, role: "ink", name: "" },
    ],
    typography: { primary: "", mood: "" },
    visual_style: "",
    photography: "",
    voice: "",
    voice_examples: [],
    do_say: [],
    dont_say: [],
    messaging: [],
    offers_seen: [],
    audience: "",
    logo_description: "",
    logo_url: biz.logo,
  };
}

/* ------------------------------------------------------------------ */
/* Export-all and the readability check                               */
/* ------------------------------------------------------------------ */

type Exported = { name: string; png: string; meta: unknown };
type Registry = Map<string, () => Promise<Exported | null>>;
const RegistryContext = createContext<Registry | null>(null);

type Check = { minText: number; smallest: number; linesPlanned: number; linesDrawn: number; overflow: boolean; issues: string[] };

declare global {
  interface Window {
    __dnaQa?: Record<string, Check>;
  }
}

/**
 * What a phone would see: the smallest text drawn against the minimum, and the headline's
 * lines drawn against the lines the layout planned (more lines = the measure was off and
 * the words may run over the photo).
 */
function checkCard(node: HTMLElement): Check {
  const minText = Number(node.dataset.cardMinText || 0);
  const minHeadline = Number(node.dataset.cardMinHeadline || 0);
  const issues: string[] = [];
  let smallest = Infinity;
  node.querySelectorAll<HTMLElement>("[data-card-text]").forEach((el) => {
    if (el.offsetParent === null && getComputedStyle(el).display === "none") return;
    const size = parseFloat(getComputedStyle(el).fontSize);
    smallest = Math.min(smallest, size);
    if (size + 0.5 < minText) issues.push(`טקסט ${Math.round(size)}px קטן מ-${minText}px`);
    if (el.dataset.cardText === "headline" && size + 0.5 < minHeadline) issues.push(`כותרת ${Math.round(size)}px קטנה מ-${minHeadline}px`);
  });
  const h = node.querySelector<HTMLElement>("[data-card-text='headline']");
  let linesPlanned = 0;
  let linesDrawn = 0;
  let overflow = false;
  if (h) {
    linesPlanned = Number(h.dataset.cardLines || 0);
    const lh = parseFloat(getComputedStyle(h).lineHeight);
    linesDrawn = lh ? Math.round(h.getBoundingClientRect().height / lh) : 0;
    if (linesPlanned && linesDrawn > linesPlanned) issues.push(`הכותרת ירדה ל-${linesDrawn} שורות במקום ${linesPlanned}`);
    const card = node.getBoundingClientRect();
    const block = h.parentElement?.getBoundingClientRect();
    if (block && (block.bottom > card.bottom + 1 || h.getBoundingClientRect().bottom > block.bottom + 2)) {
      overflow = true;
      issues.push("הטקסט חורג מהמקום שלו");
    }
  }
  return { minText, smallest: Number.isFinite(smallest) ? Math.round(smallest) : 0, linesPlanned, linesDrawn, overflow, issues };
}

/** One card, with a PNG export of the real 1080px canvas next to it. */
function QaCard({ biz, post, ratio, nodna, dnaOverride, id }: { biz: SampleBusiness; post: RoadmapPost; ratio: CardRatio; nodna?: boolean; dnaOverride?: BrandDna; id: string }) {
  const dna = nodna ? null : dnaOverride ?? biz.dna;
  const brand = brandOf(biz);
  const ref = useRef<HTMLDivElement>(null);
  const [png, setPng] = useState("");
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<Check | null>(null);
  const size = cardSize("image", ratio);
  const { plan } = useCardPlan({ post, brand, dna, businessName: biz.name, size });
  const registry = useContext(RegistryContext);
  const label = OUTCOME_LABEL[plan.outcome] + (plan.fellBack ? " (לא היה מקום על התמונה)" : "");

  useEffect(() => {
    if (!registry) return;
    registry.set(id, async () => {
      if (!ref.current) return null;
      const data = await renderCardPng(ref.current, { width: size.w, height: size.h });
      return {
        name: id,
        png: data,
        meta: {
          business: biz.id,
          name: biz.name,
          source: biz.source || "sample",
          ratio,
          mode: plan.mode,
          composition: plan.composition,
          outcome: plan.outcome,
          fell_back: plan.fellBack,
          headline: post.overlay_headline || "",
          sub: post.overlay_sub || "",
          price: post.price ?? null,
          direction: dna?.direction ?? null,
          check: ref.current ? checkCard(ref.current) : null,
        },
      };
    });
    return () => {
      registry.delete(id);
    };
  });

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(async () => {
      await document.fonts?.ready;
      if (cancelled || !ref.current) return;
      const c = checkCard(ref.current);
      window.__dnaQa = { ...(window.__dnaQa || {}), [id]: c };
      setCheck(c);
    }, 1800);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [id, plan.outcome, plan.text?.headline.size]);

  async function onExport() {
    if (!ref.current) return;
    setBusy(true);
    try {
      setPng(await renderCardPng(ref.current, { width: size.w, height: size.h }));
    } finally {
      setBusy(false);
    }
  }
  return (
    <figure className="m-0" data-qa-card={id}>
      <CardStage post={post} brand={brand} dna={dna} businessName={biz.name} ratio={ratio} rounded={false} />
      <figcaption className="mt-2 flex items-center justify-between gap-3 text-[12px] text-[var(--ink-muted)]">
        <span>{label}</span>
        <button type="button" data-qa-export onClick={() => void onExport()} disabled={busy} className="font-semibold text-[var(--primary)] disabled:opacity-40">
          {busy ? "…" : "PNG"}
        </button>
      </figcaption>
      {check?.issues.length ? (
        <p data-qa-issue className="mt-1 text-[12px] font-semibold text-[var(--danger)]">
          {check.issues.join(" · ")}
        </p>
      ) : null}
      {png ? (
        // eslint-disable-next-line @next/next/no-img-element -- a generated data URL
        <img data-qa-png src={png} alt="" className="mt-2 w-full" />
      ) : null}
      <div aria-hidden style={{ position: "fixed", top: 0, left: 0, width: 0, height: 0, overflow: "hidden", opacity: 0, pointerEvents: "none" }}>
        <CardCanvas post={post} brand={brand} dna={dna} businessName={biz.name} size={size} canvasRef={ref} />
      </div>
    </figure>
  );
}

function Brief({ biz, dna }: { biz: SampleBusiness; dna: BrandDna }) {
  const d = resolveDna(dna).direction;
  const rows = [
    { label: "המקום", text: d.world },
    { label: "התמונות", text: d.photo },
    { label: "הטקסט", text: d.text },
    { label: "מה לא נעשה", text: d.never.join(" · ") },
  ].filter((r) => r.text);
  const sources = dna.colors_source || {};
  const bases = dna.colors_base || {};
  const SOURCE_HE: Record<string, string> = { logo: "לוגו", site: "אתר", derived: "נגזר", owner: "בעלים" };
  // QA only: what the motif echoes in the brand, in the server's words.
  const motifNote = (dna.motif?.note_he || "").trim();
  return (
    <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
      <div>
        {d.feel ? <p className="text-[16px] font-semibold leading-7 text-[var(--ink)]">{d.feel}</p> : null}
        {rows.length ? (
          <dl className="mt-1 grid gap-0.5 text-[13px] leading-6">
            {rows.map((r) => (
              <div key={r.label} className="flex gap-2">
                <dt className="w-[72px] shrink-0 font-semibold text-[var(--ink-muted)]">{r.label}</dt>
                <dd className="m-0 text-[var(--ink-soft)]">{r.text}</dd>
              </div>
            ))}
            {motifNote ? (
              <div className="flex gap-2">
                <dt className="w-[72px] shrink-0 font-semibold text-[var(--ink-muted)]">הפרט החוזר</dt>
                <dd className="m-0 text-[var(--ink-soft)]">{motifNote}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
        {biz.testWords ? <p className="mt-1 text-[12px] font-semibold text-[var(--ink-muted)]">בקובץ אין פוסטים ותמונות: התמונה והמילים כאן שלנו, לבדיקה.</p> : null}
      </div>
      <ul className="m-0 flex list-none flex-wrap items-start gap-2 p-0" aria-label={`הצבעים של ${biz.name}`}>
        {COLOR_ROLES.map((role: ColorRole) => {
          const hex = (dna.colors as Record<string, string | undefined>)[role];
          if (!hex) return null;
          const src = (sources as Record<string, string | undefined>)[role];
          const base = (bases as Record<string, string | undefined>)[role];
          return (
            <li key={role} className="flex flex-col items-center gap-1 text-[11px] text-[var(--ink-muted)]" title={`${COLOR_ROLE_LABEL[role]} ${hex}${src ? ` · ${SOURCE_HE[src] ?? src}` : ""}${base ? ` · מ-${base}` : ""}`}>
              <span className="relative h-7 w-7 rounded-full shadow-[var(--shadow-card)]" style={{ background: hex }}>
                {base ? <span className="absolute -bottom-0.5 -left-0.5 h-3 w-3 rounded-full ring-2 ring-[var(--canvas)]" style={{ background: base }} /> : null}
              </span>
              {src ? SOURCE_HE[src] ?? src : ""}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Grid({ fixtures, fixtureErrors }: { fixtures: SampleBusiness[]; fixtureErrors: { file: string; message: string }[] }) {
  const params = useSearchParams();
  const ratioParam = params.get("ratio");
  const ratio: CardRatio = ratioParam === "1:1" || ratioParam === "9:16" ? ratioParam : "4:5";
  const only = params.get("only");
  const all = params.get("all") === "1";
  // Old posts of a business with no DNA yet: no `design`, an old `overlay_theme`.
  const nodna = params.get("nodna") === "1";
  const v1 = params.get("v1") === "1";
  const [registry] = useState<Registry>(() => new Map());
  const [exporting, setExporting] = useState<{ done: number; total: number; dir: string; failed: number } | null>(null);
  const LEGACY = ["lower_editorial", "split_panel", "framed_inset"] as const;
  const list = [...fixtures, ...SAMPLE_BUSINESSES].filter((b) => !only || only.split(",").includes(b.id));

  async function exportAll() {
    const jobs = [...registry.entries()];
    setExporting({ done: 0, total: jobs.length, dir: "", failed: 0 });
    let dir = "";
    let failed = 0;
    for (let i = 0; i < jobs.length; i += 1) {
      try {
        const out = await jobs[i][1]();
        if (out) {
          const res = await fetch("/dev/dna/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...out, ratio: ratio.replace(":", "x") }) });
          const json = (await res.json()) as { dir?: string; ok?: boolean };
          if (json.ok && json.dir) dir = json.dir;
          else failed += 1;
        }
      } catch {
        failed += 1;
      }
      setExporting({ done: i + 1, total: jobs.length, dir: "", failed });
    }
    setExporting({ done: jobs.length, total: jobs.length, dir, failed });
  }

  return (
    <RegistryContext.Provider value={registry}>
      <main dir="rtl" className="mx-auto max-w-[1500px] px-6 py-8">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight text-[var(--ink)]">Design DNA · בדיקה חזותית</h1>
            <p className="mt-1 text-[13px] text-[var(--ink-muted)]">
              {list.length} עסקים, {ratio}. {fixtures.length ? `${fixtures.length} אמיתיים מהקבצים, ` : ""}שלוש מאפיות עם אותה תמונה בדיוק. עמוד פנימי, לא מקושר.
            </p>
            {fixtureErrors.map((e) => (
              <p key={e.file} className="mt-1 text-[12px] text-[var(--danger)]">
                לא הצלחנו לקרוא את {e.file}: {e.message}
              </p>
            ))}
          </div>
          <div className="text-left">
            <button type="button" data-qa-export-all onClick={() => void exportAll()} disabled={Boolean(exporting && exporting.done < exporting.total)} className="h-11 rounded-xl border border-[var(--rule-dark)] bg-[var(--paper)] px-4 text-[14px] font-semibold text-[var(--ink)] disabled:opacity-50">
              {exporting && exporting.done < exporting.total ? `מייצאים ${exporting.done}/${exporting.total}…` : "לייצא את כל הכרטיסים"}
            </button>
            {exporting && exporting.done === exporting.total && exporting.total ? (
              <p data-qa-export-done={exporting.dir} className="mt-1 text-[12px] text-[var(--ink-muted)]" dir="ltr">
                {exporting.total - exporting.failed} PNG → {exporting.dir || "?"}
                {exporting.failed ? ` (${exporting.failed} failed)` : ""}
              </p>
            ) : null}
          </div>
        </header>
        <div className="space-y-14">
          {v1 ? (
            <section data-qa-business="v1">
              <div className="mb-2 flex flex-wrap items-baseline gap-x-4">
                <h2 className="text-[17px] font-bold text-[var(--ink)]">לחם תום · DNA ופוסטים מגרסה 1</h2>
                <span className="text-[13px] text-[var(--ink-muted)]">בלי כיוון במילים, בלי מקום ריק בתמונה</span>
              </div>
              <p className="mb-4 text-[14px] text-[var(--ink-soft)]">{V1_DNA.rationale_he}</p>
              <div className={`grid gap-5 ${ratio === "9:16" ? "max-w-[900px] grid-cols-3" : "grid-cols-3"}`}>
                {V1_POSTS.map((p, i) => (
                  <QaCard key={i} id={`v1-${i + 1}`} biz={SAMPLE_BUSINESSES[0]} dnaOverride={V1_DNA} ratio={ratio} post={{ ...basePost(`v1-${i}`), image_url: SAMPLE_BUSINESSES[0].photo, has_overlay: true, ...p } as RoadmapPost} />
                ))}
              </div>
            </section>
          ) : null}
          {list.map((biz) => {
            const posts: RoadmapPost[] = biz.realPosts?.length
              ? biz.realPosts.slice(0, all ? 12 : 3)
              : (all ? allDesigns(biz) : biz.posts).map((sp, i) => postFor(biz, sp, i));
            return (
              <section key={biz.id} data-qa-business={biz.id}>
                <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <h2 className="text-[17px] font-bold text-[var(--ink)]">{biz.name}</h2>
                  <span className="text-[13px] text-[var(--ink-muted)]">{biz.field_he}</span>
                  {biz.source ? <span className="rounded-full bg-[var(--sand)] px-2 text-[12px] font-semibold text-[var(--ink)]">עסק אמיתי · {biz.source}</span> : null}
                </div>
                <Brief biz={biz} dna={biz.dna} />
                <div className={`grid gap-5 ${all ? "grid-cols-4" : ratio === "9:16" ? "max-w-[900px] grid-cols-3" : "grid-cols-3"}`}>
                  {posts.map((post, i) => (
                    <QaCard
                      key={`${biz.id}-${i}`}
                      id={`${biz.id}-${i + 1}`}
                      biz={biz}
                      ratio={ratio}
                      nodna={nodna}
                      post={nodna ? { ...post, design: undefined, overlay_theme: LEGACY[i % LEGACY.length] } : post}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </RegistryContext.Provider>
  );
}

export function DnaQa({ fixtures = [], fixtureErrors = [] }: { fixtures?: SampleBusiness[]; fixtureErrors?: { file: string; message: string }[] }) {
  return (
    <Suspense fallback={null}>
      <Grid fixtures={fixtures} fixtureErrors={fixtureErrors} />
    </Suspense>
  );
}
