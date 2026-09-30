"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { BrandMark } from "@/lib/icons";
import { ResultsBrief, type ResultsBriefData } from "./ResultsBrief";
import { DesignScope } from "./Primitives";
import { SegmentedControl, UIAction } from "./Controls";
import { useDesignPalette } from "./palette";
import styles from "./results-brief.module.css";

type Scenario = ResultsBriefData["state"];
const examples: Record<Scenario, ResultsBriefData> = {
  finding: {
    business: "פרג ושמרים", state: "finding", period: "20–26 בספטמבר 2026",
    source: "נתוני אתר לדוגמה · החיבור פעיל · שתי תקופות של שבוע מלא",
    heading: "יותר הזמנות מראש השבוע",
    explanation: "19 הזמנות באתר, לעומת 14 בשבוע הקודם. הכיוון מעודד; עדיין מוקדם לדעת מה גרם לשינוי.",
    nextAction: { title: "להקדים את הפוסט להזמנה מראש", explanation: "ננסה לתת ללקוחות עוד יום להזמין. אחר כך נבדוק את ההזמנות." },
    actionLabel: "לבדוק את השינוי בתוכנית",
    evidence: ["בדוגמה הזו נספרות רק הזמנות שהושלמו ושולמו באתר. לחיצה על קישור לא נחשבת להזמנה.", "השווינו את 20–26 בספטמבר ל־13–19 בספטמבר: שבעה ימים מלאים בכל תקופה.", "אין בדוגמה מידע שמוכיח שהפוסט הוא שגרם להזמנות. הקדמת הפוסט היא רעיון לבדיקה."],
    comparison: {
      metric: "הזמנות ששולמו באתר", currentLabel: "השבוע", previousLabel: "השבוע הקודם",
      days: [
        { label: "א׳", current: 2, previous: 1 }, { label: "ב׳", current: 2, previous: 3 },
        { label: "ג׳", current: 4, previous: 2 }, { label: "ד׳", current: 3, previous: 2 },
        { label: "ה׳", current: 3, previous: 3 }, { label: "ו׳", current: 2, previous: 2 },
        { label: "ש׳", current: 3, previous: 1 },
      ],
    },
  },
  learning: {
    business: "פרג ושמרים", state: "learning", period: "החיבור התחיל לפני שלושה ימים",
    source: "נתוני אתר לדוגמה · החיבור פעיל · המדידה עדיין בתחילת הדרך",
    heading: "עוד קצת זמן לפני שמסיקים מסקנות",
    explanation: "נמדדו שתי הזמנות בשלושה ימים. אין עדיין שבוע קודם להשוואה, אז נשמור על הכיוון שבחרנו.",
    nextAction: { title: "להמשיך בצעד שכבר תכננו", explanation: "הפוסט הבא נשאר בתוכנית. אין עדיין סיבה לשנות כיוון." },
    actionLabel: "לראות את הצעד שבתוכנית",
    evidence: ["יש נתונים משלושה ימים בלבד. הימים שלפני החיבור חסרים, ואינם אפס הזמנות.", "לא נשווה שלושה ימים לשבוע מלא ולא נכריז שהמכירות עלו או ירדו."],
  },
  disconnected: {
    business: "פרג ושמרים", state: "disconnected", period: "העדכון האחרון: 19 בספטמבר 2026",
    source: "נתוני אתר לדוגמה · החיבור דורש חידוש",
    heading: "הנתונים הפסיקו להתעדכן",
    explanation: "צריך לחדש את ההרשאה לקריאת נתוני האתר. זה לא אומר שההזמנות הפסיקו להגיע.",
    nextAction: { title: "לחבר שוב את נתוני האתר", explanation: "החיבור מאפשר להמשיך לבדוק מה עובד, בלי להזין מספרים בעצמכם." },
    actionLabel: "לחדש את החיבור בדוגמה",
    evidence: ["הקריאה האחרונה שהצליחה הייתה ב־19 בספטמבר. אין לנו מדידה מאז.", "לא נציג אפסים או ירידה במכירות במקום הנתונים החסרים."],
  },
};

/** Explicit fixtures and local interactions; no account, provider or plan writes. */
export function ResultsWorkshop() {
  const id = useId();
  const [scenario, setScenario] = useState<Scenario>("finding");
  const [expanded, setExpanded] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [reconnected, setReconnected] = useState(false);
  function changeScenario(value: string) {
    setScenario(value as Scenario); setExpanded(false); setDraftOpen(false); setAccepted(false); setReconnected(false);
  }
  function act() {
    if (scenario === "disconnected") { setScenario("learning"); setReconnected(true); setExpanded(false); }
    else setExpanded(value => !value);
  }
  return <div className={styles.workshop}>
    <div className={styles.workshopHeading}><div><p className={styles.eyebrow}>רכיב תוצאות אינטראקטיבי</p><h1>מה למדנו. מה עושים עכשיו.</h1></div><p>עסק ונתונים לדוגמה.<br />{" "}השינויים כאן נשארים בתצוגה הזו.</p></div>
    <div className={styles.scenarios}><span>לנסות מצב אחר</span><SegmentedControl label="מצב נתוני התוצאות" value={scenario} onChange={changeScenario} options={[{ value: "finding", label: "יש ממצא" }, { value: "learning", label: "מעט נתונים" }, { value: "disconnected", label: "חיבור שנעצר" }]} /></div>
    {reconnected && <p className={styles.recovery} role="status">החיבור חודש בדוגמה. ממשיכים למדוד; עדיין אין שבוע מלא להשוואה.</p>}
    <ResultsBrief key={scenario} data={examples[scenario]} onAction={act} expanded={expanded} actionContent={<section className={styles.proposal} aria-labelledby={`${id}-plan-title`}>
      <div className={styles.proposalHeader}><p className={styles.eyebrow}>{accepted ? "עודכן בתצוגה הזו" : scenario === "finding" ? "השינוי המוצע בתוכנית" : "הצעד שכבר בתוכנית"}</p><UIAction variant="text" onClick={() => setExpanded(false)}>לסגור</UIAction></div>
      <h3 id={`${id}-plan-title`}>הכיוון נשאר: יותר הזמנות מראש</h3>
      <dl className={styles.planRows}>
        <div><dt>הפוסט הבא</dt><dd>{scenario === "finding" ? "יום רביעי במקום חמישי · להזמין לקראת שישי" : "יום חמישי · להזמין לקראת שישי"}</dd></div>
        <div><dt>מה בודקים</dt><dd>הזמנות ששולמו באתר בשבוע הבא, מול השבוע הזה</dd></div>
      </dl>
      <div className={styles.proposalActions}>
        {scenario === "finding" && <UIAction variant="secondary" onClick={() => setAccepted(value => !value)}>{accepted ? "לבטל את השינוי בדוגמה" : "להוסיף לתוכנית בדוגמה"}</UIAction>}
        <UIAction variant="text" onClick={() => setDraftOpen(value => !value)} aria-expanded={draftOpen} aria-controls={`${id}-draft`}>{draftOpen ? "להסתיר את טיוטת הפוסט" : "לראות את טיוטת הפוסט"} ←</UIAction>
      </div>
      {accepted && <p className={styles.accepted} role="status">בתצוגה הזו הפוסט עבר ליום רביעי. התוכנית בחשבון שלכם לא השתנתה.</p>}
      {draftOpen && <div id={`${id}-draft`} className={styles.draft}><p className={styles.eyebrow}>טיוטה לבדיקת בעל העסק</p><h4>לשישי הקרוב, מזמינים מראש</h4><p>מתכננים את הסוף שבוע? אפשר להזמין מראש בפרג ושמרים. לפרטים ולהזמנה, היכנסו לאתר.</p><small>לפני פרסום: לבדוק שההזמנה פתוחה ולהוסיף את הקישור המתאים.</small></div>}
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
