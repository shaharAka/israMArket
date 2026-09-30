"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BrandMark } from "@/lib/icons";
import { PalettePicker } from "@/components/design/PalettePicker";
import { paletteVariables, useDesignPalette } from "@/components/design/palette";
import { MotionButton, MotionChoice, MotionDisclosure, MotionIllustration, MotionProgress, MotionResult, MotionScope } from "./Motion";
import { motionAssets, motionDuration, type MotionCategory, type MotionMood } from "./catalog";
import styles from "./gallery.module.css";

type Asset = (typeof motionAssets)[number];
type Phase = "idle" | "pending" | "success" | "error";
const categories: { id: MotionCategory | "all"; label: string }[] = [
  { id: "all", label: "הכל" }, { id: "feedback", label: "תגובה לפעולה" }, { id: "progress", label: "בתוך התהליך" }, { id: "delight", label: "רגע קטן של שמחה" },
];
const samplePost = "משהו קטן וטוב באמצע היום. בואו לגלות מה חדש אצלנו השבוע 🌿";

function AssetDemo({ asset, mood }: { asset: Asset; mood: MotionMood }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [replay, setReplay] = useState(0);
  const [choice, setChoice] = useState("");
  const [draft, setDraft] = useState("משהו קטן וטוב באמצע היום");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(false);
  const busy = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; if (timer.current) clearTimeout(timer.current); };
  }, []);

  function run() {
    if (busy.current) return;
    busy.current = true;
    setReplay((n) => n + 1);
    setPhase("pending");
    const finish = (next: Phase) => {
      busy.current = false;
      if (alive.current) setPhase(next);
    };
    if (asset.id === "copy") {
      Promise.resolve().then(() => navigator.clipboard.writeText(samplePost)).then(() => finish("success"), () => finish("error"));
    } else if (asset.id === "prepare" || asset.id === "save") {
      // Explicitly a preview, not fabricated backend progress. No application APIs are called.
      timer.current = setTimeout(() => finish("success"), asset.id === "prepare" ? 2000 : 650);
    } else finish("success");
  }

  const success = phase === "success";
  const pending = phase === "pending";
  const active = asset.id === "prepare" ? pending : success;
  const result: Record<Asset["id"], string> = { press: "הרגשתם את הלחיצה?", choose: `בחרתם: ${choice}`, save: "הטיוטה נשמרה בתצוגה", copy: "הטקסט הועתק", upload: "התמונה נוספה בתצוגה", prepare: "הרעיון לדוגמה מוכן", reveal: "", publish: "השליחה הושלמה בתצוגה", milestone: "הצעד הראשון הושלם בתצוגה" };

  return <div className={styles.demo} data-demo={asset.id}>
    <MotionIllustration kind={asset.id} active={active} replayKey={`${replay}-${mood}`} className={styles.heroIllustration} />
    <div className={styles.demoContent}>
      {asset.id === "save" && <label className={styles.draftLabel}>כותרת הפוסט<input value={draft} disabled={pending} maxLength={80} onChange={(e) => { setDraft(e.target.value); setPhase("idle"); }} /></label>}
      {asset.id === "copy" && <p className={styles.post}>{samplePost}</p>}
      {asset.id === "choose" ? <div className={styles.choices} aria-label="סגנון הפוסט">{["בגובה העיניים", "קצת שובב"].map((label) => <MotionChoice key={label} selected={choice === label} onClick={() => { setChoice(label); run(); }}>{label}</MotionChoice>)}</div>
        : asset.id === "reveal" ? <MotionDisclosure label="מה הרעיון לפוסט?"><p>תמונה מהעסק, סיפור קצר מאחורי הקלעים, ושאלה אחת שמזמינה את הלקוחות להגיב.</p></MotionDisclosure>
        : <MotionButton onClick={run} disabled={pending || (asset.id === "save" && !draft.trim())}>{pending ? asset.id === "prepare" ? "מכינים רעיון לדוגמה…" : "רגע קטן…" : asset.action}</MotionButton>}
      {asset.id === "milestone" && <div className={styles.milestoneProgress}><span>{success ? "1 מתוך 1 — הפוסט הראשון" : "0 מתוך 1 — הפוסט הראשון"}</span><MotionProgress value={success ? 100 : 0} label="השלמת המשימה לדוגמה" /></div>}
      {asset.id !== "reveal" && <div className={styles.resultSlot}>
        {success && <MotionResult replayKey={`${replay}-${mood}`}>{result[asset.id]}</MotionResult>}
        {pending && <span className={styles.pending} role="status">{asset.id === "prepare" ? "הדגמה של מצב המתנה" : "הפעולה מתבצעת…"}</span>}
        {phase === "error" && <span className={styles.error} role="alert">לא הצלחנו להעתיק. אפשר לנסות שוב.</span>}
        {phase === "idle" && <span className={styles.hint}>{asset.id === "choose" ? "בחרו אפשרות וראו מה קורה" : "לחצו וראו מה קורה"}</span>}
      </div>}
    </div>
  </div>;
}

export function MotionGallery() {
  const { palette } = useDesignPalette();
  const [selectedId, setSelectedId] = useState("milestone");
  const [category, setCategory] = useState<MotionCategory | "all">("all");
  const [mood, setMood] = useState<MotionMood>("quiet");
  const [reduced, setReduced] = useState(false);
  const [replay, setReplay] = useState(0);
  const selected = motionAssets.find((asset) => asset.id === selectedId)!;
  const visible = motionAssets.filter((asset) => category === "all" || asset.category === category);

  function filter(next: MotionCategory | "all") {
    setCategory(next);
    if (next !== "all" && selected.category !== next) setSelectedId(motionAssets.find((asset) => asset.category === next)!.id);
  }

  return <MotionScope mood={mood} reduced={reduced} style={paletteVariables(palette)} className={styles.page}>
    <div className={styles.container}>
      <header className={styles.header}><Link href="/design" className={styles.brand}><BrandMark className={styles.brandMark} /><span>ישראמארקט</span></Link><span className={styles.labBadge}><span />מעבדת תנועה</span><Link href="/design" className={styles.version}>לספריית העיצוב ←</Link></header>
      <main>
        <section className={styles.intro} aria-labelledby="motion-title">
          <div><p className={styles.eyebrow}>דברים קטנים, תחושה אחרת</p><h1 id="motion-title">קצת תנועה.<br /><span>הרבה אופי.</span></h1><p className={styles.description}>בוחרים, שומרים, מתקדמים. אוסף קטן של תגובות שהופכות כל פעולה לקצת יותר כיפית.</p></div>
          <div className={styles.introNote}><span className={styles.noteStar} aria-hidden="true">✳</span><p>תנועה שמגיבה אליכם.<br />רק כשמשהו קורה.</p><span className={styles.previewBadge}>תצוגה בלבד · בלי שינוי בחשבון</span></div>
        </section>

        <PalettePicker compact />
        <div className={styles.toolbar}>
          <div className={styles.filters} role="group" aria-label="סוג התנועה">{categories.map((item) => <button type="button" key={item.id} aria-pressed={category === item.id} onClick={() => filter(item.id)}>{item.label}</button>)}</div>
          <div className={styles.preferences}><div className={styles.mood} role="group" aria-label="אופי התנועה"><button type="button" aria-pressed={mood === "quiet"} onClick={() => setMood("quiet")}>מינימליסטי</button><button type="button" aria-pressed={mood === "playful"} onClick={() => setMood("playful")}>שובב</button></div><label className={styles.reduced}><input type="checkbox" checked={reduced} onChange={(e) => setReduced(e.target.checked)} />ללא תנועה</label></div>
        </div>

        <section className={styles.stage} aria-labelledby="asset-title">
          <div className={styles.stageCanvas}><span className={styles.canvasLabel} dir="ltr">LIVE PREVIEW</span><AssetDemo key={`${selected.id}-${replay}`} asset={selected} mood={mood} /><span className={styles.canvasCorner} aria-hidden="true">↖</span></div>
          <div className={styles.stageInfo}><span className={styles.assetNumber} dir="ltr">{String(motionAssets.indexOf(selected) + 1).padStart(2, "0")} / 09</span><h2 id="asset-title">{selected.title}</h2><p>{selected.description}</p><p className={styles.modeNote}>{mood === "quiet" ? "מינימליסטי: תנועה קצרה וישירה." : "שובב: ציפייה קטנה, תנועה רחבה ופרט מסיים."}</p><div className={styles.where}><span>הרגע המתאים</span><p>{selected.where}</p></div><div className={styles.duration}><span>משך התגובה</span><span dir="ltr">{motionDuration(selected.id, mood)}</span></div><button type="button" className={styles.reset} onClick={() => setReplay((n) => n + 1)}><span aria-hidden="true">↻</span>להתחיל שוב</button><span className={styles.motionNote}>העדפת המכשיר להפחתת תנועה נשמרת תמיד.</span></div>
        </section>

        <section className={styles.collection} aria-label="אוסף התנועות"><div className={styles.collectionHeading}><h2>לבחור רגע</h2><span>{visible.length} תנועות באוסף</span></div><div className={styles.assetGrid}>{visible.map((asset) => <button type="button" key={asset.id} className={styles.asset} aria-pressed={selected.id === asset.id} onClick={() => setSelectedId(asset.id)}><MotionIllustration kind={asset.id} className={styles.thumbnail} /><span><strong>{asset.title}</strong><small>{asset.where}</small></span><span className={styles.assetArrow} aria-hidden="true">↗</span></button>)}</div></section>

        <footer className={styles.footer}><p>כל תנועה מתחילה בפעולה. כל פעולה מקבלת תשובה.</p><details><summary>פרטים למימוש</summary><p>רכיבי React ו־CSS, ללא ספריית אנימציה נוספת. תוצאות מוצגות אחרי הצלחה; המתנה נשארת המתנה. ההדגמות של שמירה, העלאה ושליחה מקומיות בלבד. העתקה משתמשת בלוח האמיתי.</p><p dir="ltr"><code>web/components/motion/Motion.tsx</code></p></details></footer>
      </main>
    </div>
  </MotionScope>;
}
