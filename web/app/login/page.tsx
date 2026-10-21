"use client";

import { ProductWordmark } from "@/components/landing-v2/ProductWordmark";

import { Copy, useCopy, useLanguage } from "@/components/language/LanguageProvider";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Button, ErrorNote } from "@/components/AppShell";
import { SetupNotice } from "@/components/account/SetupNotice";
import { GoogleButton, OrDivider } from "@/components/GoogleButton";
import { ApiError, endpoints } from "@/lib/api";
import { CONTACT_EMAIL } from "@/lib/company";
import { googleErrorFromLocation } from "@/lib/googleAuth";
import { safeReturnPath, signInDestination, withInterfaceLanguage } from "@/lib/authNavigation";
import form from "@/components/start/form.module.css";
import auth from "./auth.module.css";

export default function LoginPage() {
  const t = useCopy();
  const { locale } = useLanguage();
  const router = useRouter();
  const [returnPath, setReturnPath] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [email, setEmail] = useState("");
  const [recovering, setRecovering] = useState(false);
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
        router.replace(business === undefined ? withInterfaceLanguage("/dashboard", locale) : signInDestination(null, business, locale));
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

  // תכלית: למצוא דרך לחזור לחשבון בעזרת התמיכה. לא נשלחת הודעה אוטומטית.
  if (recovering) return <AuthCard key="recovery" focusTitle title={t("עזרה בכניסה לחשבון")}>
    <p className={auth.lead}><Copy text="צוות התמיכה יעזור לכם לקבל קישור לאיפוס הסיסמה. הבקשה נפתחת באפליקציית האימייל שלכם." /></p>
    <form className={auth.form} onSubmit={event => {
      event.preventDefault();
      window.location.assign(`mailto:${CONTACT_EMAIL}?${new URLSearchParams({
        subject: t("עזרה בכניסה לחשבון"),
        body: t("שלום, אין לי אפשרות להיכנס לחשבון. אימייל החשבון: {arg_0}", { arg_0: email.trim() }),
      })}`);
    }}>
      <Field name="email" label={t("אימייל החשבון")} type="email" dir="ltr" autoComplete="email" value={email} onChange={setEmail} />
      <Button type="submit" tone="primary" size="md" className="!min-h-[50px] w-full !text-[15px]"><Copy text="לפתוח בקשת עזרה באימייל" /></Button>
    </form>
    <p className={auth.foot}><Copy text="אפשר גם לכתוב ישירות אל" /> <bdi>{CONTACT_EMAIL}</bdi></p>
    <button type="button" className="min-h-11 text-sm text-[var(--primary)] underline underline-offset-4" onClick={() => { setRecovering(false); setError(""); }}><Copy text="לחזור לכניסה" /></button>
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
      <GoogleButton next={withInterfaceLanguage(returnPath ?? "/dashboard", locale)} back={withInterfaceLanguage(returnPath ? `/login?${new URLSearchParams({ next: returnPath })}` : "/login", locale)} disabled={pending} />
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
        <button type="button" disabled={pending} className="min-h-11 self-start text-sm text-[var(--primary)] underline underline-offset-4" onClick={() => setRecovering(true)}><Copy text="שכחתם את הסיסמה?" /></button>
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

export function AuthCard({ title, children, focusTitle = false }: { title: React.ReactNode; children: React.ReactNode; focusTitle?: boolean }) {
  const t = useCopy();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (focusTitle) heading.current?.focus({ preventScroll: true }); }, [focusTitle]);
  return (
    <div className={`auth-blue ${auth.page}`}>
      <header className={auth.bar}>
        <div className={auth.barRow}>
          <Link href="/" className={auth.brand} aria-label={t("ישראמארקט, לעמוד הבית")}>
            <ProductWordmark />
          </Link>
        </div>
      </header>
      <main className={auth.main}>
        <div className={auth.card}>
          <h1 ref={heading} tabIndex={-1} className={auth.title}>{title}</h1>
          {children}
        </div>
      </main>
    </div>
  );
}

export function Field({
  name,
  label,
  type = "text",
  placeholder,
  defaultValue,
  dir,
  autoComplete,
  value,
  onChange,
}: {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
  /** "ltr" for an email or a password: typed left to right, so it should read that way. */
  dir?: "ltr" | "rtl";
  autoComplete?: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  const t = useCopy();
  return (
    <label className="block">
      <span className={form.label}>{t(label)}</span>
      {/* 16px on phones: iOS zooms the page into any field smaller than that (form.input). */}
      <input
        name={name}
        type={type}
        placeholder={placeholder ? t(placeholder) : placeholder}
        defaultValue={defaultValue}
        value={value}
        onChange={event => onChange?.(event.target.value)}
        dir={dir}
        autoComplete={autoComplete}
        required
        className={`${form.input} ${dir === "ltr" ? "text-left" : ""}`}
      />
    </label>
  );
}
