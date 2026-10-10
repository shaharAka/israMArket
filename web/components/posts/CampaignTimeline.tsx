"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CardStage, cardSize } from "@/components/CardCanvas";
import { CampaignBrief } from "./CampaignBrief";
import { postDay, postWeek, weekFocus } from "./postMeta";
import { LIFECYCLE_LABEL, lifecycleOf } from "@/lib/postLifecycle";
import { useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { billingEndpoints, type MediaAllowance } from "@/lib/billing";
import { campaignEndpoints, protectedPost, supportsLayout, type CampaignRevision, type RevisionKind, type VideoOptions } from "@/lib/campaign";
import { endpoints, type RoadmapPost, type StrategyPayload, type Asset } from "@/lib/api";
import { downloadCardPng, renderCardPng } from "@/lib/cardExport";
import { LOCALE_META } from "@/lib/i18n/locales";
import { CampaignVideoOverlay, CampaignVideoPreview } from "./CampaignVideo";
import styles from "./campaign.module.css";

const REVISION_LABEL: Record<RevisionKind, string> = { text: "הנוסח", layout: "קומפוזיציה אחרת", image: "התמונה", video: "סרטון חדש", video_edit: "שינוי בסרטון", finish: "סרטון שיש לכם" };

// תכלית: לראות איך הפוסטים מתחברים לתוכנית, ולבחור מה ליצור או לשפר.
// מסר: לכל פוסט תפקיד בסדרה. הפעולה הבאה: לבחור טיוטה ולבחון גרסה חדשה.
// המכסה מוצגת לפני יצירה. שינוי לא נכנס לתוכנית עד שבעל העסק שומר אותו.
export function CampaignTimeline() {
  const t = useCopy();
  const { locale } = useLanguage();
  const [strategy, setStrategy] = useState<StrategyPayload | null>(null);
  // The workspace response carries this account's approved identity. Avoid an
  // independent brand request or a cached identity left by another sign-in.
  const dna = strategy?.brand_dna || null;
  const [allowance, setAllowance] = useState<MediaAllowance | null>(null);
  const [history, setHistory] = useState<CampaignRevision[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [active, setActive] = useState("");
  const [instruction, setInstruction] = useState("");
  const [kind, setKind] = useState<RevisionKind>("text");
  const [revision, setRevision] = useState<CampaignRevision | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetId, setAssetId] = useState<number | undefined>();
  const [overlayHeadline, setOverlayHeadline] = useState("");
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState<number | undefined>();
  const overlay = useRef<HTMLDivElement>(null);
  const [panelVisible, setPanelVisible] = useState(false);
  const canvas = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  // Retain an id after an uncertain HTTP outcome: retrying joins the same request.
  const submission = useRef<{ key: string; id: string; options: VideoOptions } | null>(null);

  async function reload() {
    const [plan, limits, versions] = await Promise.all([
      endpoints.postsWorkspace(), billingEndpoints.mediaAllowance(), campaignEndpoints.history(),
    ]);
    setStrategy(plan); setAllowance(limits); setHistory(versions.revisions);
    const pending = versions.revisions.find(r => r.state === "working" || r.state === "ready" || r.state === "failed");
    if (pending) { setRevision(pending); setActive(pending.items[0]?.uid || ""); }
    setReady(true);
  }
  useEffect(() => { let live = true;
    Promise.all([endpoints.postsWorkspace(), billingEndpoints.mediaAllowance(), campaignEndpoints.history()])
      .then(([plan, limits, versions]) => {
        if (!live) return;
        setStrategy(plan); setAllowance(limits); setHistory(versions.revisions); setReady(true);
        const pending = versions.revisions.find(r => ["working", "ready", "failed"].includes(r.state));
        if (pending) { setRevision(pending); setActive(pending.items[0]?.uid || ""); }
      }).catch(() => { if (live) { setReady(true); setError("לא הצלחנו לפתוח את הפוסטים. נסו לטעון שוב."); } });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (revision?.state !== "working") return;
    let live = true;
    const timer = window.setInterval(() => {
      campaignEndpoints.get(revision.id).then(next => {
        if (!live) return;
        setRevision(next);
        if (next.state !== "working") {
          campaignEndpoints.history().then(res => { if (live) setHistory(res.revisions); }).catch(() => {});
          billingEndpoints.mediaAllowance().then(res => { if (live) setAllowance(res); }).catch(() => {});
        }
      }).catch(() => { if (live) setError("לא הצלחנו לבדוק את הגרסה. הפוסטים השמורים לא השתנו; נסו לטעון שוב."); });
    }, 2500);
    return () => { live = false; window.clearInterval(timer); };
  }, [revision?.id, revision?.state]);
  useEffect(() => {
    if (!panel.current) return;
    const observer = new IntersectionObserver(([entry]) => setPanelVisible(entry.isIntersecting), { threshold: 0.1 });
    observer.observe(panel.current);
    return () => observer.disconnect();
  }, [active, ready]);

  useEffect(() => { endpoints.assets().then(r => setAssets(r.assets.filter(a => a.kind === "video" && !a.url.endsWith(".svg")))).catch(() => {}); }, []);
  const posts = strategy?.roadmap?.posts || [];
  const currentIndex = posts.findIndex(p => p.uid === active);
  const current = posts[currentIndex];
  const item = revision?.items.find(i => i.uid === active);
  const proposed = item?.proposal;
  const displayed = proposed && !showOriginal && ["ready", "failed"].includes(revision?.state || "") ? proposed : current;
  const weeks = [...new Set(posts.map(postWeek))].sort((a,b) => a - b);
  const changing = busy || revision?.state === "working";
  const reviewing = revision?.state === "ready" || revision?.state === "failed";
  const videoKind = kind === "video" || kind === "video_edit" || kind === "finish";
  const layoutAvailable = Boolean(current && supportsLayout(current) && posts.filter(p => selected.includes(p.uid || "")).every(supportsLayout));
  // Keep the edited overlay mounted during PNG capture. Setting busy must not
  // replace it with the original headline while export waits for its fonts.
  const editingOverlay = kind === "finish" && !reviewing && selected.includes(active);
  const overlayPost = editingOverlay && displayed ? { ...displayed, overlay_headline: overlayHeadline, overlay_text: overlayHeadline, has_overlay: Boolean(overlayHeadline.trim()) } : displayed;
  const footage = editingOverlay ? assets.find(a => a.id === (assetId || current?.video_raw_asset_id))?.url : undefined;
  const mayCreate = (kind !== "layout" || layoutAvailable) && (!videoKind || selected.length === 1) && ((kind !== "finish" && kind !== "video_edit") || Boolean(assetId || current?.video_raw_asset_id || current?.video_asset_id)) && selected.length > 0 && !changing && !reviewing && (
    (kind === "layout" && layoutAvailable) || kind === "finish" || (kind === "text" ? Boolean(instruction.trim()) : kind === "image" ?
      Boolean(allowance?.images.generation_available && selected.length <= allowance.images.remaining) :
      Boolean(allowance?.videos.generation_available && allowance.videos.remaining > 0 && (kind !== "video_edit" || instruction.trim()))));
  function choose(post: RoadmapPost) {
    if (!post.uid) return;
    setActive(post.uid); setShowOriginal(false); setAssetId(undefined); setStart(0); setEnd(undefined); setOverlayHeadline(post.overlay_headline || post.overlay_text || "");
    if (protectedPost(post)) { requestAnimationFrame(() => panel.current?.scrollIntoView({ behavior: "smooth", block: "start" })); return; }
    if (reviewing || changing) return;
    if (!supportsLayout(post) && kind === "layout") setKind("text");
    setSelected(old => old.includes(post.uid!) ? old.filter(uid => uid !== post.uid) : old.length < 3 ? [...old, post.uid!] : old);
  }
  async function create() {
    setBusy(true); setError("");
    try {
      const key = JSON.stringify({ selected, kind, instruction, assetId, start, end, overlayHeadline });
      if (submission.current?.key !== key) {
        const options = videoKind ? { asset_id: assetId, start, end, ...(kind === "finish" ? { overlay_headline: overlayHeadline } : {}), overlay_png: overlay.current ? await renderCardPng(overlay.current, { width: 720, height: 1280 }) : "" } : {};
        submission.current = { key, id: crypto.randomUUID().replaceAll("-", ""), options };
      }
      const next = await campaignEndpoints.create(selected, kind, instruction, submission.current.id, submission.current.options);
      setRevision(next); setActive(selected[0]); setShowOriginal(false);
      setHistory(old => [next, ...old.filter(r => r.id !== next.id)]);
      billingEndpoints.mediaAllowance().then(setAllowance).catch(() => {});
    } catch (e) { setError(e instanceof Error ? e.message : "לא הצלחנו להכין את הגרסה. נסו שוב."); }
    finally { setBusy(false); }
  }
  async function decide(row: CampaignRevision, action: "keep" | "undo" | "discard") {
    setBusy(true); setError("");
    try {
      const result = await campaignEndpoints.choose(row.id, action);
      if (result.strategy) setStrategy(result.strategy);
      endpoints.assets().then(r => setAssets(r.assets.filter(a => a.kind === "video" && !a.url.endsWith(".svg")))).catch(() => {});
      setHistory(old => old.map(r => r.id === row.id ? result.revision : r));
      setRevision(null); setSelected([]); setShowOriginal(false); submission.current = null;
    } catch (e) { setError(e instanceof Error ? e.message : "לא הצלחנו לשמור. נסו שוב."); }
    finally { setBusy(false); }
  }
  const dateLabel = (post: RoadmapPost) => {
    const day = postDay(post);
    if (!day) return post.date_hint?.trim() || t("מועד לבחירה");
    return new Date(`${day}T12:00:00`).toLocaleDateString(LOCALE_META[locale].formatLocale, { day: "numeric", month: "short" });
  };
  async function download() {
    if (!displayed) return;
    if (displayed.video_url) {
      setBusy(true); setError("");
      try {
        const response = await fetch(displayed.video_url, { credentials: "include" });
        if (!response.ok) throw new Error();
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement("a"); link.href = url; link.download = "campaign-reel.mp4"; link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch { setError("לא הצלחנו להוריד את הסרטון. נסו שוב."); }
      finally { setBusy(false); }
      return;
    }
    if (!canvas.current) { setError("לא הצלחנו להוריד את הפוסט. נסו שוב."); return; }
    setBusy(true); setError("");
    const { w, h } = cardSize(displayed.format);
    const result = await downloadCardPng(canvas.current, { width: w, height: h, title: displayed.title });
    if (!result.ok) setError(result.error);
    setBusy(false);
  }
  return <div className={styles.workspace}>
    <header className={styles.heading}>
      <div><Link href="/posts" className={styles.textAction}>{t("כל הפוסטים")}</Link>
        <h1>{t("הקמפיין שלכם")}</h1>
        <p>{strategy?.business_name}</p>
      </div>
      {allowance ? <div className={styles.balance} aria-label={t("המכסה שנותרה")}>
        <span>{t("{arg_0} תמונות", { arg_0: allowance.images.remaining })}</span>
        <span>{t("{arg_0} סרטונים", { arg_0: allowance.videos.remaining })}</span>
        {allowance.resets_at ? <span>{t("מתחדש ב־{arg_0}", { arg_0: new Date(allowance.resets_at).toLocaleDateString(LOCALE_META[locale].formatLocale, { day: "numeric", month: "short" }) })}</span> : null}
        <Link href="/assets">{t("התמונות והסרטונים שלכם")}</Link>
      </div> : null}
    </header>
    {error ? <div className={styles.error} role="alert">{t(error)} <button onClick={() => void reload().catch(() => setError("לא הצלחנו לפתוח את הפוסטים. נסו לטעון שוב."))}>{t("לטעון שוב")}</button></div> : null}
    {!ready ? <p aria-live="polite">{t("פותחים את הקמפיין…")}</p> : null}
    {ready && !posts.length && !error ? <div className={styles.empty}><p>{t("הפוסטים שתכינו יופיעו כאן לפי השבוע שלהם.")}</p><Link href="/posts?create=1">{t("ליצור פוסט משלכם")}</Link></div> : null}
    {posts.length ? <>
      <p className={styles.intro}>{t("בחרו עד 3 טיוטות כדי להכין להן גרסה חדשה.")}</p>
      <div className={styles.timeline}>
        {weeks.map(week => <section className={styles.week} key={week} aria-label={week ? t("שבוע {arg_0}", { arg_0: week }) : t("פוסטים ללא שבוע בתוכנית")}>
          <header className={styles.weekHeading}><span className={styles.marker} aria-hidden="true" />
            <h2>{week ? t("שבוע {arg_0}", { arg_0: week }) : t("פוסטים נוספים")}</h2>
            <p dir="auto">{weekFocus(week, posts.find(p => postWeek(p) === week), strategy)}</p>
          </header>
          <div className={styles.cards}>
            {posts.map((post, index) => ({ post, index })).filter(({ post }) => postWeek(post) === week)
              .sort((a, b) => (postDay(a.post) || "9999").localeCompare(postDay(b.post) || "9999"))
              .map(({ post, index }) => <article key={post.uid || index} className={styles.card} data-active={selected.includes(post.uid || "")}>
              <button type="button" aria-pressed={selected.includes(post.uid || "")} disabled={!protectedPost(post) && !selected.includes(post.uid || "") && selected.length >= 3 && !reviewing} className={styles.select} onClick={() => choose(post)}>
                <span className={styles.thumbnail} data-vertical={post.format === "reel" || post.format === "story"}>
                  {post.video_url ? <video src={post.video_url} muted playsInline preload="metadata" aria-label={post.title} /> : <CardStage post={post} brand={strategy?.brand_language} dna={dna} businessName={strategy?.business_name || ""} quietPlaceholder photoSizes="240px" />}
                </span>
                <span className={styles.cardBody}><span className={styles.date}>{dateLabel(post)} · {t(LIFECYCLE_LABEL[lifecycleOf(post)])}</span>
                  <strong dir="auto">{post.title}</strong>
                  {post.plan_link?.goal || post.goal_fit ? <span dir="auto">{post.plan_link?.goal || post.goal_fit}</span> : null}
                  <span dir="auto">{post.cta || post.goal_fit}</span>
                  <span className={styles.selected}>{selected.includes(post.uid || "") ? t("נבחר") : protectedPost(post) ? t("לצפות בפוסט") : t("לבחור")}</span>
                </span>
              </button>
              <Link href={`/posts?post=${index}`} className={styles.cardLink}>{t("לפתוח בעורך")}</Link>
            </article>)}
          </div>
        </section>)}
      </div>
      {selected.length > 0 && !panelVisible && !reviewing && !changing ? <div className={styles.selectionBar}>
        <span>{t("{arg_0} מתוך 3 פוסטים נבחרו", { arg_0: selected.length })}</span>
        <button className={styles.primary} onClick={() => { setActive(selected[0]); panel.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>{t("לעבוד על הפוסטים שבחרתם")}</button>
      </div> : null}
      {displayed ? <section ref={panel} className={styles.studio} aria-label={t("הגרסה החדשה")}>
        <div className={styles.previewColumn}>
          <div className={styles.preview}>{footage && overlayPost ? <CampaignVideoPreview url={footage} post={overlayPost} dna={dna} brand={strategy?.brand_language || undefined} businessName={strategy?.business_name || ""} /> : displayed.video_url ? <video src={displayed.video_url} controls playsInline preload="metadata" aria-label={displayed.title} /> : <CardStage post={displayed} brand={strategy?.brand_language} dna={dna} businessName={strategy?.business_name || ""} canvasRef={canvas} photoSizes="400px" />}</div>
          <div className={styles.exportOverlay} aria-hidden="true"><CampaignVideoOverlay ref={overlay} post={overlayPost || displayed} dna={dna} brand={strategy?.brand_language || undefined} businessName={strategy?.business_name || ""} /></div>
          {proposed && reviewing ? <div className={styles.compare}><button aria-pressed={!showOriginal} onClick={() => setShowOriginal(false)}>{t("הגרסה החדשה")}</button><button aria-pressed={showOriginal} onClick={() => setShowOriginal(true)}>{t("הגרסה הקודמת")}</button></div> : null}
          <p className={styles.caption} dir="auto">{displayed.caption}</p>
          <button disabled={busy} onClick={() => void download()} className={styles.textAction}>{t("להוריד את הפוסט")}</button>
        </div>
        <div className={styles.controls}>
          <CampaignBrief post={current} audience={current.audience_name || ""} dna={dna} />
          {changing ? <p role="status">{t("מכינים את הגרסה החדשה…")}</p> : reviewing && revision ? <div className={styles.decision}>
            <h2>{t("איך נראית הגרסה החדשה?")}</h2>
            <p>{t("עברו על הפוסטים שבחרתם לפני השמירה.")}</p>
            {revision.items.map(i => <button key={i.uid} aria-pressed={active === i.uid} onClick={() => { setActive(i.uid); setShowOriginal(false); }}>{i.original.title}{i.error ? ` · ${t(i.error)}` : ""}</button>)}
            {revision.state === "failed" ? <p role="alert">{t(revision.error || "לא כל הגרסאות הושלמו. הפוסטים הקודמים נשארו שמורים.")}</p> : null}
            {revision.items.some(i => i.state === "ready") ? <button disabled={busy} className={styles.primary} onClick={() => void decide(revision, "keep")}>{t(revision.state === "ready" ? "לשמור את הגרסה החדשה" : "לשמור רק את הגרסאות שהושלמו")}</button> : null}
            <button disabled={busy} className={styles.textAction} onClick={() => void decide(revision, "discard")}>{t("להשאיר את הגרסה הקודמת")}</button>
          </div> : protectedPost(current) ? <Link href={`/posts?post=${currentIndex}`} className={styles.textAction}>{t("לצפות בפוסט שאושר")}</Link> : <form className={styles.form} onSubmit={e => { e.preventDefault(); if (mayCreate) void create(); }}>
            <h2>{t("מה תרצו לשנות?")}</h2>
            <div className={styles.choices}>
              {([ ["text", "הנוסח"], ...(layoutAvailable ? [["layout", "העיצוב"] as const] : []), ["image", "התמונה"], ["video", "סרטון חדש"], ["finish", "סרטון שיש לכם"], ...(current.video_url ? [["video_edit", "שינוי בסרטון"] as const] : []) ] as const).map(([value,label]) => <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)}>{t(label)}</button>)}
            </div>
            {videoKind && selected.length > 1 ? <p>{t("כדי להכין סרטון, בחרו פוסט אחד.")}</p> : null}
            {kind === "finish" || kind === "video_edit" ? <div className={styles.videoOptions}>
              <label htmlFor="campaign-video">{t("בחירת סרטון")}</label><select id="campaign-video" value={assetId || ""} onChange={e => setAssetId(Number(e.target.value) || undefined)}>
                <option value="">{t(current.video_asset_id ? "הסרטון של הפוסט" : "לבחור סרטון מהספרייה")}</option>
                {assets.map(a => <option key={a.id} value={a.id}>{a.description || t("סרטון {arg_0}", { arg_0: a.id })}</option>)}
              </select>
              {kind === "finish" ? <><label htmlFor="campaign-overlay">{t("הכיתוב על הסרטון")}</label><input id="campaign-overlay" value={overlayHeadline} onChange={e => setOverlayHeadline(e.target.value)} maxLength={90} placeholder={t("אפשר להשאיר בלי כיתוב")} /></> : null}
              <div className={styles.trim}><label>{t("התחלה בשניות")}<input type="number" min={0} max={180} step={0.5} value={start} onChange={e => setStart(Number(e.target.value))} /></label>
              <label>{t("סיום בשניות")}<input type="number" min={0.5} max={180} step={0.5} value={end ?? ""} placeholder={kind === "video_edit" ? "5" : "30"} onChange={e => setEnd(e.target.value ? Number(e.target.value) : undefined)} /></label></div>
              <Link href="/assets" className={styles.textAction}>{t("להעלות סרטון משלכם")}</Link>
            </div> : null}
            {kind !== "layout" && kind !== "finish" ? <><label htmlFor="campaign-instruction">{t("כתבו לנו במילים שלכם")}</label><textarea id="campaign-instruction" value={instruction} onChange={e => setInstruction(e.target.value)} maxLength={200} placeholder={t("למשל, פחות רשמי ולשים את המוצר במרכז")} />
            {kind === "text" ? <div className={styles.suggestions}>{["קצר יותר", "יותר חם", "עם שאלה ללקוחות"].map(label => <button key={label} type="button" onClick={() => setInstruction(label)}>{t(label)}</button>)}</div> : null}</> : kind === "layout" ? <p>{t("ננסה קומפוזיציה אחרת בסגנון של העסק, עם אותה תמונה.")}</p> : null}
            <p className={styles.quote}>{kind === "finish" ? t("חיתוך הסרטון והוספת הכיתוב בסגנון שלכם לא משתמשים במכסת היצירה.") : kind === "video" || kind === "video_edit" ? t("סרטון אחד מהמכסה · קטע של עד 5 שניות") : kind === "image" ? t("עד {arg_0} תמונות מהמכסה ל־{arg_1} פוסטים", { arg_0: selected.length, arg_1: selected.length }) : t("השינוי הזה לא משתמש במכסת התמונות והסרטונים.")}</p>
            <button type="submit" className={styles.primary} disabled={!mayCreate}>{t("להכין גרסה חדשה")}</button>
            {(kind === "video" || kind === "video_edit") && !allowance?.videos.generation_available ? <button type="button" className={styles.textAction} onClick={() => setKind("finish")}>{t("להשתמש בסרטון שכבר יש לכם")}</button> : null}
            {kind === "image" && !allowance?.images.generation_available ? <Link href="/assets" className={styles.textAction}>{t("לבחור תמונה שכבר יש לכם")}</Link> : null}
          </form>}
          {history.some(r => r.state === "kept") ? <div className={styles.history}><h2>{t("גרסאות ששמרתם")}</h2>{history.filter(r => r.state === "kept").map(r => <div key={r.id}><span dir="auto">{r.instruction || t(REVISION_LABEL[r.kind])}</span><button disabled={busy || changing || reviewing} onClick={() => void decide(r, "undo")}>{t("לחזור לגרסה הקודמת")}</button></div>)}</div> : null}
        </div>
      </section> : null}
    </> : null}
  </div>;
}
