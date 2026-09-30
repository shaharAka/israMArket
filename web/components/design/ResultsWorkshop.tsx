"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { BrandMark } from "@/lib/icons";
import { ResultsBrief, type ResultsBriefData } from "./ResultsBrief";
import { DesignScope } from "./Primitives";
import { SegmentedControl, UIAction } from "./Controls";
import { useDesignPalette } from "./palette";
import styles from "./results-brief.module.css";

type Scenario = ResultsBriefData["state"];
const businessFacts = {
  source: "המידע על העסק",
  observation: "פרטי המארז והאיסוף כבר ידועים",
  detail: "בדוגמה, בעל העסק אישר: חלה ושישה מאפים, 89 ₪, הזמנה עד חמישי ב־20:00 ואיסוף בשישי בין 08:00 ל־12:00 מהמאפייה.",
  period: "פרטי עסק מומצאים שאושרו בתוך התרחיש, ולא בחשבון שלכם",
};
const successCheck = "נשווה הזמנות ששולמו באתר בשני שבועות מלאים. שמירות ולחיצות לבדן לא ייחשבו להזמנות.";
const examples: Record<Scenario, ResultsBriefData> = {
  finding: {
    business: "פרג ושמרים", state: "finding", period: "בדיקת השבוע · 20–26 בספטמבר 2026",
    goal: "בתוכנית: יותר הזמנות למארזי שישי",
    source: "בדוגמה: נתוני אינסטגרם, נתוני האתר, בדיקת עמוד ההזמנה ופרטי העסק",
    heading: "יש עניין במארזי שישי. כדאי להבהיר איך מזמינים.",
    explanation: "הפוסט על המארז נשמר, ויש ביקורים בעמוד שלו באתר. בעמוד חסרים פרטי האיסוף — מידע שלקוח צריך לפני שהוא מחליט להזמין.",
    uncertainty: "אנחנו עדיין לא יודעים אם פרטי האיסוף החסרים הם מה שמונע הזמנות. זו הסיבה שננסה שינוי קטן ונבדוק את התוצאות.",
    nextAction: { title: "נוסיף הסבר קצר להזמנה, באתר ובפוסט הבא", explanation: "כבר הכנו נוסח עם תכולת המארז, המחיר וזמני האיסוף. אתם בודקים שהפרטים נכונים; אחר כך מוסיפים אותו לעמוד ומשתמשים בו בפוסט שבתוכנית.", effort: "רק לבדוק את הפרטים", successCheck },
    actionLabel: "לראות את ההסבר שהכנו",
    evidence: [
      { source: "אינסטגרם", observation: "הפוסט על המארז מעורר עניין", detail: "הוא נשמר 24 פעמים, לעומת 6 ו־8 שמירות בשני הפוסטים האחרים באותו שבוע. שמירה מעידה על עניין, ואינה הזמנה.", period: "20–26 בספטמבר · נתונים מומצאים משלושה פוסטים" },
      { source: "האתר", observation: "יש ביקורים, אבל פרטי האיסוף חסרים", detail: "בעמוד המארז נרשמו 32 ביקורים. בנפרד, נמדדו 3 הזמנות ששולמו באתר. בדיקת העמוד בדוגמה מצאה שחסרים מקום ושעות האיסוף. איננו יודעים אם אלו אותם מבקרים או אם החוסר מנע קנייה.", period: "20–26 בספטמבר · נתוני אתר ובדיקת עמוד מומצאים" },
      businessFacts,
    ],
  },
  learning: {
    business: "פרג ושמרים", state: "learning", period: "תחילת המדידה",
    goal: "בתוכנית: יותר הזמנות למארזי שישי",
    source: "בדוגמה: המידע על העסק קיים; עדיין אין מספיק נתוני תוצאות",
    heading: "מוקדם לדעת מה עובד. אפשר כבר להסביר מה מזמינים.",
    explanation: "המדידה רק התחילה. בינתיים נמשיך בצעד שבתוכנית: להציג את המארז בצורה ברורה, כדי שלקוחות ידעו מה מקבלים ואיך מזמינים.",
    uncertainty: "הצעד נשען על התוכנית ופרטי העסק, ולא על מסקנה מהתוצאות. נתונים שעדיין לא נאספו אינם אפס הזמנות.",
    nextAction: { title: "ההסבר למארז כבר מוכן לבדיקה", explanation: "לא צריך לפענח נתונים כדי להתחיל. בדקו את התכולה, המחיר ושעות האיסוף בנוסח שהכנו.", effort: "רק לבדוק את הפרטים", successCheck },
    actionLabel: "לראות את ההסבר שהכנו",
    evidence: [
      { source: "אינסטגרם", observation: "אין עדיין בסיס להשוואה", detail: "בתוך התרחיש, הפרסום התחיל לפני שלושה ימים. לא נסיק ממנו מהו סוג התוכן שעובד הכי טוב.", period: "שלושה ימים בלבד · נתונים לדוגמה" },
      { source: "האתר", observation: "המדידה עדיין בתחילת הדרך", detail: "נמדדו שתי הזמנות ששולמו בשלושה ימים. אין שבוע קודם להשוואה, ולא נשווה שלושה ימים לשבוע מלא.", period: "שלושה ימים בלבד · נתונים לדוגמה" },
      businessFacts,
    ],
  },
  disconnected: {
    business: "פרג ושמרים", state: "disconnected", period: "נתוני האתר נעצרו ב־19 בספטמבר 2026",
    goal: "בתוכנית: יותר הזמנות למארזי שישי",
    source: "בדוגמה: אינסטגרם ופרטי העסק זמינים; נתוני האתר דורשים חיבור מחדש",
    heading: "ההסבר למארז מוכן. חסרים לנו נתוני ההזמנות.",
    explanation: "אפשר להמשיך עם מה שכבר הכנו. כדי לדעת אם זה עוזר להזמנות, צריך לחדש את החיבור לנתוני האתר.",
    uncertainty: "נתוני האתר החסרים אינם הוכחה שההזמנות ירדו. לא נציג מסקנה על המכירות בלי קריאה עדכנית.",
    nextAction: { title: "נחדש את המדידה, בלי לעצור את התוכנית", explanation: "ההסבר והפוסט עדיין זמינים. החיבור מחדש רק מאפשר לנו להמשיך לבדוק את ההזמנות באתר.", effort: "ההרשאה צריכה חידוש", successCheck },
    actionLabel: "לחדש את החיבור בדוגמה",
    evidence: [
      { source: "אינסטגרם", observation: "עדיין יש נתוני עניין בפוסט", detail: "הפוסט על המארז נשמר 24 פעמים בתרחיש. אי אפשר ללמוד מהשמירות כמה הזמנות התקבלו.", period: "20–26 בספטמבר · נתונים מומצאים" },
      { source: "האתר", observation: "אין קריאה עדכנית של ההזמנות", detail: "העדכון האחרון הצליח ב־19 בספטמבר. הנתונים מאז חסרים; הם לא אפס.", period: "חיבור שנעצר · תרחיש לדוגמה" },
      businessFacts,
    ],
  },
};
const initialCopy = "מארז שישי: חלה ושישה מאפים, ב־89 ₪.\nמזמינים באתר עד חמישי ב־20:00.\nאוספים מהמאפייה בשישי, בין 08:00 ל־12:00.";

/** Fictional synthesis, editable copy and local plan approval. No provider or account writes. */
export function ResultsWorkshop() {
  const id = useId();
  const copyField = useRef<HTMLTextAreaElement>(null);
  const [scenario, setScenario] = useState<Scenario>("finding");
  const [expanded, setExpanded] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [acceptedCopy, setAcceptedCopy] = useState<string | null>(null);
  const [copy, setCopy] = useState(initialCopy);
  const [copyStatus, setCopyStatus] = useState("");
  const [reconnected, setReconnected] = useState(false);
  function changeScenario(value: string) {
    setScenario(value as Scenario); setExpanded(false); setDraftOpen(false); setAcceptedCopy(null); setCopy(initialCopy); setCopyStatus(""); setReconnected(false);
  }
  function act() {
    if (scenario === "disconnected") { setScenario("learning"); setReconnected(true); setExpanded(false); }
    else setExpanded(value => !value);
  }
  async function copyForWebsite() {
    setCopyStatus("");
    try { await navigator.clipboard.writeText(copy); setCopyStatus("הנוסח הועתק. אפשר להדביק בעמוד המארז, או לשלוח למי שמעדכן את האתר."); }
    catch { copyField.current?.focus(); copyField.current?.select(); setCopyStatus("העתקה אוטומטית לא הצליחה. הנוסח מסומן — אפשר להעתיק ידנית."); }
  }
  const data = reconnected ? {
    ...examples.learning,
    period: "החיבור חודש · ממתינים לעדכון",
    source: "בדוגמה: החיבור חזר; עדיין לא התקבלו נתוני אתר חדשים",
    heading: "החיבור חזר. בינתיים נמשיך עם ההסבר שהכנו.",
    explanation: "שמרנו את העבודה בתוכנית. כשיגיעו נתוני הזמנות חדשים, נוכל להמשיך לבדוק את התוצאות.",
    uncertainty: "לא ננחש מה קרה להזמנות בזמן שהחיבור לא פעל.",
    evidence: [examples.disconnected.evidence[0], { source: "האתר", observation: "החיבור חזר, ומחכים לנתונים", detail: "ההרשאה חודשה בתוך התרחיש. חיבור פעיל לבדו לא אומר שהנתונים כבר התעדכנו.", period: "התאוששות מדומה · אין מדידה חדשה" }, businessFacts],
  } : examples[scenario];
  return <div className={styles.workshop}>
    <div className={styles.workshopHeading}><div><p className={styles.eyebrow}>רכיב המלצה לעסק</p><h1>המידע מורכב. הצעד הבא ברור.</h1></div><p>תרחיש מומצא מכמה מקורות.<br />{" "}האישור נשאר בתצוגה הזו.</p></div>
    <div className={styles.scenarios}><span>לנסות מצב אחר</span><SegmentedControl label="מצב נתוני התוצאות" value={scenario} onChange={changeScenario} options={[{ value: "finding", label: "יש המלצה" }, { value: "learning", label: "מעט נתונים" }, { value: "disconnected", label: "מקור חסר" }]} /></div>
    {reconnected && <p className={styles.recovery} role="status">החיבור חודש בדוגמה. הנתונים עוד לא התעדכנו; בינתיים אפשר להמשיך עם ההסבר שהכנו.</p>}
    <ResultsBrief key={scenario} data={data} onAction={act} onContinue={scenario === "disconnected" ? () => setExpanded(value => !value) : undefined} expanded={expanded} actionContent={<section className={styles.proposal} aria-labelledby={`${id}-plan-title`}>
      <div className={styles.proposalHeader}><p className={styles.eyebrow}>הצעד בתוכנית · להסביר איך מזמינים</p><UIAction variant="text" onClick={() => setExpanded(false)}>לסגור</UIAction></div>
      <h3 id={`${id}-plan-title`}>זה ההסבר שנוסיף לעמוד המארז</h3>
      <p className={styles.proposalIntro}>בדקו שהפרטים נכונים. אפשר לתקן את הנוסח כאן לפני האישור.</p>
      <label className={styles.copyLabel} htmlFor={`${id}-copy`}>הנוסח ללקוחות</label>
      <textarea ref={copyField} id={`${id}-copy`} value={copy} rows={3} onChange={event => { setCopy(event.target.value); setAcceptedCopy(null); setCopyStatus(""); }} aria-describedby={`${id}-copy-help`} className={styles.copyField} />
      <p id={`${id}-copy-help`} className={styles.copyHelp}>פרטי המארז מומצאים לצורך הדוגמה. בחשבון אמיתי משתמשים בפרטים שאישרתם.</p>
      <div className={styles.proposalActions}>
        <UIAction disabled={!copy.trim()} variant={acceptedCopy ? "secondary" : "primary"} onClick={() => setAcceptedCopy(acceptedCopy ? null : copy)}>{acceptedCopy ? "לבטל את האישור בדוגמה" : "לאשר את ההסבר לתוכנית בדוגמה"}</UIAction>
        <UIAction variant="text" disabled={!copy.trim()} onClick={copyForWebsite}>להעתיק לאתר</UIAction>
      </div>
      {copyStatus && <p className={styles.accepted} role="status">{copyStatus}</p>}
      {acceptedCopy && <p className={styles.accepted} role="status">אושר בתצוגה הזו: קודם מוסיפים את ההסבר לאתר, ואז משתמשים בו בפוסט. האתר והתוכנית בחשבון שלכם לא השתנו.</p>}
      <div className={styles.planFollowThrough}><div><strong>ואיך זה נכנס לתוכנית?</strong><p>קודם מוסיפים את ההסבר לעמוד. הפוסט הבא משתמש באותם פרטים ומפנה אליו להזמנה.</p></div><UIAction variant="text" onClick={() => setDraftOpen(value => !value)} aria-expanded={draftOpen} aria-controls={`${id}-draft`}>{draftOpen ? "להסתיר את הפוסט" : "לראות גם את הפוסט שהכנו"} ←</UIAction></div>
      {draftOpen && <div id={`${id}-draft`} className={styles.draft}><p className={styles.eyebrow}>הפוסט הבא בתוכנית · טיוטה</p><h4>מתכננים שישי בבית?</h4><p className={styles.postCopy}>{copy.trim() || "הוסיפו את פרטי המארז בנוסח למעלה."}</p><p>לפרטים ולהזמנה, היכנסו לעמוד המארז באתר.</p><small>לפני פרסום: לוודא שהמארז זמין ושהקישור מוביל לעמוד המעודכן.</small></div>}
    </section>} />
  </div>;
}

export function ResultsPreview() {
  const { palette } = useDesignPalette();
  return <DesignScope palette={palette} className={styles.preview}><div className={styles.previewContainer}>
    <header className={styles.previewHeader}><Link href="/design" className={styles.brand}><BrandMark />ישראמארקט</Link><Link href="/design">לספריית העיצוב ←</Link></header>
    <main><ResultsWorkshop /></main>
  </div></DesignScope>;
}
