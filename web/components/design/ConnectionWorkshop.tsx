"use client";

import { useState } from "react";
import Link from "next/link";
import { BrandMark, IconChevron } from "@/lib/icons";
import { SunProgress } from "@/components/brand/SunProgress";
import { PixelSetupGuide } from "@/components/integrations/PixelSetupGuide";
import { SourceReadState, sourcePresentation } from "@/components/integrations/SourceReadState";
import type { SourceReadiness } from "@/lib/api";
import { UIAction, UIDialog } from "./Controls";
import styles from "./connection-workshop.module.css";

type Provider = "google" | "meta";
type Step = "intro" | "consent" | "select" | "read" | "recovery" | "extras" | "pixel";
type State = "missing" | "selected" | "ready" | "no_history" | "reconnect";
type Scenario = "normal" | "wrong_account" | "cancelled" | "no_history" | "reconnect";

const providers = {
  google: { title: "נתוני האתר", benefit: "כדי לבדוק אם הפוסטים מביאים אנשים לעמוד ההזמנה, ומה קורה שם.", action: "לחבר את נתוני האתר", provider: "גוגל" },
  meta: { title: "פייסבוק ואינסטגרם", benefit: "כדי להבין אילו פוסטים מעוררים עניין, ולדייק את הפוסט הבא בתוכנית.", action: "לחבר את פייסבוק ואינסטגרם", provider: "פייסבוק" },
};
const states: Record<State, string> = {
  missing: "עוד לא חובר", selected: "החשבון נבחר, מחכים לקריאה הראשונה", ready: "התקבלה קריאה",
  no_history: "החשבון מחובר, עדיין אין נתונים לתקופה", reconnect: "צריך לחדש את האישור",
};

const readNotes: Record<SourceReadiness["status"], string> = {
  choose_property: "הגישה לגוגל אושרה. בחרו את האתר שאת הנתונים שלו נקרא.",
  no_properties: "לא נמצאו אתרים בחשבון הזה. אפשר לבחור חשבון אחר או לבקש גישה ממי שמנהל את האתר.",
  unchecked: "האתר נבחר. עוד לא בדקנו אם אפשר לקרוא את הנתונים שלו.",
  reading: "בודקים את נתוני האתר. אפשר להמשיך לעבוד על התוכנית.",
  ready: "קראנו נתונים מהאתר. הם זמינים בעמוד התוצאות.",
  empty: "הקריאה הצליחה, אבל לא נמצאה פעילות בתקופה שנבדקה. אפשר להמשיך בתוכנית ולבדוק את התקנת המדידה.",
  reconnect: "גוגל לא מאפשר כרגע לקרוא את הנתונים. חברו מחדש עם חשבון שיש לו גישה לאתר.",
  unavailable: "לא הצלחנו לקרוא את הנתונים כרגע. הבחירה נשמרה; אפשר לנסות שוב בלי להתחיל מחדש.",
};

function ReadinessRehearsal() {
  const [status, setStatus] = useState<SourceReadiness["status"]>("unchecked");
  const priorRead = ["ready", "empty", "reconnect", "unavailable"].includes(status);
  const state: SourceReadiness = { status, note_he: readNotes[status],
    ...(priorRead ? { period: { start: "2026-09-02", end: "2026-09-29" }, last_success_at: "2026-09-30T09:00:00Z" } : {}) };
  return <section className={`${styles.recommendation} mt-8`} aria-labelledby="real-read-states">
    <div><h2 id="real-read-states">מצב נתוני האתר</h2><p className={styles.caption}>הרכיב שמופיע במוצר, עם מצבי המדידה והחיבורים.</p></div>
    <label className={styles.field}>המצב שמוצג למשתמש<select value={status} onChange={event => setStatus(event.target.value as SourceReadiness["status"])}>
      {(Object.keys(readNotes) as SourceReadiness["status"][]).map(value => <option key={value} value={value}>{sourcePresentation({ status: value, note_he: "" }).label}</option>)}
    </select></label>
    <div><strong className="text-[16px]">פרג ושמרים · האתר</strong><p className={styles.caption}>{sourcePresentation(state).label}</p>
      <SourceReadState state={state} resultsHref="/design/results" primary onRetry={() => setStatus("reading")} onReconnect={() => setStatus("choose_property")} />
    </div>
    {status === "reading" ? <UIAction onClick={() => setStatus("ready")}>לדמות קריאה מוצלחת</UIAction> : null}
    {status === "choose_property" ? <UIAction onClick={() => setStatus("unchecked")}>לדמות בחירת אתר</UIAction> : null}
  </section>;
}

/** Local-only UX rehearsal. Never calls provider APIs, grants access or saves account data. */
export function ConnectionWorkshop() {
  const [provider, setProvider] = useState<Provider>("google");
  const [step, setStep] = useState<Step>("intro");
  const [open, setOpen] = useState(false);
  const [scenario, setScenario] = useState<Scenario>("normal");
  const [connections, setConnections] = useState<Record<Provider, State>>({ google: "missing", meta: "missing" });
  const [choice, setChoice] = useState("");
  const [selections, setSelections] = useState<Record<Provider, string>>({ google: "", meta: "" });
  const [adAccount, setAdAccount] = useState("");
  const [adsSaved, setAdsSaved] = useState(false);
  const [pixel, setPixel] = useState("");
  const [pixelChecked, setPixelChecked] = useState(false);
  const [notice, setNotice] = useState("");

  function update(value: State) { setConnections(current => ({ ...current, [provider]: value })); }
  function start(value: Provider) {
    setNotice("");
    if (value !== provider) { setProvider(value); setChoice(""); }
    // A dismissed sheet resumes the unfinished choice in this local preview.
    if (value !== provider) setStep("intro");
    if (connections[value] === "selected" || connections[value] === "ready" || connections[value] === "no_history") setStep("read");
    if (connections[value] === "reconnect") setStep("recovery");
    setOpen(true);
  }
  function approveExample() {
    if (scenario === "cancelled") {
      setOpen(false); setStep("intro"); setNotice("האישור בוטל. התוכנית זמינה, ותוכלו לחזור לחיבור כשנוח לכם."); return;
    }
    if (scenario === "wrong_account" || scenario === "reconnect") { setStep("recovery"); return; }
    setStep("select");
  }
  function readExample() {
    update(scenario === "no_history" ? "no_history" : "ready");
  }
  function changeScenario(value: Scenario) {
    setScenario(value); setOpen(false); setStep("intro"); setChoice(""); setNotice("");
    setConnections({ google: value === "reconnect" ? "reconnect" : "missing", meta: "missing" });
    setSelections({ google: "", meta: "" });
    setAdAccount(""); setAdsSaved(false); setPixel(""); setPixelChecked(false);
  }

  const recommended: Provider = connections.google === "missing" || connections.google === "reconnect" ? "google" : "meta";
  const remaining = Object.values(connections).some(state => state === "missing" || state === "reconnect");
  const data = providers[provider];
  const title = step === "intro" ? data.title : step === "consent" ? "מאשרים אצל " + data.provider : step === "select" ? (provider === "google" ? "איזה אתר שייך לעסק?" : "איזה דף שייך לעסק?") : step === "recovery" ? "נמצא את החשבון הנכון" : step === "extras" ? "גם נתוני המודעות?" : step === "pixel" ? "המעקב באתר" : "החשבון נבחר";

  return <div className={`app-blue ${styles.page}`}><div className={styles.container}>
    <header className={styles.header}><Link href="/design" className={styles.brand}><BrandMark />ישראמארקט</Link><Link href="/design">לספריית העיצוב ←</Link></header>
    <main>
      <div className={styles.heading}><div><h1>מחברים רק את מה שיעזור לתוכנית.</h1><p>בתוכנית של פרג ושמרים: יותר הזמנות למארזי שישי.</p></div><SunProgress value={Object.values(connections).filter(state => state === "ready").length} total={2} label="קריאות נתונים שהתקבלו" className={styles.store} /></div>
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      {remaining ? <section className={styles.recommendation} aria-labelledby="recommended-connection">
        <span className={styles.caption}>כדאי להתחיל כאן</span><h2 id="recommended-connection">{providers[recommended].title}</h2>
        <p>{providers[recommended].benefit}</p><UIAction onClick={() => start(recommended)}>{providers[recommended].action}</UIAction>
        <button className={styles.textAction} type="button" onClick={() => setNotice("אפשר להמשיך בתוכנית עכשיו ולחזור לחיבורים בהמשך. הבחירות נשמרות כל עוד הדף פתוח.")}>להמשיך בתוכנית ולחבר אחר כך</button>
      </section> : <section className={styles.recommendation}><h2>החשבונות נבחרו. ממשיכים בתוכנית.</h2><p>אישור גישה לבדו אינו נתוני תוצאות. במצב החיבורים רואים אם כבר התקבלה קריאה.</p><Link href="/design/results" className={styles.resultLink}>לראות איך נתונים הופכים לצעד בתוכנית ←</Link></section>}
      <section className={styles.connections} aria-labelledby="connection-status"><h2 id="connection-status">החיבורים של העסק</h2>
        {(["google", "meta"] as Provider[]).map(key => <div className={styles.row} key={key}><div><strong>{providers[key].title}</strong>{selections[key] && <small>{selections[key]}</small>}<p><span className={styles.dot} data-state={connections[key]} aria-hidden="true" />{states[connections[key]]}</p>{key === "meta" && adsSaved && <small>גם חשבון הפרסום נבחר{pixel ? pixelChecked ? ", המעקב נבדק" : ", המעקב עדיין לא נבדק" : ""}</small>}</div><UIAction variant="text" onClick={() => start(key)}>{connections[key] === "missing" ? "לחבר" : connections[key] === "reconnect" ? "לחדש את האישור" : "לראות את החיבור"}</UIAction></div>)}
      </section>
      <details className={styles.disclosure}><summary>ומה עם חיבורים נוספים?<IconChevron /></summary><p>קישור וואטסאפ יכול למדוד לחיצות, לא הודעות או מכירות. חיבור לכרטיס העסק בגוגל ולכלים נוספים יוצע כשיהיה זמין; התוכנית אינה תלויה בהם.</p></details>
      <div className={styles.reviewControls}><label>מצב לבדיקה<select value={scenario} onChange={event => changeScenario(event.target.value as Scenario)}><option value="normal">חיבור רגיל</option><option value="wrong_account">החשבון הלא נכון</option><option value="cancelled">האישור בוטל</option><option value="no_history">אין נתונים לתקופה</option><option value="reconnect">האישור צריך חידוש</option></select></label><UIAction variant="text" onClick={() => changeScenario("normal")}>להתחיל מחדש</UIAction></div>
      <ReadinessRehearsal />
    </main>
    <UIDialog open={open} onClose={() => setOpen(false)} title={title}>
      <div className={styles.sheet}>
        {step === "intro" && <>
          <p>{data.benefit}</p>
          {provider === "google" ? <p>הכניסה עם Google מזהה אתכם. כדי לקרוא את נתוני האתר צריך אישור נוסף, עם החשבון שמנהל את המדידה.</p> : <p>נבחר את הדף העסקי שלכם. אם האינסטגרם מקצועי ומקושר אליו, הוא יתחבר יחד עם הדף.</p>}
          <p className={styles.caption}>קריאת נתונים בלבד. לא משנים מודעות ולא מפרסמים פוסטים.</p>
          <UIAction onClick={() => setStep("consent")}>לראות את שלב האישור</UIAction>
        </>}
        {step === "consent" && <>
          <p>בחיבור אמיתי, כאן נפתח חלון מאובטח של {data.provider}. בחרו את החשבון שמנהל את העסק ואשרו קריאת נתונים.</p>
          {provider === "meta" && <p className={styles.caption}>בשלב הזה מחברים את הדף. נתוני מודעות ומעקב באתר הם בחירה נפרדת בהמשך.</p>}
          <UIAction onClick={approveExample}>לדמות אישור ולבחור את העסק</UIAction>
          <UIAction variant="text" onClick={() => { setOpen(false); setStep("intro"); setNotice("האישור בוטל. אפשר להמשיך בתוכנית ולנסות שוב בהמשך."); }}>לדמות ביטול ולחזור לתוכנית</UIAction>
        </>}
        {step === "select" && <>
          <label className={styles.field}>{provider === "google" ? "האתר של העסק" : "הדף העסקי"}<select value={choice} onChange={event => setChoice(event.target.value)}><option value="">לבחור לפי השם</option><option value="shop">פרג ושמרים{provider === "google" ? " · החנות" : ""}</option>{provider === "google" && <option value="journal">פרג ושמרים · המגזין</option>}</select></label>
          <p className={styles.caption}>{provider === "google" ? "בחרו את האתר שבו הלקוחות מזמינים. פרטי המדידה הטכניים אינם נחוצים כאן." : "אינסטגרם של פרג ושמרים מקושר לדף הזה."}</p>
          <UIAction disabled={!choice} onClick={() => { setSelections(current => ({ ...current, [provider]: provider === "meta" ? "פרג ושמרים" : choice === "shop" ? "פרג ושמרים · החנות" : "פרג ושמרים · המגזין" })); update("selected"); setStep("read"); }}>זה העסק שלי, להמשיך</UIAction>
          <UIAction variant="text" onClick={() => setStep("recovery")}>העסק שלי לא מופיע</UIAction>
        </>}
        {step === "recovery" && <>
          <p>{connections[provider] === "reconnect" ? "האישור לנתוני האתר צריך חידוש. התוכנית והפוסטים נשמרו." : "לא מצאנו את העסק בחשבון הזה. לרוב המדידה או הדף מנוהלים בחשבון אחר."}</p>
          <UIAction onClick={() => { setStep("select"); setChoice(""); }}>לדמות חיבור עם החשבון הנכון</UIAction>
          <details className={styles.disclosure}><summary>מי שמנהל את האתר יכול לעזור<IconChevron /></summary><p>בקשו ממנו לבדוק איזה חשבון מנהל את נתוני האתר או הדף העסקי, ולהוסיף לכם גישה. אין צורך למסור סיסמה.</p></details>
        </>}
        {step === "read" && <>
          <strong>{selections[provider]}</strong>
          <p role="status">{states[connections[provider]]}</p>
          {connections[provider] === "selected" ? <><p>נבדוק אם אפשר לקרוא נתונים. רק אחרי קריאה מוצלחת נוכל להשתמש בהם בניתוח.</p><UIAction onClick={readExample}>לדמות את הקריאה הראשונה</UIAction></> : connections[provider] === "no_history" ? <p>החיבור זמין, אבל אין נתונים בתקופה שבדקנו. זה אינו אפס הזמנות. נמשיך עם הצעדים בתוכנית עד שיצטבר מידע.</p> : <p>אפשר להתחיל לבדוק את התוצאות. חיבור מקור אחד אינו מאפשר לנו לדעת הכול על המכירות.</p>}
          {provider === "meta" && <UIAction variant={connections.meta === "selected" ? "text" : "primary"} onClick={() => setStep("extras")}>{adsSaved ? "לראות את נתוני המודעות והמעקב" : "יש לכם מודעות? לחבר גם אותן"}</UIAction>}
          <Link href="/design/results" className={styles.textAction}>איך זה הופך לצעד בתוכנית? ←</Link>
        </>}
        {step === "extras" && <>
          <p>אם אתם מפרסמים בתשלום, נתוני ההוצאות והתוצאות יעזרו לנו לבדוק מה כדאי לשנות.</p>
          <label className={styles.field}>חשבון הפרסום<select value={adAccount} onChange={event => setAdAccount(event.target.value)}><option value="">לבחור לפי השם</option><option value="example-ads">פרג ושמרים · פרסום</option></select></label>
          <p className={styles.caption}>בחיבור אמיתי תידרשו לאשר בנפרד קריאה של נתוני המודעות.</p>
          <UIAction disabled={!adAccount} onClick={() => { setAdsSaved(true); setStep("pixel"); }}>לדמות אישור נתוני מודעות ולהמשיך</UIAction>
        </>}
        {step === "pixel" && <>
          <p>המעקב באתר עוזר לבדוק פעולות שקרו אחרי מודעות. אפשר לחבר אותו גם בהמשך.</p>
          <label className={styles.field}>המעקב של העסק<select value={pixel} onChange={event => { setPixel(event.target.value); setPixelChecked(false); }}><option value="">בלי מעקב כרגע</option><option value="example-pixel">החנות של פרג ושמרים</option></select></label>
          {pixel && <><UIAction onClick={() => setPixelChecked(true)}>לדמות בדיקת קבלת אירועים</UIAction>{pixelChecked && <p role="status">התקבלו אירועים מהחנות. הבדיקה אינה מאשרת סכומי רכישה או מניעת ספירה כפולה.</p>}</>}
          {!pixel && <><p className={styles.caption}>חשבון הפרסום נבחר. אפשר לבדוק נתוני מודעות גם בלי מעקב באתר.</p><PixelSetupGuide busy={false} onRefresh={() => { setPixel("example-pixel"); setPixelChecked(false); }} /></>}
        </>}
        <UIAction variant="text" onClick={() => setOpen(false)}>לסגור ולהמשיך בתוכנית</UIAction>
      </div>
    </UIDialog>
  </div></div>;
}
