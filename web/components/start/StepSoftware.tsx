"use client";

import { useState } from "react";
import type { SoftwareContext } from "@/lib/draft";
import { StepShell, TextInput } from "./ui";
import type { StepProps } from "./steps";
import form from "./form.module.css";

const EMPTY: SoftwareContext = { stage: "unknown", buying_motion: "unknown", problem: "", buyer: "", market: "" };

export function StepSoftware(props: StepProps) {
  const { flow, setDraft, next } = props;
  const value = flow.draft.software ?? EMPTY;
  const [error, setError] = useState("");
  const set = (patch: Partial<SoftwareContext>) => { setError(""); setDraft({ software: { ...value, ...patch } }); };
  return <StepShell {...props} title="מה המוצר פותר, ולמי?" primary="מה מיוחד במוצר שלכם" why="נבנה תוכנית לפי שלב המוצר והדרך שבה לקוחות מתחילים להשתמש בו." onPrimary={() => {
    if (value.problem.trim().length < 3 || value.buyer.trim().length < 3) { setError("ספרו בקצרה איזו בעיה אתם פותרים ולמי. את השאר אפשר להשלים בהמשך."); return; }
    next();
  }}>
    <TextInput id="software-problem" label="איזו בעיה המוצר פותר?" value={value.problem} onChange={problem => set({ problem })} placeholder="למשל: סטודיואים מאבדים זמן על תיאום פגישות ומעקב אחרי תשלומים" maxLength={400} />
    <TextInput id="software-buyer" label="מי ישתמש בו, ומי מחליט לשלם?" value={value.buyer} onChange={buyer => set({ buyer })} placeholder="למשל: מנהלות סטודיו קטן משתמשות ומחליטות על הרכישה" maxLength={300} />
    <div className="grid gap-5 sm:grid-cols-2">
      <label className={form.label}>איפה המוצר עומד היום?
        <select className={`${form.input} mt-2`} value={value.stage} onChange={e => set({ stage: e.target.value as SoftwareContext["stage"] })}>
          <option value="unknown">עוד לא בטוחים</option><option value="idea">רעיון או בבנייה</option><option value="beta">בטא / משתמשים ראשונים</option><option value="live">מוצר פעיל</option>
        </select>
      </label>
      <label className={form.label}>איך לקוח מתחיל?
        <select className={`${form.input} mt-2`} value={value.buying_motion} onChange={e => set({ buying_motion: e.target.value as SoftwareContext["buying_motion"] })}>
          <option value="unknown">עוד לא החלטנו</option><option value="self_serve">נרשמים ומנסים לבד</option><option value="demo">מבקשים הדגמה או שיחה</option><option value="waitlist">מצטרפים לרשימת המתנה</option>
        </select>
      </label>
    </div>
    <TextInput id="software-market" label="באיזה שוק ושפה מתחילים? (לא חובה)" value={value.market} onChange={market => set({ market })} placeholder="למשל: עסקים קטנים בישראל, בעברית" maxLength={200} />
    <p className="text-[14px] leading-6 text-[var(--ink-soft)]">ההרשמה היא התחלה. בהמשך נבדוק גם מי השתמש במוצר ומי שילם. לא ננחש הכנסות או מספר משתמשים.</p>
    {error ? <p role="alert" className={form.error}>{error}</p> : null}
  </StepShell>;
}
