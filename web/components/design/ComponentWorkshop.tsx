"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { HypothesisNote, PlanBrief } from "./PlanBrief";
import { MotionDisclosure, MotionIllustration, MotionProgress } from "@/components/motion";
import { ChoiceCard, EmptyState, FileField, InlineNotice, SegmentedControl, SkeletonBlock, StateBadge, TextField, ToggleField, TransitionPanel, UIAction, UIDialog, UITabs } from "./Controls";
import styles from "./workshop.module.css";

const categories = [
  { value: "plan", label: "התוכנית" },
  { value: "actions", label: "פעולות" }, { value: "fields", label: "שדות ובחירה" },
  { value: "navigation", label: "ניווט" }, { value: "overlays", label: "חלונות" }, { value: "states", label: "מצבי מסך" },
];
export function ComponentWorkshop() {
  const [category, setCategory] = useState("plan");
  const [busy, setBusy] = useState(false); const [saved, setSaved] = useState(false);
  const [name, setName] = useState(""); const [submitted, setSubmitted] = useState(false);
  const [choice, setChoice] = useState("simple"); const [weekly, setWeekly] = useState(true);
  const [view, setView] = useState("list"); const [tab, setTab] = useState("month");
  const [dialog, setDialog] = useState<"modal" | "drawer" | null>(null); const [dialogName, setDialogName] = useState("לחם תום"); const [dialogSaved, setDialogSaved] = useState(false);
  const [screen, setScreen] = useState("empty"); const [file, setFile] = useState("");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  function saveDemo() {
    window.clearTimeout(timer.current); setBusy(true); setSaved(false);
    timer.current = window.setTimeout(() => { setBusy(false); setSaved(true); }, 1100);
  }
  function retryDemo() {
    window.clearTimeout(timer.current); setScreen("loading");
    timer.current = window.setTimeout(() => setScreen("ready"), 1200);
  }
  return <section id="components" className={styles.section} aria-labelledby="components-title">
    <div className={styles.heading}><div><p>רכיבים שעובדים יחד</p><h2 id="components-title">רכיבים ליום העבודה.</h2></div><Link href="/preview">לראות אותם במסכים האמיתיים ←</Link></div>
    <UITabs label="סוגי רכיבים" value={category} options={categories} onChange={setCategory}>
      {category === "plan" && <div className={styles.twoColumns}>
        <PlanBrief businessName="לחם תום · דוגמה" direction="להפוך קונים מזדמנים ללקוחות שמזמינים מראש וחוזרים." why="הזמנות מוקדמות עוזרות לתכנן את האפייה. קודם בודקים שהלקוחות מעוניינים, ושאפשר לעמוד בהזמנות." measure="הזמנות מראש, ביחס לנקודת ההתחלה." baseline="עוד אין כאן נתוני עסק. זו הדגמה של מבנה התוכנית." ownerAction="לבחור אילו מוצרים מתאימים להזמנה מראש ולבדוק שאפשר למדוד אותה." action={<UIAction onClick={() => setDialog("drawer")}>לראות איך נבדוק את הכיוון</UIAction>} />
        <details className={styles.secondary}><summary>ההשערות וההחלטות</summary><div className={styles.stack}><h3>מה עדיין צריך לברר</h3><HypothesisNote hypothesis="לקוחות יעדיפו להזמין מראש אם התהליך קצר וברור." ifWrong="נבדוק את תהליך ההזמנה ואת ההצעה לפני שמגדילים את הפרסום." evidence="השערה לדוגמה, עדיין ללא בדיקה." /><p className={styles.note}>לא קובעים אילו מוצרים זמינים או רווחיים. את זה בוחרים עם בעל העסק.</p><Link href="/preview">לתוכנית במסך האמיתי ←</Link></div></details>
      </div>}
      {category === "actions" && <div className={styles.twoColumns}>
        <div className={styles.stack}><h3>פעולה אחת מובילה</h3><div className={styles.row}><UIAction busy={busy} busyLabel="שומרים את הדוגמה…" onClick={saveDemo}>לשמור דוגמה</UIAction><UIAction variant="secondary" onClick={() => { window.clearTimeout(timer.current); setSaved(false); setBusy(false); }}>לאפס</UIAction><UIAction variant="text" onClick={() => setCategory("fields")}>לערוך קודם</UIAction></div><p className={styles.note}>לחצו כדי לראות המתנה ותוצאה. ההדגמה שומרת מצב מקומי בלבד.</p>{saved && <InlineNotice tone="success" title="הדוגמה נשמרה כאן"><span>המשוב מופיע אחרי שהפעולה מסתיימת.</span></InlineNotice>}</div>
        <details className={styles.secondary}><summary>מצבים משלימים</summary><div className={styles.stack}><div className={styles.row}><UIAction disabled>עדיין חסרה תמונה</UIAction><UIAction variant="danger" onClick={() => setDialog("modal")}>לבדוק חלון אישור</UIAction></div><div className={styles.confirmation}><MotionIllustration kind="save" active={saved} replayKey={saved ? 1 : 0} className={styles.illustration} /><p>לחיצה קטנה מגיבה מיד. הסימן של השמירה מופיע רק עם התוצאה.</p></div></div></details>
      </div>}
      {category === "fields" && <div className={styles.twoColumns}>
        <form className={styles.stack} noValidate onSubmit={e => { e.preventDefault(); setSubmitted(true); }}><h3>קודם ברור, אחר כך יפה</h3><TextField label="שם העסק לדוגמה" placeholder="למשל, לחם תום" value={name} onChange={e => { setName(e.target.value); setSubmitted(false); }} error={submitted && !name.trim() ? "צריך שם כדי להמשיך." : undefined} hint="התווית נשארת גלויה גם אחרי שמקלידים." maxLength={60} /><TextField label="הכתובת שזוהתה" value="https://example.com" disabled hint="שדה שאי אפשר לערוך מציג את הערך שלו." /><UIAction type="submit">לבדוק את השדה</UIAction>{submitted && name.trim() && <InlineNotice tone="success" title={`נעים להכיר, ${name.trim()}.`} />}</form>
        <details className={styles.secondary}><summary>בחירה עם משמעות</summary><div className={styles.stack}><div role="group" aria-label="סגנון לדוגמה"><ChoiceCard selected={choice === "simple"} onClick={() => setChoice("simple")} title="בגובה העיניים" description="קצר, ברור, עם המילים של העסק." /><div className={styles.gap} /><ChoiceCard selected={choice === "playful"} onClick={() => setChoice("playful")} title="קצת שובב" description="אותו בסיס נקי, עם רגע קטן של אופי." /></div><ToggleField checked={weekly} onChange={setWeekly} label="סיכום שבועי לדוגמה" hint="מתג להעדפה שאפשר להדליק או לכבות." /><FileField label="לבחור תמונה לדוגמה" onSelect={f => setFile(f?.name ?? "")} hint="הקובץ נבחר לתצוגה בלבד ואינו נשלח לשרת." />{file && <InlineNotice title="הקובץ נבחר לתצוגה">{file}</InlineNotice>}</div></details>
      </div>}
      {category === "navigation" && <div className={styles.twoColumns}>
        <div className={styles.stack}><h3>אותו מידע, תצוגה אחרת</h3><SegmentedControl label="תצוגת הפוסטים לדוגמה" value={view} onChange={setView} options={[{ value:"list",label:"רשימה" },{ value:"calendar",label:"לוח" }]} /><TransitionPanel transitionKey={view}><div className={styles.sampleRows}>{view === "list" ? <><p>יום ראשון <strong>רגע מהעסק</strong><StateBadge tone="waiting">לבדיקה</StateBadge></p><p>יום רביעי <strong>מאחורי הקלעים</strong><StateBadge tone="ready">מוכן</StateBadge></p></> : <div className={styles.calendar}>{Array.from({length:7},(_,i)=><span key={i}>{i+1}{[1,4].includes(i) && <i />}</span>)}</div>}</div></TransitionPanel><p className={styles.note}>הבחירה נשארת במקומה. התוכן מתחלף מתחתיה.</p></div>
        <details className={styles.secondary}><summary>לשונית ופירוט לפי צורך</summary><div className={styles.stack}><UITabs label="טווח התוכנית לדוגמה" value={tab} onChange={setTab} options={[{value:"month",label:"החודש"},{value:"quarter",label:"שלושה חודשים"}]}><p className={styles.note}>{tab === "month" ? "הצעד הקרוב: לתת ללקוחות להכיר את האנשים מאחורי העסק." : "קודם מכירים, אחר כך חוזרים, ובהמשך בודקים מה עבד."}</p></UITabs><MotionDisclosure label="איך בחרנו את הכיוון?"><p className={styles.note}>זהו הסבר לדוגמה. במוצר, הפירוט מגיע מהתוכנית של העסק והמקורות שלה.</p></MotionDisclosure></div></details>
      </div>}
      {category === "overlays" && <div className={styles.twoColumns}>
        <div className={styles.stack}><h3>חלון לפעולה ממוקדת</h3><p className={styles.note}>לעריכה קצרה או החלטה שצריכה תשומת לב. המקלדת נשארת בחלון וחוזרת לכפתור בסגירה.</p><UIAction onClick={() => setDialog("modal")}>לפתוח חלון עריכה</UIAction></div>
        <details className={styles.secondary}><summary>מגירה שלא מאבדת את ההקשר</summary><div className={styles.stack}><p className={styles.note}>פרטים נוספים לצד המסך, ובטלפון כמעט ברוחב מלא. אפשר לסגור גם עם Escape.</p><UIAction variant="secondary" onClick={() => setDialog("drawer")}>לפתוח מגירת פרטים</UIAction></div></details>
      </div>}
      {category === "states" && <div className={styles.twoColumns}>
        <div className={styles.stack}><h3>אין עדיין, מחכים, לא הצליח, מוכן</h3><SegmentedControl label="מצב מסך לדוגמה" value={screen} onChange={setScreen} options={[{value:"empty",label:"ריק"},{value:"loading",label:"טוען"},{value:"error",label:"תקלה"},{value:"ready",label:"מוכן"}]} /><TransitionPanel transitionKey={screen}>{screen === "empty" ? <EmptyState title="עוד אין תמונות מהעסק" action={<UIAction variant="secondary" onClick={retryDemo}>להוסיף דוגמה</UIAction>}>תמונה אחת אמיתית היא התחלה טובה.</EmptyState> : screen === "loading" ? <SkeletonBlock label="טוענים דוגמה" /> : screen === "error" ? <div className={styles.stack}><InlineNotice tone="error" title="הדוגמה לא נטענה">לא איבדנו את מה שמילאתם. אפשר לנסות שוב.</InlineNotice><UIAction variant="secondary" onClick={retryDemo}>לנסות שוב</UIAction></div> : <InlineNotice tone="success" title="הדוגמה מוכנה">זהו משוב מקומי, בלי קריאה לשרת.</InlineNotice>}</TransitionPanel></div>
        <details className={styles.secondary}><summary>סטטוס בלי לנחש</summary><div className={styles.stack}><div className={styles.row}><StateBadge>טיוטה</StateBadge><StateBadge tone="waiting">לבדיקה</StateBadge><StateBadge tone="ready">אושר</StateBadge><StateBadge tone="error">צריך לטפל</StateBadge></div><InlineNotice tone="attention" title="עוד צריך לחבר את החשבון">המידע נשאר גלוי גם אם הוא לא מתאים לסיפור הצלחה.</InlineNotice><p className={styles.note}>התקדמות מדודה: 2 מתוך 4, ולא אחוז שהומצא בזמן המתנה.</p><MotionProgress value={50} label="דוגמה: שניים מתוך ארבעה" /></div></details>
      </div>}
    </UITabs>
    {dialogSaved && <InlineNotice tone="success" title="השם עודכן בדוגמה">{dialogName}</InlineNotice>}
    <UIDialog open={dialog !== null} onClose={() => setDialog(null)} variant={dialog ?? "modal"} title={category === "plan" ? "איך נבדוק את הכיוון" : dialog === "drawer" ? "הפרטים של העסק" : "שם העסק בדוגמה"} description="עריכה מקומית להדגמת הרכיב. שום דבר בחשבון אינו משתנה.">{category === "plan" ? <div className={styles.stack}><p className={styles.note}>קודם מחברים את המדידה ואוספים את נקודת ההתחלה. אחרי שבוחרים מוצרים וחומרי גלם, בונים תוכן. משווים את התוצאות להשערה ומשנים את הכיוון לפי מה שנלמד.</p><UIAction onClick={()=>setDialog(null)}>לחזור לתוכנית</UIAction></div> : <form className={styles.stack} onSubmit={e=>{e.preventDefault();if(dialogName.trim()){setDialogSaved(true);setDialog(null);}}}><TextField label="שם העסק" required value={dialogName} onChange={e=>setDialogName(e.target.value)} /><UIAction type="submit" disabled={!dialogName.trim()}>לשמור בדוגמה</UIAction><UIAction variant="text" onClick={()=>setDialog(null)}>לבטל</UIAction></form>}</UIDialog>
    <details className={styles.developer}><summary>הרכיבים וההתנהגות למימוש</summary><p>כפתור: רגיל, ממוקד, לחוץ, חסום וממתין. שדה: עזרה, שגיאה וחסימה. בחירה, מתג, קובץ, לשוניות, חלון, מגירה, הודעה, תג, שלד טעינה והתקדמות. לשוניות תומכות בחצים, Home ו־End. חלונות משתמשים במיקוד טבעי של הדפדפן. כל התנועות מכבדות הפחתת תנועה.</p></details>
  </section>;
}

export function TransitionWorkshop() {
  const [step, setStep] = useState(0);
  return <section id="transitions" className={styles.section} aria-labelledby="transitions-title"><div className={styles.heading}><div><p>תנועה עם סיבה</p><h2 id="transitions-title">מעברים ותגובות.</h2></div></div><div className={styles.twoColumns}><div className={styles.stack}><div className={styles.row}><UIAction onClick={()=>setStep(s=>s+1)}>להחליף את התוכן</UIAction><StateBadge>דוגמה {step+1}</StateBadge></div><TransitionPanel transitionKey={step}><div className={styles.transitionSample}><span>0{step%3+1}</span><h3>{["רגע מהעסק", "כמה מילים", "מוכן לבדיקה"][step%3]}</h3><p>הבקר נשאר יציב, והמשטח החדש נכנס בעדינות. החליפו בין ״עדין״ ל״עם אופי״ בראש הספרייה.</p></div></TransitionPanel></div><div className={styles.rules}><p><strong>לחיצה</strong><span>תגובה קטנה ומידית · 160 מילישניות</span></p><p><strong>החלפת תוכן</strong><span>דעיכה עדינה · 180, כניסת נייר · 420</span></p><p><strong>חלון ומגירה</strong><span>רקע והופעה רציפים · 200–240</span></p><p><strong>התקדמות השמש</strong><span>עלייה רציפה עם התוצאה · 1.8 שניות</span></p><p><strong>הפחתת תנועה</strong><span>אותה תוצאה, מוצגת מיד בלי מסלול או קפיצה</span></p></div></div></section>;
}
