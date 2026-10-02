"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { BrandMark, IconArrowLeft, IconChevron } from "@/lib/icons";
import { emptyFlow, type FlowState } from "@/lib/draft";
import { StepName, StepWhat, StepDifferent, StepTried, type StepProps } from "@/components/start/steps";
import { StepBaseline } from "@/components/start/StepNumbers";
import { StepBudget } from "@/components/start/StepGoal";
import { isStepId, nextStepLabel } from "@/components/start/script";
import { UIAction } from "./Controls";
import { FlowCanvas } from "./FlowCanvas";
import { FLOW_NODES, FLOW_SOURCE, PERSONAS, nextFor, nodesFor, sourceUrl, type FlowNode, type FlowPersona, type FlowPhase, type FlowCase } from "@/lib/uxFlows";
import styles from "./flow-board.module.css";
import Image from "next/image";
import { flowCapture } from "@/lib/flowScreens";

const PHASES = [{ value: "before", label: "לפני הרשמה" }, { value: "after", label: "אחרי הרשמה" }, { value: "ongoing", label: "חוזרים ומתקדמים" }];
const ISSUE = "https://github.com/shaharAka/israMArket/issues/65";
const ACTUAL_COMPONENTS: Record<string, ComponentType<StepProps>> = { name: StepName, what: StepWhat, different: StepDifferent, tried: StepTried, baseline: StepBaseline, budget: StepBudget };

function sample(persona: FlowPersona): FlowState {
  const flow = emptyFlow();
  flow.modelConfirmed = true;
  flow.draft = { ...flow.draft, business_name: PERSONAS[persona].name, business_model: PERSONAS[persona].model,
    offerings: persona === "store" ? "מארזי שישי ולחם טרי" : persona === "designer" ? "עיצוב מותג ואתרים לעסקים קטנים" : "תוכנית שיווק וליווי לבעלי עסקים",
  };
  return flow;
}

/** Local review state only: no account, consent, generation, publishing or analytics calls. */
export function FlowBoard({ initialPersona, initialStep }: { initialPersona?: string; initialStep?: string }) {
  const firstPersona: FlowPersona = initialPersona && Object.hasOwn(PERSONAS, initialPersona) ? initialPersona as FlowPersona : "store";
  const firstNode = FLOW_NODES.find(n => n.id === initialStep && !(n.id === "grow" && firstPersona !== "store")) ?? FLOW_NODES[0];
  const [persona, setPersona] = useState<FlowPersona>(firstPersona);
  const [phase, setPhase] = useState<FlowPhase>(firstNode.phase);
  const [chapter, setChapter] = useState(initialStep ? firstNode.group : "opening");
  const [selected, setSelected] = useState(firstNode.id);
  const [scenario, setScenario] = useState<FlowCase>("normal");
  const [view, setView] = useState(initialStep ? "screen" : "map");
  const [history, setHistory] = useState<string[]>([]);
  const [flow, setFlow] = useState(() => sample(firstPersona));
  const previewRef = useRef<HTMLElement>(null);
  const filterRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const query=window.matchMedia("(max-width: 850px)");
    const sync=()=>{ if (filterRef.current) filterRef.current.open=!query.matches; };
    sync(); query.addEventListener("change",sync);
    return ()=>query.removeEventListener("change",sync);
  }, []);
  useEffect(() => {
    if (view !== "screen") return;
    previewRef.current?.focus({preventScroll:true});
    if (window.innerWidth < 850) previewRef.current?.scrollIntoView({block:"start",behavior:"instant"});
  }, [selected,view]);
  const branchPersona: FlowPersona = flow.draft.business_model === "services" ? "designer" : "store";
  const node = FLOW_NODES.find(n => n.id === selected) ?? firstNode;
  const following = FLOW_NODES.find(n => n.id === nextFor(node, branchPersona))!;
  const share = `/design/flows?persona=${persona}&step=${node.id}`;

  function go(id: string, record = false) {
    const to = FLOW_NODES.find(n => n.id === id);
    if (!to) return;
    if (record) setHistory(items => [...items.slice(-5), `${node.title} → ${to.title}`]);
    setSelected(to.id); setPhase(to.phase); setChapter(to.group); setScenario("normal");
  }
  function choosePersona(value: string) {
    const next = value as FlowPersona;
    setPersona(next); setFlow(sample(next)); setHistory([]); setScenario("normal");
    if (selected === "grow" && next !== "store") go("baseline");
  }
  const common: StepProps = { flow, update: fn => setFlow(fn), setDraft: patch => setFlow(f => ({ ...f, draft: { ...f.draft, ...patch } })),
    next: () => go(nextFor(node, branchPersona), true), nextLabel: isStepId(node.id) ? nextStepLabel(node.id, flow) : undefined, editLinks: () => go("links"),
    reflection: null, focus: false, direction: "fwd",
  };
  const RealStep = ACTUAL_COMPONENTS[node.id];
  const capture = !RealStep && scenario === "normal" ? flowCapture(node.id) : null;

  return <div className={styles.page} dir="rtl"><div className={styles.container}>
    <header className={styles.header}><Link href="/design" className={styles.brand}><BrandMark />ישראמארקט</Link><div><Link href="/design/flows/shorter">הצעת קיצור ההיכרות</Link><a href={ISSUE} target="_blank" rel="noopener noreferrer">דיון משותף ב-GitHub</a><Link href="/design">לספריית העיצוב <IconArrowLeft /></Link></div></header>
    <section className={styles.intro}><div><h1>מסכים, פעולות ומעברים.</h1><p className={styles.caption}>גרירה להזזה · + / − להגדלה · לחיצה לפתיחת מסך · קו מקווקו: הצעה. נתוני הדוגמה אינם חשבון לקוח.</p></div></section>
    <details ref={filterRef} className={styles.filters} open><summary>סינון המסלול · {PERSONAS[persona].label} · {PHASES.find(p=>p.value===phase)?.label}</summary><div className={styles.toolbar}>
      <label>עסק<select value={persona} onChange={e=>choosePersona(e.target.value)}>{Object.entries(PERSONAS).map(([value,p])=><option key={value} value={value}>{p.label}</option>)}</select></label>
      <label>מסע<select value={phase} onChange={e=>go(e.target.value==="before"?"landing":e.target.value==="after"?"plan-first":"results")}>{PHASES.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}</select></label>
      <label>פרק<select value={chapter} onChange={e=>setChapter(e.target.value)}><option value="opening">תחילת המסע</option><option value="all">כל הלוח</option>{[...new Set(nodesFor(branchPersona,phase).map(n=>n.group))].map(g=><option key={g} value={g}>{g}</option>)}</select></label>
      <p>{PERSONAS[persona].name} · {PERSONAS[persona].goal}</p>
    </div></details>
    <div className={styles.canvasLayout} data-inspecting={view === "screen" || undefined}>
    <FlowCanvas key={`${phase}-${branchPersona}-${persona}`} phase={phase} branch={branchPersona} persona={persona} selected={selected} chapter={chapter} inspect={id=>{go(id);setView("screen");}} />
    {view === "screen" && <section ref={previewRef} tabIndex={-1} className={styles.workspace} aria-label={`מסך ${node.title} והמעבר שלו`} onKeyDown={e=>{if(e.key==="Escape")setView("map");}}>
      <button type="button" className={styles.closePreview} onClick={()=>setView("map")}>לסגור תצוגת מסך</button>
      <div className={styles.preview}>
        <div className={styles.previewTop}><span>{RealStep && scenario === "normal" ? "רכיב השאלה הקיים, עם תשובות מקומיות" : capture ? "צילום העמוד בדמו המאפייה · 2.10.2026" : "סקיצת מצב · אינה צילום של החשבון"}</span><code>{node.route}</code></div>
        {capture && <a href={capture} target="_blank" rel="noopener noreferrer" className={styles.captureLink}><Image src={capture} alt={`העמוד הקיים: ${node.title}, נתוני דמו`} width={1170} height={615} unoptimized/><span>לפתוח צילום בגודל מלא</span></a>}
        <div className={styles.screen} key={`${persona}-${node.id}-${scenario}`}>
          <div className={styles.screenBrand}><BrandMark /><strong>{PERSONAS[persona].name}</strong></div>
          {scenario !== "normal" ? <><p className={styles.state}>{scenario === "failure" ? "ניסיון שלא הצליח" : scenario === "cancel" ? "המשתמש עצר את הפעולה" : "אין מספיק מידע"}</p><h3>מה נשמר, ואיך ממשיכים?</h3><p>{node.recovery}</p><UIAction onClick={() => setScenario("normal")}>לחזור לשלב ולנסות שוב</UIAction><UIAction variant="text" onClick={() => go(nextFor(node, branchPersona), true)}>לראות את ההמשך במפה</UIAction><small>המחשת מסלול התאוששות, לא ביצוע פעולה או התחייבות שהדילוג קיים בכל שלב.</small></> : RealStep ? <RealStep {...common} /> : <Schematic node={node} persona={persona} next={() => go(nextFor(node, branchPersona), true)} alternate={() => node.alternate && go(node.alternate.next, true)} branch={id=>go(id,true)} />}
        </div>
        <div className={styles.transition}><span>לחיצה</span><strong>{RealStep ? common.nextLabel ?? node.action : node.action}</strong><IconArrowLeft /><span>{following.title}</span></div>
        <p className={styles.transitionNote}>{node.transition}</p>
        {history.length > 0 && <details className={styles.details}><summary><IconChevron />המעברים שניסיתם</summary><ol>{history.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ol></details>}
      </div>
      <aside className={styles.inspector} aria-label="פרטי השלב"><div className={styles.selectedHeading}><p>{node.proposed ? "הצעת שיפור, פתוחה למימוש" : "ההתנהגות הקיימת בקוד"}</p><h2>{node.title}</h2></div><p>{node.aim}</p>
        <label className={styles.case}>לבדוק מצב<select value={scenario} onChange={e => setScenario(e.target.value as FlowCase)}><option value="normal">פעולה רגילה</option><option value="failure">כשל וניסיון חוזר</option><option value="cancel">ביטול הפעולה</option><option value="missing">מידע חסר</option></select></label>
        <dl className={styles.facts}><div><dt>מה נשמר?</dt><dd>{node.saved}</dd></div><div><dt>כדאי לבדוק במוצר</dt><dd>{node.review}</dd></div></dl>
        <details className={styles.details}><summary><IconChevron />איך נמדוד את השלב?</summary><p>{node.measure}</p><code>{node.event}</code><p>הצעת מכשור, לא אירוע שכבר נשלח. ללא תוכן תשובות, אימיילים, קישורים פרטיים או נתוני לקוחות בתוך מאפייני האירוע.</p></details>
        <details className={styles.details}><summary><IconChevron />מקור והעמוד הקיים</summary><p>מיפוי מתוך גרסה <code>{FLOW_SOURCE.slice(0,7)}</code>. סקיצות מסבירות את המבנה; פתיחת העמוד דורשת את מצב החשבון המתאים.</p><a href={sourceUrl(node.source)} target="_blank" rel="noopener noreferrer">למקור של ההתנהגות</a><Link href={node.route === "/start" ? "/start?mock=1" : node.route} target="_blank">לפתוח את העמוד הקיים</Link></details>
        <div className={styles.reviewLinks}><Link href={share}>קישור קבוע לשלב הזה</Link><a href={ISSUE} target="_blank" rel="noopener noreferrer">לתעד החלטה ב-#65</a></div>
      </aside>
    </section>}
    </div>
    {persona === "designer" && <section className={styles.review}><h2>המסלול של נותנת שירות</h2><p>כבר קיים: מודל שירותים, פניות, שווי לקוח וקיבולת. כעת אפשר להתחיל משירות אחד ותמונה אחת, עם בדיקת הסגנון. עדיין נשארו שאלות כמעט באותו אורך כמו חנות, ומדידה שאינה יודעת לבדה איזו פנייה התאימה או הפכה לפרויקט.</p><ol className={styles.funnel}><li>עניין בתיק עבודות</li><li>לחיצה ליצירת קשר</li><li>פנייה שהתקבלה</li><li>פנייה מתאימה</li><li>פרויקט שנסגר</li></ol><p>השלבים אינם אותו נתון. קליק ניתן למדידה; התאמה וסגירה דורשות דיווח בעלים או חיבור מתאים. אין כאן מספרים מומצאים.</p><a href="https://github.com/shaharAka/israMArket/issues/67" target="_blank" rel="noopener noreferrer">סקירה ושיפורים לנותני שירותים · #67</a></section>}
    {persona === "isramarket" && <section className={styles.review}><h2>נשתמש במוצר כדי לשווק את המוצר</h2><p>ההשערה: דוגמה קצרה שמתחילה בבעיה של בעל העסק ומראה תוכנית ופעולה אחת תוביל לשימוש, יותר מהבטחה כללית ל״AI לשיווק״. זו השערה לבדיקה.</p><ol className={styles.funnel}><li>ביקור מקישור מסומן</li><li>התחלת היכרות</li><li>שמירת תוכנית בחשבון</li><li>קריאת נתונים או פוסט ראשון</li><li>חזרה בשבוע הבא</li></ol><p>מודל ״שירותים״ הוא כרגע קירוב בלבד: הוא שואל על פניות ועסקאות, ולא על הפעלת מנוי בתוכנה. אין מחליף עסקים או פרסום אוטומטי, ואירועי ההפעלה האלה עדיין דורשים מכשור. הפיילוט יעבור את הזרימה הרגילה כדי לגלות גם את הפערים האלה.</p><a href="https://github.com/shaharAka/israMArket/issues/66" target="_blank" rel="noopener noreferrer">הפיילוט והנכסים שצריך לחבר · #66</a></section>}
    <footer className={styles.footer}><span>מפה, פעולה, התאוששות, ראיה. ההחלטות המשותפות נשמרות ב-GitHub.</span><Link href="/design/connections">לתצוגת החיבורים המפורטת <IconArrowLeft /></Link></footer>
  </div></div>;
}

function Schematic({ node, persona, next, alternate, branch }: { node: FlowNode; persona: FlowPersona; next: () => void; alternate: () => void; branch: (id:string)=>void }) {
  const isPlan = ["quarter", "plan-first", "dashboard", "decision", "next-month"].includes(node.id);
  return <><p className={styles.state}>{node.proposed ? "כיוון מוצע" : "מבנה המסך"}</p><h3>{node.headline}</h3><p>{node.body}</p>
    {isPlan && <div className={styles.planSample}><span>כיוון העבודה</span><strong>{PERSONAS[persona].goal}</strong><dl><div><dt>מה ננסה</dt><dd>{persona === "store" ? "פוסט שמסביר מה במארז ואיך מזמינים." : persona === "designer" ? "פרויקט אחד: הצורך, ההחלטה המקצועית והתוצאה." : "דוגמה מתוכנית אמיתית ומה היא עוזרת לבעל העסק לעשות."}</dd></div><div><dt>איך נדע</dt><dd>{persona === "store" ? "כניסות לעמוד ההזמנה, ואז הזמנות שנמדדו או דווחו." : persona === "designer" ? "עניין וקליקים בנפרד מפניות מתאימות ומעבודה שנסגרה." : "שמירת תוכנית ופעולה ראשונה, מעבר לביקור באתר."}</dd></div></dl></div>}
    {node.id === "published" && <p className={styles.sampleNotice}>דיווח ״פרסמתי״ אינו הוכחה לביצועי הפוסט.</p>}
    <UIAction onClick={next}>{node.action}</UIAction>{node.alternate && <UIAction variant="text" onClick={alternate}>{node.alternate.label}</UIAction>}
    {node.branches?.map(option=><UIAction key={option.next} variant="text" onClick={()=>branch(option.next)}>{option.label}</UIAction>)}
    <small>לחיצה מקדמת רק את תצוגת ה-UX. התוכן עסקי לדוגמה.</small>
  </>;
}
