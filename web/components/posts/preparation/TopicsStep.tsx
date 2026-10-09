"use client";

import { Copy, useCopy } from "@/components/language/LanguageProvider";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LoadingMark } from "@/components/Doodles";
import { SectionHeader } from "@/components/SectionHeader";
import { StepLink } from "@/components/trial/StepLink";
import { ApiError } from "@/lib/api";
import ui from "@/components/posts/chrome.module.css";
import { IconArrowLeft, IconChevron, IconPlus, IconTrash } from "@/lib/icons";
import { foundations, type FeaturedItem, type FeaturedPayload, type FeaturedKind, type FeaturedRecommendation, type FeaturedReason } from "@/lib/trial";
import { toast } from "@/lib/ui";

export function TopicsStep({ embedded = false, onNext, onPendingChange }: { embedded?: boolean; onNext?: () => void; onPendingChange?: (pending: boolean) => void }) {
  const t = useCopy();
  const [data, setData] = useState<FeaturedPayload | null>(null);
  const [items, setItems] = useState<FeaturedItem[]>([]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [showRecommendations, setShowRecommendations] = useState(false);
  useEffect(() => {
    foundations.featured().then(payload => { setData(payload); setItems(payload.items); }).catch((err: unknown) => {
      if (err instanceof ApiError && err.status === 401) return;
      setError(err instanceof Error ? err.message : "לא הצלחנו לטעון את הרשימה.");
    });
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => { onPendingChange?.(!data || dirty || saving || Boolean(draft.trim())); }, [data, dirty, saving, draft, onPendingChange]);
  function change(next: FeaturedItem[]) { setItems(next); setDirty(true); }
  function edit(index: number, fields: Partial<FeaturedItem>) { change(items.map((item, i) => i === index ? { ...item, ...fields } : item)); }
  function add(name: string, recommendation?: FeaturedRecommendation) {
    const clean = name.replace(/\s+/g, " ").trim();
    if (!clean || !data || items.length >= data.max || items.some(item => item.name === clean)) return;
    change([...items, { id: crypto.randomUUID(), name: clean, reason: null, note: "", kind: recommendation?.kind ?? (data.business_model === "services" ? "service" : ["both", "saas"].includes(data.business_model) ? "offering" : "product") }]);
    setDraft("");
    setShowRecommendations(false);
  }
  function move(index: number, by: -1 | 1) {
    const target = index + by;
    if (target < 0 || target >= items.length) return;
    const next = [...items]; [next[index], next[target]] = [next[target], next[index]]; change(next);
  }
  const missingExample = items.some(item => ["work", "story"].includes(item.kind || "") && (item.note || "").trim().length < 5);
  const invalid = items.some(item => !item.name.trim()) || new Set(items.map(item => item.name.replace(/\s+/g, " ").trim())).size !== items.length;
  async function save() {
    setSaving(true); setError("");
    try {
      const payload = await foundations.saveFeatured(items); setData(payload); setItems(payload.items); setDirty(false); toast(t("הרשימה נשמרה")); if (embedded && payload.items.length >= payload.min) onNext?.();
    } catch (err) { setError(err instanceof Error && err.message ? err.message : t("לא הצלחנו לשמור. נסו שוב.")); }
    finally { setSaving(false); }
  }
  const full = Boolean(data && items.length >= data.max);
  const enough = Boolean(data && items.length >= data.min);
  const service = data?.business_model !== "products";
  const recommendations = data?.recommendations.filter(rec => !items.some(item => item.name === rec.name)) ?? [];
  return <><div className="mx-auto max-w-[760px]">
    <SectionHeader level={embedded ? 2 : 1} eyebrow={embedded ? null : undefined} section="business" title={t("מה להבליט בפוסטים")} subtitle={data?.business_model === "saas" ? t("הבעיה שהמוצר פותר, הדגמה אמיתית או ידע שלכם. בחרו נושא אחד להתחלה.") : data?.business_model === "services" ? t("שירותים, עבודות שלכם וטיפים מקצועיים. בחרו נושא אחד להתחלה.") : t("מציעים נקודת פתיחה לפי העסק והתוכנית. אתם בוחרים מה מתאים.")} />
    {!data ? error ? <p role="alert" className={ui.error}>{error}</p> : <LoadingMark label={t("טוענים הצעות…")} /> : <>
      {!full && recommendations.length > 0 && items.length > 0 ? <button type="button" onClick={() => setShowRecommendations(value => !value)} aria-expanded={showRecommendations} className={`${ui.link} mb-5 min-h-11`}>{showRecommendations ? t("לסגור את ההצעות") : t("להוסיף מההצעות ({arg_0})", { arg_0: recommendations.length })} <IconChevron className={showRecommendations ? "rotate-90" : "-rotate-90"} /></button> : null}
      {!full && recommendations.length > 0 && (!items.length || showRecommendations) ? <section aria-label={t("ההצעות שלנו")} className="mb-8">
        <h2 className="mb-3 text-[18px] font-bold"><Copy text="מציעים להתחיל כאן" /></h2>
        <ul className={`${ui.card} divide-y divide-[var(--rule)] overflow-hidden`}>
          {recommendations.map(rec => <li key={rec.name} className="flex items-center gap-4 px-4 py-4 sm:px-5">
            <div className="min-w-0 flex-1"><h3 className="text-[15px] font-semibold">{rec.name}</h3>
              <p className="mt-1 text-[13px] leading-6 text-[color:var(--ink-soft)]">{rec.why_he}</p>
              <span className="text-[12px] text-[color:var(--ink-muted)]">{rec.source_he}</span>
            </div>
            <button type="button" onClick={() => add(rec.name, rec)} aria-label={t("להוסיף את {arg_0}", { arg_0: rec.name })} className={`${ui.link} min-h-11 shrink-0`}><IconPlus /> <Copy text="להוסיף" /></button>
          </li>)}
        </ul>
      </section> : null}
      <section aria-label={t("הרשימה שלכם")}>
        <h2 className="mb-3 text-[18px] font-bold"><Copy text="הרשימה שלכם" /></h2>
        {items.length ? <ol className={`${ui.card} divide-y divide-[var(--rule)] overflow-hidden`}>
          {items.map((item, index) => <li key={item.id || `saved-${index}`} className="px-4 py-4 sm:px-5">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold tabular-nums text-[color:var(--ink-muted)]">{index + 1}</span>
              <input aria-label={t("שם הנושא {arg_0}", { arg_0: index + 1 })} maxLength={80} value={item.name} onChange={e => edit(index, { name: e.target.value })} className="min-h-11 min-w-0 flex-1 rounded-md bg-transparent px-2 text-[15px] font-semibold focus:bg-[var(--soft)] focus:outline-[var(--primary)]" />
              <div className="-me-2 flex shrink-0">
                <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={t("להעלות את {arg_0}", { arg_0: item.name })} title={t("למעלה")} className={ui.iconButton}><IconChevron className="rotate-90" /></button>
                <button type="button" onClick={() => move(index, 1)} disabled={index === items.length - 1} aria-label={t("להוריד את {arg_0}", { arg_0: item.name })} title={t("למטה")} className={ui.iconButton}><IconChevron className="-rotate-90" /></button>
                <button type="button" onClick={() => change(items.filter((_, i) => i !== index))} aria-label={t("להסיר את {arg_0}", { arg_0: item.name })} title={t("להסיר")} className={ui.iconButton}><IconTrash /></button>
              </div>
            </div>
            {service ? <label className="mt-2 flex items-center gap-3 text-[13px] text-[color:var(--ink-muted)]"><Copy text="סוג הנושא" /><select aria-label={t("סוג הנושא {arg_0}", { arg_0: index + 1 })} value={item.kind || "offering"} onChange={e => edit(index, { kind: e.target.value as FeaturedKind })} className={`${ui.field} min-w-0 flex-1`}>
                {data.business_model === "both" ? <option value="offering"><Copy text="מוצר או שירות" /></option> : null}
                {data.kinds.map(kind => <option key={kind.key} value={kind.key}>{t(kind.label_he)}</option>)}
              </select>
            </label> : null}
            {["work", "story"].includes(item.kind || "") ? <div className="mt-3">
              <label htmlFor={`example-${index}`} className="text-[13px] font-medium"><Copy text="איזו עבודה או איזה מקרה תרצו להציג?" /></label>
              <textarea id={`example-${index}`} value={item.note || ""} maxLength={160} minLength={5} onChange={e => edit(index, { note: e.target.value })} placeholder={t("מה עשיתם, ואיזה פרט אפשר לספר? בלי שם או פרטים מזהים של הלקוח.")} className={`${ui.field} mt-2 min-h-24 w-full resize-y`} />
            </div> : <details className="mt-2 text-[13px] text-[color:var(--ink-muted)]">
              <summary className="min-h-11 cursor-pointer py-3"><Copy text="פרטים שכדאי לדעת, אם יש" /></summary>
              <label className="block"><Copy text="מה חשוב לכם להבליט?" /><input aria-label={t("פרטים על {arg_0}", { arg_0: item.name })} value={item.note || ""} maxLength={160} onChange={e => edit(index, { note: e.target.value })} className={`${ui.field} mt-2 w-full`} />
              </label>
              {data.reasons.length ? <label className="mt-3 block"><Copy text="סיבה לבחירה, אם ידועה" /><select aria-label={t("סיבה לבחירת {arg_0}", { arg_0: item.name })} value={item.reason || ""} onChange={e => edit(index, { reason: (e.target.value || null) as FeaturedReason | null })} className={`${ui.field} mt-2 w-full`}>
                  <option value=""><Copy text="לא בטוחים / לא צריך" /></option>{data.reasons.map(reason => <option key={reason.key} value={reason.key}>{t(reason.label_he)}</option>)}
                </select>
              </label> : null}
            </details>}
          </li>)}
        </ol> : <p className="text-[15px] leading-7 text-[color:var(--ink-soft)]">{recommendations.length ? t("בחרו מההצעות או הוסיפו נושא משלכם.") : data.business_model === "saas" ? t("תארו יכולת אמיתית של המוצר או בעיה שהוא פותר. משם נתחיל.") : service ? t("תארו שירות שאתם נותנים, עבודה שעשיתם או שאלה שלקוחות שואלים. משם נתחיל.") : t("עוד אין מספיק מידע להציע מוצרים. כתבו מוצר אמיתי שתרצו להבליט.")}</p>}
      </section>
      {!full ? <form onSubmit={e => { e.preventDefault(); add(draft); }} className="mt-5 flex gap-2">
        <label htmlFor="featured-new" className="sr-only"><Copy text="נושא להוסיף" /></label>
        <input id="featured-new" value={draft} maxLength={80} onChange={e => setDraft(e.target.value)} placeholder={data.business_model === "saas" ? t("הדגמת המוצר או טיפ לפתרון הבעיה") : service ? t("שירות, עבודה שלכם או טיפ מקצועי") : t("מוצר נוסף מהעסק שלכם")} className={`${ui.field} min-w-0 flex-1`} />
        <button type="submit" disabled={!draft.trim()} className={`${ui.button} ${ui.matchField} shrink-0`}><IconPlus /> <Copy text="להוסיף" /></button>
      </form> : null}
      {error ? <p role="alert" className={`${ui.error} mt-5`}>{error}</p> : null}
      {missingExample ? <p role="status" className={`${ui.help} mt-4`}><Copy text="לפני השמירה, תארו דוגמה אמיתית לעבודה או לסיפור הלקוח שבחרתם." /></p> : null}
      {invalid ? <p role="alert" className={`${ui.error} mt-4`}><Copy text="לכל נושא צריך שם שונה ולא ריק." /></p> : null}
      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2">
        <button type="button" onClick={() => { if (embedded && !dirty && enough) onNext?.(); else void save(); }} disabled={saving || (!dirty && !embedded) || (embedded && (!enough || Boolean(draft.trim()))) || invalid || missingExample} className="drawn-button inline-flex min-h-12 w-full items-center justify-center bg-[var(--primary)] px-6 text-[15px] text-white enabled:hover:bg-[var(--primary-dark)] sm:w-auto">{saving ? t("שומרים…") : embedded ? t("לתמונות שמתאימות לנושאים") : t("לשמור את הרשימה")}</button>
        {!embedded && !dirty && enough ? <Link href="/dashboard" className={ui.link}><Copy text="לצעד הבא" /><IconArrowLeft data-forward="" /></Link> : null}
      </div>
      <p className={`${ui.help} mt-3`}>{enough ? t("הסדר קובע מאיפה מתחילים. אפשר לשנות בהמשך.") : data.min > 1 ? t("צריך לפחות {arg_0} נושאים. אפשר לשמור ולהשלים אחר כך.", { arg_0: data.min }) : t("מספיק נושא אחד להתחלה.")}</p>
      {!embedded ? <StepLink stepKey="featured" className="mt-2" /> : null}
    </>}
  </div></>;
}
