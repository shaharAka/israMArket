"use client";

import Link from "next/link";
import { useState } from "react";
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type NodeProps, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { BrandMark } from "@/lib/icons";
import styles from "./flow-board.module.css";

const screens = [
  { id:"business", title:"מה העסק עושה?", body:"שם העסק, מה מציעים, ומוצרים או שירותים.", action:"לעבור ללקוחות", detail:"משלבים שם והצעה במסך קצר. בלי פרטי קשר ובלי תקציב בשלב הזה." },
  { id:"customer", title:"למי אתם עוזרים?", body:"קהל מומלץ וסיבה לבחור בעסק. אפשר לתקן או לומר שעוד לא יודעים.", action:"לעבור לאתר ולרשתות", detail:"המלצה מתוך ההצעה, עם שאלה אחת על היתרון שלכם. מידע חסר נשאר חסר." },
  { id:"links", title:"איפה רואים את העסק?", body:"אתר, תיק עבודות או פרופיל. אפשר להמשיך בלי קישור.", action:"לראות כיוון ראשון", detail:"קריאת קישורים ציבוריים בלבד. קישור לפרופיל אינו חיבור לחשבון או הרשאה לנתונים." },
  { id:"direction", title:"כבר יש כיוון לבדיקה", body:"הצעה ראשונית, עם הסבר מה עוד לא ידוע. בלי יעד מספרי או תוצאות מומצאות.", action:"לדייק את נקודת הפתיחה", detail:"הערך הראשון אחרי שלושה מסכי היכרות. כיוון ראשוני בלבד; תוכנית עם יעד נבנית אחרי מספרים ותקציב." },
  { id:"baseline", title:"איפה העסק היום?", body:"טווחים פשוטים שמתאימים למודל העסק. ״לא יודעים״ היא תשובה.", action:"לעבור לתקציב", detail:"שומרים טווח כמו שנמסר, בלי להחליף אותו באמצע הטווח. זה אותו בסיס שישמש למדידה." },
  { id:"budget", title:"מה אפשר להשקיע?", body:"תקציב וקיבולת. שירותים נמדדים בפניות מתאימות ועבודה שאפשר לקבל.", action:"לראות את ההמלצה", detail:"מונעים המלצה שאינה מתאימה לתקציב או ליומן. לא ממציאים סכום עסקה ללקוח תוכנה." },
  { id:"plan", title:"התוכנית שלכם", body:"המלצה לצמיחה, יעד עבודה אם ניתן לחשב, פעולה קרובה והנחות שצריך לבדוק.", action:"לשמור בחשבון", detail:"כאן מאשרים את הכיוון ומתקנים הנחות. יעד שאי אפשר לחשב מוצג כחסר, ואינו הבטחה." },
  { id:"save", title:"שומרים וממשיכים", body:"הרשמה קצרה. אותה תוכנית, עם פעולה שימושית אחת.", action:"לבחור מה לקדם", detail:"ההקשר והתשובות עוברים לחשבון. חיבורים וחומרים מגיעים מתוך הפעולה, בלי סיור חובה." },
  { id:"context", title:"מעמיקים כשזה מועיל", body:"מתחרים, עונתיות ומה שכבר נוסה — לצד החלטה בתוכנית.", action:"לחזור לתוכנית", detail:"כל מידע שהמתכנן צריך נשמר. המימוש ידרוש שינוי בחוזה המתכנן לפני העברת שאלות; אין דילוג שקט על תלות קיימת." },
];
type PreviewNode = Node<{ screen: typeof screens[number] }, "preview">;
const positions = [[700,0],[350,0],[0,0],[0,260],[350,260],[700,260],[700,520],[350,520],[0,520]];
const nodes: PreviewNode[] = screens.map((screen,i)=>({id:screen.id,type:"preview",position:{x:positions[i][0],y:positions[i][1]},data:{screen},ariaLabel:screen.title}));
const edges = screens.slice(0,-1).map((screen,i)=>({id:`${screen.id}-${i}`,source:screen.id,target:screens[i+1].id,type:"smoothstep",label:screen.action,style:{stroke:"var(--primary)",strokeDasharray:"5 5"},markerEnd:{type:MarkerType.ArrowClosed,color:"var(--primary)"},labelStyle:{fontSize:12,fontFamily:"var(--font-heebo)"},labelBgStyle:{fill:"var(--canvas)"}}));
const nodeTypes = { preview: PreviewCard };
function PreviewCard({data}:NodeProps<PreviewNode>) {
  return <div className={styles.proposalNode} dir="rtl"><Handle type="target" position={Position.Right}/><p>הצעה לסקירה</p><h3>{data.screen.title}</h3><span>{data.screen.body}</span><Handle type="source" position={Position.Left}/></div>;
}

export function ShorterPathPreview() {
  const [selected,setSelected]=useState(screens[0]);
  return <main className={styles.page} dir="rtl"><div className={styles.container}>
    <header className={styles.header}><Link className={styles.brand} href="/design/flows"><BrandMark/>ללוח המסכים הקיים</Link><a href="https://github.com/shaharAka/israMArket/issues/69">ההצעה והדיון · #69</a></header>
    <section className={styles.intro}><div><h1>כיוון ראשון אחרי שלושה מסכים.</h1><p>הצעה לסקירה לפני מימוש. היום יש 13 שלבי תשובה ואישור לחנות, ו־12 לשירותים, לפני חשיפת התוכנית. גם ההמלצה והיעד נספרים כאן.</p><p className={styles.caption}>מוצע: חמישה מסכי קלט עד התוכנית, כיוון ראשוני באמצע, והעמקה בהקשר אחרי ההרשמה. אין שינוי בזרימה החיה.</p></div></section>
    <div className={styles.proposalLayout}><div className={styles.proposalCanvas} dir="ltr"><ReactFlow nodes={nodes.map(n=>({...n,selected:n.id===selected.id}))} edges={edges} nodeTypes={nodeTypes} onNodeClick={(_,n)=>setSelected(n.data.screen)} fitView fitViewOptions={{nodes:nodes.slice(0,4),maxZoom:1,padding:.12}} minZoom={.3} maxZoom={1.5} nodesDraggable={false} nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null}><Background/><Controls showInteractive={false}/></ReactFlow></div>
    <aside className={styles.preview}><div className={styles.screen}><p className={styles.state}>מסך מוצע · לחיצה במפה מחליפה את התצוגה</p><h3>{selected.title}</h3><p>{selected.detail}</p>{selected.id==="direction" || selected.id==="plan" ? <div className={styles.planSample}><span>דוגמה למעצבת · אינה תוצאת מחקר</span><strong>להראות איך החלטת עיצוב אחת פתרה בעיה של לקוח.</strong><dl><div><dt>הפעולה הראשונה</dt><dd>לבחור שירות ופרויקט אחד שמותר לכם להציג.</dd></div><div><dt>מה עוד נבדוק</dt><dd>למי פונים, מה נחשב פנייה מתאימה, וכמה עבודות היומן יכול לקבל.</dd></div></dl></div> : null}<button className={styles.closePreview} onClick={()=>setSelected(screens[(screens.findIndex(s=>s.id===selected.id)+1)%screens.length])}>{selected.action}</button></div></aside></div>
    <p className={styles.mapNote}>תנאי למימוש: לשמר כל תשובה, לשנות ולבדוק את תלות המתכנן במידע שנדחה, ולהציג חוסר ודאות. ההצעה מחכה לאישור שלך ב־#69.</p>
  </div></main>;
}
