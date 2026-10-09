"use client";

import { Copy } from "@/components/language/LanguageProvider";

import Link from "next/link";
import { useState } from "react";
import { GoogleButton, OrDivider } from "@/components/GoogleButton";
import { ApiError, endpoints } from "@/lib/api";
import type { StepProps } from "./steps";
import { StepShell, TextInput } from "./ui";
import form from "./form.module.css";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Save: an account (Google, or email + password with the same rules as /signup), then the
 * discovery draft becomes the business. Legacy callers may also save a plan. No personal name is asked: the owner has already told
 * us about the business.
 */
export function StepSave(
  props: StepProps & {
    researchOnly?: boolean;
    loggedIn: boolean;
    saving: boolean;
    saveError: string;
    onSave: () => Promise<void>;
  },
) {
  const { loggedIn, saving, saveError, onSave } = props;
  const researchOnly = props.researchOnly;
  const savingLabel = researchOnly ? "שומרים את ההיכרות…" : "שומרים את התוכנית…";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const busy = pending || saving;

  async function submit() {
    setError("");
    if (!EMAIL.test(email.trim())) {
      setError("הזינו אימייל מלא, למשל noa@bakery.co.il");
      return;
    }
    if (password.length < 8) {
      setError("הסיסמה צריכה לפחות 8 תווים.");
      return;
    }
    setPending(true);
    try {
      await endpoints.register({
        email: email.trim(),
        password,
      });
    } catch (err) {
      setPending(false);
      if (err instanceof ApiError && err.status === 409) {
        setError("כבר יש חשבון עם האימייל הזה. אפשר להיכנס, ומה שבנינו יחכה כאן.");
      } else if (err instanceof ApiError && err.status === 422) {
        setError("האימייל או הסיסמה לא נראים תקינים. בדקו ונסו שוב.");
      } else if (err instanceof ApiError && err.status === 429) {
        setError("יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.");
      } else {
        setError(err instanceof Error && err.message ? err.message : "לא הצלחנו לפתוח את החשבון. נסו שוב.");
      }
      return;
    }
    setPending(false);
    await onSave();
  }

  if (loggedIn) {
    return (
      <StepShell
        {...props}
        title={researchOnly ? "מכאן נבנה את השיווק שלכם" : "נשמור את התוכנית"}
        why={researchOnly ? "נשמור את מה שסיפרתם. בפנים נמשיך את המחקר, נחבר את הכלים ונבנה תוכנית ופוסטים לאישורכם." : "אתם מחוברים לחשבון. נשמור את העסק ואת התוכנית שלכם, ונתחיל מהמדידה."}
        primary={saving ? savingLabel : researchOnly ? "להמשיך בחשבון שלי" : "לשמור את התוכנית ולהיכנס"}
        primaryDisabled={saving}
        onPrimary={() => void onSave()}
      >
        {saveError ? (
          <p role="alert" className={form.error}>
            <Copy text={saveError} />
          </p>
        ) : null}
      </StepShell>
    );
  }

  return (
    <StepShell
      {...props}
      title={researchOnly ? "מכאן נבנה את השיווק שלכם" : "נשמור את התוכנית"}
      why={researchOnly ? "כבר התחלנו להכיר את העסק. אחרי פתיחת החשבון נעמיק בשאלות ובמחקר, נחבר את הכלים שלכם ונבנה תוכנית שממנה ניצור פוסטים. אין צורך לחבר הכול כדי להתקדם." : props.flow.draft.business_model === "saas" ? "התוכנית מחכה לכם בפנים. נבחר נושא וחומר אמיתי מהמוצר, נכין פוסטים לאישורכם ונחבר את המדידה הזמינה." : props.flow.draft.business_model === "services" ? "התוכנית מחכה לכם בפנים. נבחר שירות או דוגמה מעבודה, נכין פוסטים לאישורכם ונחבר את המדידה הזמינה." : "התוכנית מחכה לכם בפנים. נבחר מה להבליט ותמונות של העסק, נכין פוסטים לאישורכם ונחבר את המדידה הזמינה."}
      primary={busy ? (saving ? savingLabel : "פותחים חשבון…") : researchOnly ? "לפתוח חשבון ולהמשיך" : "לפתוח חשבון ולהיכנס לתוכנית"}
      primaryDisabled={busy}
      onPrimary={() => void submit()}
    >
      {/* The draft is already in this browser (saveFlow on every answer). Google sends the
          owner back to /start?resume=save, and the interview saves it from there with the same
          from-draft call as the email path below. */}
      <GoogleButton next="/start?resume=save" back="/start" disabled={busy} />
      <OrDivider />
      <TextInput
        id="signup-email"
        label="אימייל"
        value={email}
        onChange={(value) => {
          setError("");
          setEmail(value);
        }}
        placeholder="noa@bakery.co.il"
        dir="ltr"
        inputMode="email"
        autoComplete="email"
        maxLength={200}
      />
      <div>
        <label htmlFor="signup-password" className={form.label}>
          <Copy text="סיסמה" /> <small><Copy text="(לפחות 8 תווים)" /></small>
        </label>
        <input
          id="signup-password"
          type="password"
          dir="ltr"
          value={password}
          onChange={(event) => {
            setError("");
            setPassword(event.target.value);
          }}
          autoComplete="new-password"
          placeholder="••••••••"
          className={`${form.input} text-left`}
        />
      </div>
      {error || saveError ? (
        <p role="alert" className={form.error}>
          <Copy text={error || saveError} />
        </p>
      ) : null}
      <p className="text-[13.5px] leading-6 text-[color:var(--ink-muted)]">
        <Copy text="כבר יש לכם חשבון?" />{" "}
        <Link href={researchOnly ? "/login?next=%2Fstart%3Fresume%3Dsave" : "/login"} className="font-semibold text-[color:var(--primary)] hover:underline hover:underline-offset-[5px]">
          <Copy text="להיכנס" />
        </Link>
        <Copy text=". מה שבנינו נשמר במכשיר ויחכה לכם." />
      </p>
    </StepShell>
  );
}
