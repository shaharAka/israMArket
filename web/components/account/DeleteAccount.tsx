"use client";

import { Copy, useCopy } from "@/components/language/LanguageProvider";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ACCOUNT_DELETED_FLAG } from "@/components/landing/DeletedNotice";
import { FIELD, LABEL } from "@/components/account/setupStyles";
import { ApiError, endpoints, exitDemo, isDemo } from "@/lib/api";

/** What DELETE /auth/account removes (api/app/services/account_deletion.py). */
const DELETED = [
  "החשבון והסיסמה",
  "פרטי העסק ומה שקראנו באתר",
  "התוכניות, הפוסטים והעיצובים",
  "התמונות והסרטונים שהעליתם",
  "החיבורים לגוגל ולפייסבוק, והנתונים שהגיעו מהם",
  "המחקר השבועי והקהלים",
  // services/billing.cancel_for_deletion cancels the PayPal subscription first.
  "המנוי ורשימת התשלומים. מנוי בפייפאל מתבטל",
];

/**
 * "מחיקת החשבון": set apart at the bottom of /account, closed by default, and a second
 * step that asks for the password before anything is deleted. The server checks the
 * password too (403 when wrong), so a stolen session alone cannot erase an account. An account
 * opened with Google has no password: it types its email address instead.
 */
export function DeleteAccount({ googleOnly = false, email = "" }: { googleOnly?: boolean; email?: string }) {
  const t = useCopy();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [demo, setDemo] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const listId = useId();

  // The demo flag lives in localStorage, which the server render cannot see.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setDemo(isDemo()), []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!password || pending) return;
    setError("");
    setPending(true);
    try {
      await endpoints.deleteAccount(googleOnly ? { confirm_email: password } : { password });
      exitDemo();
      try {
        window.sessionStorage.setItem(ACCOUNT_DELETED_FLAG, "1");
      } catch {
        // No storage: the deletion still happened, only the toast is lost.
      }
      router.replace("/");
    } catch (err) {
      setPending(false);
      if (err instanceof ApiError && err.status === 403)
        setError(googleOnly ? t("האימייל לא תואם לחשבון. החשבון לא נמחק.") : t("הסיסמה לא נכונה. החשבון לא נמחק."));
      else setError(err instanceof Error ? err.message : t("לא הצלחנו למחוק את החשבון. נסו שוב."));
    }
  }

  function cancel() {
    setOpen(false);
    setPassword("");
    setError("");
  }

  return (
    <section aria-labelledby={titleId} className="mt-12 border-t border-[var(--rule)] pt-8">
      <h2 id={titleId} className="text-[17px] font-bold leading-7 text-[color:var(--ink)]">
        <Copy text="מחיקת החשבון" /></h2>
      <p className="mt-1 text-[14px] leading-6 text-[color:var(--ink-soft)]"><Copy text="מוחקת את החשבון וכל המידע של העסק. אי אפשר לבטל את זה." /></p>

      {demo ? (
        <p className="mt-4 text-[14px] text-[color:var(--ink-muted)]"><Copy text="בדמו אין חשבון למחוק." /></p>
      ) : !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-5 inline-flex min-h-11 items-center rounded-lg border border-[var(--danger-rule)] bg-[var(--paper)] px-4 text-[14px] font-semibold text-[color:var(--danger)] transition-colors hover:border-[var(--danger)] hover:bg-[var(--danger-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--danger)]"
        >
          <Copy text="למחוק את החשבון" /></button>
      ) : (
        <form onSubmit={submit} className="mt-5 rounded-2xl bg-[var(--danger-soft)] p-5 sm:p-6" aria-describedby={listId}>
          <p className="text-[14px] font-semibold text-[color:var(--ink)]"><Copy text="מה יימחק:" /></p>
          <ul id={listId} className="mt-2 list-disc space-y-1 ps-5 text-[14px] leading-6 text-[color:var(--ink)] marker:text-[color:var(--danger)]">
            {DELETED.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="mt-4 text-[14px] leading-6 text-[color:var(--ink)]">
            <Copy text="הכול נמחק מיד ולתמיד. פוסטים שכבר פרסמתם באינסטגרם או בפייסבוק נשארים שם." /></p>

          <label htmlFor="delete-password" className={`${LABEL} mt-6`}>
            {googleOnly ? t("כדי לאשר, הקלידו את האימייל של החשבון") : t("כדי לאשר, הקלידו את הסיסמה שלכם")}
          </label>
          <input
            ref={inputRef}
            id="delete-password"
            type={googleOnly ? "email" : "password"}
            dir={googleOnly ? "ltr" : undefined}
            placeholder={googleOnly ? email : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={googleOnly ? "off" : "current-password"}
            className={FIELD}
          />

          {error ? (
            <p role="alert" className="mt-3 rounded-lg bg-[var(--paper)] px-3.5 py-2.5 text-[13px] leading-5 text-[color:var(--danger)]">
              {error}
            </p>
          ) : null}

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:gap-4">
            <button
              type="submit"
              disabled={pending || !password}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--danger)] px-5 text-[14px] font-semibold text-[color:var(--paper)] transition-[filter,opacity] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {pending ? t("מוחקים…") : t("למחוק לתמיד")}
            </button>
            <button
              type="button"
              onClick={cancel}
              className="inline-flex min-h-11 items-center justify-center px-2 text-[14px] font-semibold text-[color:var(--ink-soft)] underline-offset-4 transition-colors hover:text-[color:var(--ink)] hover:underline"
            >
              <Copy text="לא עכשיו" /></button>
          </div>
        </form>
      )}
    </section>
  );
}
