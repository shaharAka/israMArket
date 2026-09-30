"use client";

import Link from "next/link";
import { useState } from "react";
import { GoogleButton, OrDivider } from "@/components/GoogleButton";
import { ApiError, endpoints } from "@/lib/api";
import type { StepProps } from "./steps";
import { StepShell, TextInput } from "./ui";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Save: an account (Google, or email + password with the same rules as /signup), then the
 * draft and the 3-month plan become the business. No personal name is asked: the owner has already told
 * us about the business.
 */
export function StepSave(
  props: StepProps & {
    loggedIn: boolean;
    saving: boolean;
    saveError: string;
    onSave: () => Promise<void>;
  },
) {
  const { loggedIn, saving, saveError, onSave } = props;
  const savingLabel = "שומרים את התוכנית…";
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
        title="נשמור את התוכנית"
        why="אתם מחוברים לחשבון. נשמור את העסק ואת התוכנית שלכם, ונתחיל מהמדידה."
        primary={saving ? savingLabel : "לשמור את התוכנית ולהיכנס"}
        primaryDisabled={saving}
        onPrimary={() => void onSave()}
      >
        {saveError ? (
          <p role="alert" className="text-sm font-bold text-[#9f4330]">
            {saveError}
          </p>
        ) : null}
      </StepShell>
    );
  }

  return (
    <StepShell
      {...props}
      title="נשמור את התוכנית"
      why="חשבון אחד, והתוכנית מחכה לכם בפנים. מתחילים מהמדידה, ואת הפוסטים נכתוב אחרי שתבחרו מוצרים ותמונות."
      primary={busy ? (saving ? savingLabel : "פותחים חשבון…") : "לפתוח חשבון ולהיכנס לתוכנית"}
      primaryDisabled={busy}
      onPrimary={() => void submit()}
    >
      {/* The draft is already in this browser (saveFlow on every answer). Google sends the
          owner back to /start?resume=save, and StartFlow saves it from there with the same
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
        <label htmlFor="signup-password" className="mb-1 block text-sm font-bold text-[#1d2940]">
          סיסמה (לפחות 8 תווים)
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
          className="min-h-12 w-full rounded-lg border border-[#dedcd4] bg-white px-3.5 text-left text-base text-[#1d2940] outline-none focus:border-[#1d2940] focus:ring-1 focus:ring-[#1d2940]"
        />
      </div>
      {error || saveError ? (
        <p role="alert" className="text-sm font-bold text-[#9f4330]">
          {error || saveError}
        </p>
      ) : null}
      <p className="text-xs leading-5 text-[#535f75]">
        כבר יש לכם חשבון?{" "}
        <Link href="/login" className="font-bold text-[#1d2940] underline underline-offset-4">
          להיכנס
        </Link>
        . מה שבנינו נשמר במכשיר ויחכה לכם.
      </p>
    </StepShell>
  );
}
