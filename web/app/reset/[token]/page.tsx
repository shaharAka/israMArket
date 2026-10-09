"use client";

import { Copy, useCopy } from "@/components/language/LanguageProvider";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Button, ErrorNote } from "@/components/AppShell";
import { ApiError, api } from "@/lib/api";
import { AuthCard, Field } from "../../login/page";
import auth from "../../login/auth.module.css";

type Check = { valid: false } | { valid: true; email_hint: string; expires_at: string };

/** The same rule as signup and the account page. */
const MIN_LENGTH = 8;
const MAX_LENGTH = 200;

/**
 * A one-time link the owner made in the backoffice (api/app/services/password_reset.py):
 * choose a new password, then sign in with it. The token goes to the API in a POST body,
 * never a query string; on success the page replaces itself with /login, so the token
 * does not stay in the browser's history either.
 */
export default function ResetPage() {
  const t = useCopy();
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = typeof params.token === "string" ? params.token : "";
  const [check, setCheck] = useState<Check | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    api<Check>("/auth/reset/check", { method: "POST", body: JSON.stringify({ token }) }, true)
      .then((result) => active && setCheck(result))
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 429) {
          setError(err.message);
          setCheck({ valid: true, email_hint: "", expires_at: "" });
        } else setCheck({ valid: false });
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const again = String(form.get("again") ?? "");
    if (password.length < MIN_LENGTH) return setError(t("הסיסמה קצרה מדי. צריך לפחות 8 תווים."));
    if (password.length > MAX_LENGTH) return setError(t("הסיסמה ארוכה מדי."));
    if (password !== again) return setError(t("הסיסמה לא זהה בשני השדות."));
    setPending(true);
    try {
      await api("/auth/reset", { method: "POST", body: JSON.stringify({ token, new_password: password }) }, true);
      router.replace("/login?reset=1");
    } catch (err) {
      setPending(false);
      if (err instanceof ApiError && err.status === 400) setCheck({ valid: false });
      else setError(err instanceof Error ? err.message : t("לא הצלחנו לשמור. נסו שוב."));
    }
  }

  if (check === null) {
    return (
      <AuthCard title={t("סיסמה חדשה")}>
        <p role="status" className="text-[15px] text-[color:var(--ink-soft)]">
          <Copy text="בודקים את הקישור…" /></p>
      </AuthCard>
    );
  }

  if (!check.valid) {
    return (
      <AuthCard title={t("הקישור כבר לא בתוקף")}>
        <p className="text-[15px] leading-7 text-[color:var(--ink-soft)]">
          <Copy text="קישור לסיסמה חדשה עובד פעם אחת, במשך 24 שעות. בקשו קישור חדש ממי ששלח לכם אותו." /></p>
        <p className={auth.foot}>
          <Link href="/login"><Copy text="לכניסה לחשבון" /></Link>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t("סיסמה חדשה")}>
      {check.email_hint ? (
        <p className="-mt-4 mb-6 text-[15px] text-[color:var(--ink-soft)]">
          <Copy text="לחשבון" />{" "}
          <span dir="ltr" className="font-semibold text-[color:var(--ink)]">
            {check.email_hint}
          </span>
        </p>
      ) : null}
      <form onSubmit={onSubmit} className={auth.form}>
        {/* For password managers: which account this new password belongs to. */}
        <input type="text" name="username" autoComplete="username" value={check.email_hint} readOnly hidden />
        <Field name="password" label={t("סיסמה חדשה (לפחות 8 תווים)")} type="password" dir="ltr" autoComplete="new-password" />
        <Field name="again" label={t("הקלידו אותה שוב")} type="password" dir="ltr" autoComplete="new-password" />
        <ErrorNote message={error} />
        <Button type="submit" disabled={pending} tone="primary" size="md" className="mt-1 !min-h-[50px] w-full !text-[15px]">
          {pending ? t("שומרים…") : t("לשמור סיסמה")}
        </Button>
      </form>
      <p className={auth.foot}>
        <Copy text="אחרי השמירה נעביר אתכם לכניסה. כל מכשיר שהיה מחובר יתנתק." /></p>
    </AuthCard>
  );
}
