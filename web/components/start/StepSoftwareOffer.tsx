"use client";

import { Copy } from "@/components/language/LanguageProvider";

import { useState } from "react";
import type { SoftwareContext } from "@/lib/draft";
import { StepShell, TextInput } from "./ui";
import type { StepProps } from "./steps";
import form from "./form.module.css";

export function StepSoftwareOffer(props: StepProps) {
  const { flow, setDraft, next } = props;
  const value: SoftwareContext = flow.draft.software ?? { stage: "unknown", buying_motion: "unknown", problem: "", buyer: "", market: "" };
  const [error, setError] = useState("");
  const set = (patch: Partial<SoftwareContext>) => { setError(""); setDraft({ software: { ...value, ...patch } }); };
  return <StepShell {...props} title="מה רוצים לקדם קודם?" why="נכיר את החברה כולה, ונמקד את התוכנית במוצר ובהצעה אחת להתחלה." primary="למי המוצר הזה עוזר?" onPrimary={() => {
    if ((value.focus_product || "").trim().length < 2) { setError("כתבו איזה מוצר לקדם קודם. אם עוד אין שם, תיאור קצר מספיק."); return; }
    next();
  }}>
    <TextInput id="software-focus" label="איזה מוצר לקדם קודם?" value={value.focus_product || ""} onChange={focus_product => set({ focus_product })} placeholder="למשל: מערכת תיאום הפגישות, מתוך כלי הניהול שלנו" maxLength={120} />
    <TextInput id="software-offer" label="מה מציעים ללקוח כרגע? (אפשר להשלים אחר כך)" value={value.commercial_offer || ""} onChange={commercial_offer => set({ commercial_offer })} placeholder="למשל: ניסיון ללא תשלום, מנוי חודשי או פגישת הדגמה" maxLength={400} />
    <details className="border-t border-[var(--rule)] pt-2">
      <summary className="min-h-11 cursor-pointer py-3 text-[14px] font-medium"><Copy text="מה כבר אפשר להראות? (לא חובה)" /></summary>
      <TextInput id="software-evidence" label="יכולת שעובדת, הדגמה או חומר שיש לכם" value={value.product_evidence || ""} onChange={product_evidence => set({ product_evidence })} placeholder="למשל: תיאום פגישה ושליחת תזכורת; יש הקלטת מסך של המוצר" maxLength={600} />
    </details>
    <p className="text-[14px] leading-6 text-[var(--ink-soft)]"><Copy text="בהמשך אפשר לצרף את האתר. נבדוק מה הוא מספר על המוצרים, היכולות ודרך ההצטרפות. אפשר להתחיל גם בלעדיו." /></p>
    {error ? <p role="alert" className={form.error}><Copy text={error} /></p> : null}
  </StepShell>;
}
