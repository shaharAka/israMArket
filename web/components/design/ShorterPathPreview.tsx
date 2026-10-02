"use client";

import Link from "next/link";
import { useState } from "react";
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type NodeProps, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { BrandMark } from "@/lib/icons";
import styles from "./flow-board.module.css";
import preview from "./optional-preview.module.css";

type Mode = "full" | "quick";
type Screen = { id: string; title: string; body: string; action: string; detail: string; group?: boolean };
const entry: Screen = {
  id: "entry", title: "נכיר את העסק. נבנה תוכנית שמתאימה לכם.",
  body: "היכרות מלאה כברירת מחדל. אפשר לבחור הצצה ראשונית אם הזמן קצר.",
  action: "להתחיל לבנות תוכנית", detail: "נכיר את העסק, נבדוק את נקודת הפתיחה ונמליץ מה כדאי לקדם.",
};
const full: Screen[] = [
  { id: "full-business", title: "העסק ומה שמייחד אותו", body: "3 מסכים קיימים: שם, הצעה ויתרון.", action: "להכיר את הלקוחות", detail: "אותן שאלות שקיימות היום. אין איחוד או דילוג על תשובות במסלול המלא.", group: true },
  { id: "full-context", title: "הלקוחות וההקשר", body: "6 מסכים לחנות, 5 לשירותים. כולל קישורים ומה שכבר נוסה.", action: "לבדוק את נקודת הפתיחה", detail: "קהל, מה לקדם בחנות, עסקים דומים, שיווק קודם, אתר ורשתות ועונתיות. שירותים מדלגים על שאלת המוצרים.", group: true },
  { id: "full-numbers", title: "נקודת פתיחה והמלצה", body: "4 מסכים: מצב העסק, המלצה לצמיחה, תקציב ויעד.", action: "לראות מה למדנו", detail: "טווח נשאר טווח. מידע שלא יודעים נשאר חסר. ההמלצה מתחשבת בתקציב ובכמות העבודה שאפשר לקבל.", group: true },
  { id: "full-research", title: "מה למדנו על העסק", body: "סיכום המחקר הקיים, עם אפשרות לתקן.", action: "לראות את התוכנית", detail: "לפני התוכנית בודקים את המידע שנאסף. קישור לא תקין אינו נתון שיווקי, וקישור ציבורי אינו הרשאה לנתוני החשבון." },
  { id: "plan", title: "התוכנית שלכם", body: "המלצה, פעולה קרובה והנחות שנמשיך לבדוק.", action: "לשמור בחשבון", detail: "תוכנית מתמשכת. יעד עבודה מופיע רק כשאפשר לחשב אותו מהנתונים; הוא אינו הבטחה." },
  { id: "save", title: "אותה תוכנית, בתוך החשבון", body: "שומרים את ההקשר ומתחילים בפעולה שימושית אחת.", action: "לחזור לבחירת המסלול", detail: "החיבורים והחומרים מגיעים מתוך הפעולה. אין סיור חובה ואין צורך לחזור על היכרות שכבר הושלמה." },
];
const quick: Screen[] = [
  { id: "business", title: "מה העסק עושה?", body: "שם והצעה, כדי שהדוגמה תתחיל להיות שלכם.", action: "לעבור ללקוחות", detail: "מסך קצר עם שם העסק ומה מציעים. בלי תקציב ובלי פרטי קשר." },
  { id: "customer", title: "למי אתם עוזרים?", body: "קהל ראשוני. אפשר לומר שעוד לא יודעים.", action: "לעבור לאתר ולרשתות", detail: "זו נקודת פתיחה שנוכל לתקן יחד, ולא מסקנה שאומתה במחקר." },
  { id: "links", title: "איפה רואים את העסק?", body: "אתר, תיק עבודות או פרופיל. אפשר גם בלי קישור.", action: "לראות טיוטה ראשונית", detail: "קריאת מידע ציבורי בלבד. עוד אין חיבור לנתוני האתר או לרשתות." },
  { id: "draft", title: "ככה התוכנית יכולה להיראות", body: "טיוטה ראשונית עם כיוון ופעולה לדוגמה. בלי יעד או נתונים מומצאים.", action: "להמשיך להיכרות המלאה", detail: "אפשר להתרשם מהמבנה ומהדרך שבה נלווה את העסק. זו טיוטה, לא תוכנית שיווק שנבדקה." },
  { id: "complete", title: "ממשיכים מאיפה שעצרתם", body: "אותו מסלול מלא, עם התשובות שכבר נתתם.", action: "לראות את התוכנית המלאה", detail: "מציגים רק שאלות שעוד לא נענו, כולל בידול, עונתיות, מה נוסה, מספרים ותקציב. ההמלצה והיעד נבנים מחדש אחרי השלמת המידע. אפשר לעצור ולחזור.", group: true },
  ...full.slice(-2),
];
type PreviewNode = Node<{ screen: Screen }, "preview">;
const positions = [[700, 0], [350, 0], [0, 0], [0, 260], [350, 260], [700, 260], [700, 520], [350, 520]];
const nodeTypes = { preview: PreviewCard };
function PreviewCard({ data }: NodeProps<PreviewNode>) {
  return <div className={styles.proposalNode} dir="rtl"><Handle type="target" position={Position.Right} /><p>{data.screen.group ? "קבוצת מסכים · אינה שאלה אחת" : "הצעה לסקירה"}</p><h3>{data.screen.title}</h3><span>{data.screen.body}</span><Handle type="source" position={Position.Left} /></div>;
}

export function ShorterPathPreview() {
  const [mode, setMode] = useState<Mode>("full");
  const [selectedId, setSelectedId] = useState("entry");
  const screens = [entry, ...(mode === "full" ? full : quick)];
  const selected = screens.find(screen => screen.id === selectedId) ?? entry;
  const nodes: PreviewNode[] = screens.map((screen, i) => ({ id: screen.id, type: "preview", position: { x: positions[i][0], y: positions[i][1] }, data: { screen }, selected: screen.id === selected.id, ariaLabel: screen.title }));
  const edges = screens.slice(0, -1).map((screen, i) => ({ id: `${screen.id}-${i}`, source: screen.id, target: screens[i + 1].id, type: "smoothstep", label: i === 0 && mode === "quick" ? "רק לראות איך זה ייראה" : screen.action, style: { stroke: "var(--primary)", strokeDasharray: mode === "quick" ? "5 5" : undefined }, markerEnd: { type: MarkerType.ArrowClosed, color: "var(--primary)" }, labelStyle: { fontSize: 12, fontFamily: "var(--font-heebo)" }, labelBgStyle: { fill: "var(--canvas)" } }));
  function choose(next: Mode) { setMode(next); setSelectedId(next === "full" ? full[0].id : quick[0].id); }
  function advance() { setSelectedId(screens[(screens.findIndex(screen => screen.id === selected.id) + 1) % screens.length].id); }

  return <main className={styles.page} dir="rtl"><div className={styles.container}>
    <header className={styles.header}><Link className={styles.brand} href="/design/flows"><BrandMark />ללוח המסכים הקיים</Link><a href="https://github.com/shaharAka/israMArket/issues/69">ההצעה והדיון · #69</a></header>
    <section className={styles.intro}><div><h1>היכרות מלאה. הצצה כשזמנכם קצר.</h1><p className={styles.caption}>סקירה בלבד. המסלול המלא נשאר ברירת המחדל; השאלות באתר החי לא השתנו.</p></div></section>
    <div className={preview.routeHeading}><label>המסלול במפה<select value={mode} onChange={e => { setMode(e.target.value as Mode); setSelectedId("entry"); }}><option value="full">היכרות מלאה · ברירת המחדל</option><option value="quick">רק לראות איך זה ייראה · הצעה</option></select></label><details><summary>מה בדיוק נספר כאן?</summary><p>13 שלבי תשובה ואישור לחנות, 12 לשירותים, ואחריהם סיכום, תוכנית ושמירה. קבוצות המסכים במפה המלאה אינן קיצור של השאלות.</p></details></div>
    <div className={styles.proposalLayout}><div className={styles.proposalCanvas} dir="ltr"><ReactFlow key={mode} nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodeClick={(_, n) => setSelectedId(n.data.screen.id)} fitView fitViewOptions={{ nodes: nodes.slice(0, 3), maxZoom: 1, padding: .12 }} minZoom={.3} maxZoom={1.5} nodesDraggable={false} nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null}><Background /><Controls showInteractive={false} /></ReactFlow></div>
    <aside className={`${styles.preview} ${preview.reviewPane}`} aria-label="תצוגת המסך המוצע"><div className={styles.screen}>
      <p className={styles.state}>{selected.group ? "קבוצת מסכים לסקירה" : "סקיצת מסך לסקירה · אינה זרימה חיה"}</p><h3>{selected.title}</h3><p>{selected.detail}</p>
      {selected.id === "entry" ? <div className={preview.entryActions}><button className={preview.primary} onClick={() => choose("full")}>להתחיל לבנות תוכנית</button><button className={preview.quiet} onClick={() => choose("quick")}>רק לראות איך זה ייראה</button><small>ההצצה היא טיוטה. את הפרטים משלימים כשנוח לכם.</small></div> : <>
        {selected.id === "draft" || selected.id === "plan" ? <div className={styles.planSample}><span>{selected.id === "draft" ? "טיוטה לדוגמה · מעצבת פנים · ללא מחקר" : "מבנה לדוגמה · אינו תוכנית שנוצרה כאן"}</span><strong>להראות איך החלטת עיצוב אחת פתרה בעיה של לקוח.</strong><dl><div><dt>למה הכיוון הזה?</dt><dd>פרויקט אמיתי יכול להמחיש ללקוחות מה מקבלים מהשירות. זו השערה לבדיקה.</dd></div><div><dt>הפעולה הראשונה</dt><dd>לבחור שירות ופרויקט אחד שמותר לכם להציג.</dd></div><div><dt>מה עוד נבדוק</dt><dd>למי פונים, מה נחשב פנייה מתאימה, וכמה עבודות היומן יכול לקבל.</dd></div><div><dt>איך נמשיך ללמוד?</dt><dd>נבדוק לחיצות ליצירת קשר, ותעדכנו אילו פניות התאימו. אם יש לחיצות בלי פניות, נבדוק מה כדאי להבהיר בהצעה.</dd></div></dl>{selected.id === "draft" && <p className={preview.draftLimit}>עוד לא נבדקו התקציב, קיבולת העבודה והנתונים. אין כאן יעד מספרי.</p>}</div> : null}
        <button className={preview.primary} onClick={advance}>{selected.action}</button><button className={preview.quiet} onClick={() => setSelectedId("entry")}>לבחירת המסלול</button>
      </>}
    </div></aside></div>
    <p className={styles.mapNote}>לפני מימוש ההצצה: לשמור תשובות ומקום עצירה, לאפשר חזרה למסלול המלא בלי לחזור על שאלות, ולהתאים את המתכנן למידע חלקי. זהו חוזה מוצע, לא יכולת שכבר קיימת.</p>
  </div></main>;
}
