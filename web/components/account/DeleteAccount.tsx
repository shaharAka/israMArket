"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ACCOUNT_DELETED_FLAG } from "@/components/landing/DeletedNotice";
import { ApiError, endpoints, exitDemo, isDemo } from "@/lib/api";

/** What DELETE /auth/account removes (api/app/services/account_deletion.py). */
const DELETED = [
  "החשבון והסיסמה",
  "פרטי העסק ומה שקראנו באתר",
  "התוכניות, הפוסטים והעיצובים",
  "התמונות והסרטונים שהעליתם",
  "החיבורים לגוגל ולפייסבוק, והנתונים שהגיעו מהם",
  "המחקר השבועי והקהלים",
];

/**
 * "מחיקת החשבון": set apart at the bottom of /account, closed by default, and a second
 * step that asks for the password before anything is deleted. The server checks the
 * password too (403 when wrong), so a stolen session alone cannot erase an account. An account
 * opened with Google has no password: it types its email address instead.
 */
export function DeleteAccount({ googleOnly = false, email = "" }: { googleOnly?: boolean; email?: string }) {
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
        setError(googleOnly ? "האימייל לא תואם לחשבון. החשבון לא נמחק." : "הסיסמה לא נכונה. החשבון לא נמחק.");
      else setError(err instanceof Error ? err.message : "לא הצלחנו למחוק את החשבון. נסו שוב.");
    }
  }

  function cancel() {
    setOpen(false);
    setPassword("");
    setError("");
  }

  return (
    <section aria-labelledby={titleId} className="mt-12 border-t border-[#eed1c9] pt-6">
      <h2 id={titleId} className="text-lg font-black text-[#20211f]">
        מחיקת החשבון
      </h2>
      <p className="mt-1 text-sm leading-6 text-[#5e6159]">מוחקת את החשבון וכל המידע של העסק. אי אפשר לבטל את זה.</p>

      {demo ? (
        <p className="mt-4 text-sm text-[#5e6159]">בדמו אין חשבון למחוק.</p>
      ) : !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 inline-flex min-h-11 items-center rounded-md border border-[#e3b6aa] bg-white px-4 text-sm font-bold text-[#9f4330] hover:border-[#9f4330] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9f4330]"
        >
          למחוק את החשבון
        </button>
      ) : (
        <form onSubmit={submit} className="mt-4 rounded-lg border border-[#eed1c9] bg-[#fdf7f5] p-5" aria-describedby={listId}>
          <p className="text-sm font-bold text-[#20211f]">מה יימחק:</p>
          <ul id={listId} className="mt-2 list-disc space-y-1 ps-5 text-sm leading-6 text-[#34372f]">
            {DELETED.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="mt-3 text-sm leading-6 text-[#34372f]">
            הכול נמחק מיד ולתמיד. פוסטים שכבר פרסמתם באינסטגרם או בפייסבוק נשארים שם.
          </p>

          <label htmlFor="delete-password" className="mt-5 block text-xs font-bold text-[#191b18]">
            {googleOnly ? "כדי לאשר, הקלידו את האימייל של החשבון" : "כדי לאשר, הקלידו את הסיסמה שלכם"}
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
            className="mt-1 w-full rounded-md border border-[#dedcd4] bg-white px-3 py-2 text-sm"
          />

          {error ? (
            <p role="alert" className="mt-3 rounded-md border border-[#eed1c9] bg-[#fbf2ef] px-3 py-2 text-xs text-[#9f4330]">
              {error}
            </p>
          ) : null}

          <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
            <button
              type="submit"
              disabled={pending || !password}
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-[#9f4330] px-4 text-sm font-bold text-white hover:bg-[#86361f] disabled:opacity-40"
            >
              {pending ? "מוחקים…" : "למחוק לתמיד"}
            </button>
            <button
              type="button"
              onClick={cancel}
              className="inline-flex min-h-11 items-center justify-center px-2 text-sm font-bold text-[#34372f] underline decoration-[#c7c4b7] underline-offset-4"
            >
              לא עכשיו
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
