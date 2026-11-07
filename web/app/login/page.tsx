"use client";

import { AuthCard, Field } from "@/components/account/AuthFields";

import { Copy, useCopy, useLanguage } from "@/components/language/LanguageProvider";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Button, ErrorNote } from "@/components/AppShell";
import { SetupNotice } from "@/components/account/SetupNotice";
import { GoogleButton, OrDivider } from "@/components/GoogleButton";
import { ApiError, endpoints } from "@/lib/api";
import { CONTACT_EMAIL } from "@/lib/company";
import { googleErrorFromLocation } from "@/lib/googleAuth";
import { safeReturnPath, signInDestination, withInterfaceLanguage } from "@/lib/authNavigation";
import auth from "./auth.module.css";
import { copyText } from "@/lib/ui";

export default function LoginPage() {
  const t = useCopy();
  const { locale } = useLanguage();
  const router = useRouter();
  const [returnPath, setReturnPath] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [email, setEmail] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [copied, setCopied] = useState(false);
  // From a one-time reset link (`?reset=1`), or an account the backoffice suspended
  // (`?suspended=1` from AppShell, `?google_error=account_suspended`, or the 403 below).
  const [resetDone, setResetDone] = useState(false);
  const [suspended, setSuspended] = useState(false);

  // Back from Google with `?google_error=`: say what happened. Browser only, after mount.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams(window.location.search);
      setReturnPath(safeReturnPath(query.get("next")));
      const isSuspended = query.get("suspended") === "1" || query.get("google_error") === "account_suspended";
      setResetDone(query.get("reset") === "1");
      setSuspended(isSuspended);
      const message = googleErrorFromLocation();
      if (message && !isSuspended) setError(message);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      await endpoints.login({
        email: String(form.get("email")),
        password: String(form.get("password")),
      });
      const requested = safeReturnPath(new URLSearchParams(window.location.search).get("next"));
      if (requested) {
        router.replace(signInDestination(requested, null, locale));
      } else {
        // A failed business read is not a failed password. The app can retry that read.
        const { business } = await endpoints.business().catch(() => ({ business: undefined }));
        router.replace(business === undefined ? withInterfaceLanguage("/campaign", locale) : signInDestination(null, business, locale));
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === "account_suspended") {
        setSuspended(true);
        setError("");
      } else setError(err instanceof Error ? err.message : "האימייל או הסיסמה לא נכונים");
    } finally {
      setPending(false);
    }
  }

  // תכלית: לקבל עזרה אמיתית באיפוס סיסמה, בלי להידרש להתחבר תחילה.
  // מסר: התמיכה עוזרת; שליחת אימייל מתבצעת במפורש מתוך תוכנת הדואר של המשתמש.
  if (recovering) return <AuthCard key="recovery" focusTitle title={t("עזרה בכניסה לחשבון")}>
    <p className={auth.lead}><Copy text="כתבו לנו מאימייל החשבון ונעזור לכם לאפס את הסיסמה." /></p>
    <form className={auth.form} onSubmit={event => {
      event.preventDefault();
      const destination = safeReturnPath(new URLSearchParams(window.location.search).get("next"));
      const body = t("שלום, אין לי אפשרות להיכנס לחשבון. אימייל החשבון: {arg_0}", { arg_0: email.trim() });
      window.location.assign(`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(t("עזרה בכניסה לחשבון"))}&body=${encodeURIComponent(body + (destination ? `\n${t("העמוד שאליו רציתי לחזור:")} ${destination}` : ""))}`);
    }}>
      <Field name="email" label={t("אימייל החשבון")} type="email" dir="ltr" autoComplete="email" value={email} onChange={setEmail} />
      <Button type="submit" tone="primary" size="md" className="!min-h-[50px] w-full !text-[15px]"><Copy text="לפתוח אימייל לתמיכה" /></Button>
    </form>
    <p className="mt-4 text-sm leading-6 text-[var(--ink-soft)]"><Copy text="הבקשה נפתחת בתוכנת האימייל שלכם. אפשר גם לכתוב ישירות אל" /> <bdi>{CONTACT_EMAIL}</bdi></p>
    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
      <button type="button" className="min-h-11 text-sm font-medium text-[var(--primary)]" onClick={() => void copyText(CONTACT_EMAIL, t("כתובת התמיכה הועתקה.")).then(() => setCopied(true)).catch(() => setError(t("לא הצלחנו להעתיק. אפשר לסמן את הכתובת ולהעתיק ידנית.")))}><Copy text="להעתיק את כתובת התמיכה" /></button>
      <button type="button" className="min-h-11 text-sm font-medium text-[var(--primary)]" onClick={() => { setRecovering(false); setError(""); }}><Copy text="לחזור לכניסה" /></button>
    </div>
    {copied && <p role="status" className="text-sm text-[var(--ink-soft)]"><Copy text="כתובת התמיכה הועתקה." /></p>}
    {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
  </AuthCard>;

  return (
    <AuthCard key="login" focusTitle title={t("כניסה לחשבון")}>
      {resetDone && !suspended ? (
        <div className="mb-6">
          <SetupNotice tone="success" title={t("הסיסמה החדשה נשמרה")}><Copy text="אפשר להיכנס איתה עכשיו." /></SetupNotice>
        </div>
      ) : null}
      {suspended ? (
        <div className="mb-6">
          <SetupNotice tone="attention" title={t("החשבון מושהה כרגע")}><Copy text="כל המידע שמור. כדי לברר למה, כתבו לנו:" />{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} dir="ltr" className="font-semibold text-[color:var(--primary)] underline-offset-4 hover:underline">
              {CONTACT_EMAIL}
            </a>
          </SetupNotice>
        </div>
      ) : null}
      {/* AppShell sends an account with no business on to /start or /onboarding. */}
      <GoogleButton next={withInterfaceLanguage(returnPath ?? "/campaign", locale)} back={withInterfaceLanguage(returnPath ? `/login?${new URLSearchParams({ next: returnPath })}` : "/login", locale)} disabled={pending} />
      <div className="my-5">
        <OrDivider />
      </div>

      <form onSubmit={onSubmit} className={auth.form}>
        <Field
          name="email"
          label={t("אימייל")}
          type="email"
          placeholder="name@business.co.il"
          dir="ltr"
          autoComplete="email"
          value={email}
          onChange={setEmail}
        />
        <Field
          name="password"
          label={t("סיסמה")}
          type="password"
          placeholder="••••••••"
          dir="ltr"
          autoComplete="current-password"
        />
        <button type="button" disabled={pending} className="min-h-11 self-start text-sm font-medium text-[var(--primary)] underline underline-offset-4" onClick={() => setRecovering(true)}><Copy text="שכחתם את הסיסמה?" /></button>
        <ErrorNote message={t(error)} />
        <Button type="submit" disabled={pending} tone="primary" size="md" className="mt-1 !min-h-[50px] w-full !text-[15px]">
          {pending ? t("נכנסים…") : t("להיכנס")}
        </Button>
      </form>

      <p className={auth.foot}><Copy text="עדיין אין לכם חשבון?" />{" "}
        <Link href="/signup"><Copy text="לפתוח חשבון" /></Link>
      </p>
    </AuthCard>
  );
}
