"use client";

import { Copy, useCopy } from "@/components/language/LanguageProvider";

import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { DeleteAccount } from "@/components/account/DeleteAccount";
import { CARD, FIELD, LABEL, LIST_ROW, ROW_CHEVRON } from "@/components/account/setupStyles";
import { UIAction } from "@/components/design/Controls";
import { endpoints, type AuthUser } from "@/lib/api";
import { IconChevron } from "@/lib/icons";
import { toast } from "@/lib/ui";

/** How the owner signs in, in a few words. Google keeps its Latin name in sign-in copy. */
function signInMethod(me: AuthUser, t: (source: string) => string) {
  if (me.google_linked && me.has_password) return t("Google או אימייל וסיסמה");
  if (me.google_linked) return "Google";
  return t("אימייל וסיסמה");
}

export default function AccountPage() {
  const t = useCopy();
  const formId = useId();
  // Which sign-in the account has: a Google-only account has no password to change, so it
  // is offered a first one instead (optional).
  const [me, setMe] = useState<AuthUser | null>(null);
  const loadMe = useCallback(() => {
    endpoints
      .me()
      .then(setMe)
      .catch(() => setMe(null));
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(loadMe, 0);
    return () => window.clearTimeout(timer);
  }, [loadMe]);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (next !== confirm) {
      setError(t("הסיסמה החדשה לא זהה בשני השדות."));
      return;
    }
    if (next.length < 8) {
      setError(t("הסיסמה החדשה קצרה מדי. צריך לפחות 8 תווים."));
      return;
    }
    setPending(true);
    try {
      if (settingFirst) await endpoints.setPassword(next);
      else await endpoints.changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setPasswordOpen(false);
      toast(settingFirst ? t("הסיסמה נשמרה. אפשר להיכנס גם עם אימייל וסיסמה.") : t("הסיסמה החדשה נשמרה"));
      if (settingFirst) loadMe();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("לא הצלחנו להחליף את הסיסמה. נסו שוב."));
    } finally {
      setPending(false);
    }
  }

  const settingFirst = me !== null && !me.has_password;
  const fields = settingFirst
    ? [
        { label: t("סיסמה חדשה"), value: next, set: setNext },
        { label: t("הקלידו שוב את הסיסמה"), value: confirm, set: setConfirm },
      ]
    : [
        { label: t("הסיסמה הנוכחית"), value: current, set: setCurrent },
        { label: t("סיסמה חדשה"), value: next, set: setNext },
        { label: t("הקלידו שוב את הסיסמה החדשה"), value: confirm, set: setConfirm },
      ];
  const name = me?.full_name?.trim() || "";

  return (
    <AppShell>
      <div className="mx-auto max-w-[720px]">
        <PageHeader title={t("החשבון")} />

        <div className="space-y-4">
          {/* Who is signed in, and how: the first thing an owner checks on this page. */}
          {me ? (
            <section aria-label={t("פרטי החשבון")} className={`${CARD} p-5 sm:p-6`}>
              <div className="flex items-center gap-4">
                <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[18px] font-semibold text-[color:var(--primary-dark)]">
                  {(name || me.email).slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  {name ? <p className="truncate text-[17px] font-semibold leading-7 text-[color:var(--ink)]">{name}</p> : null}
                  <p className="truncate text-[14px] leading-6 text-[color:var(--ink-soft)]"><bdi>{me.email}</bdi></p>
                </div>
              </div>
              <dl className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--rule)] pt-4 text-[14px]">
                <dt className="text-[color:var(--ink-muted)]"><Copy text="נכנסים עם" /></dt>
                <dd className="font-semibold text-[color:var(--ink)]">{signInMethod(me, t)}</dd>
              </dl>
            </section>
          ) : null}

          <ul className={`${CARD} divide-y divide-[var(--rule)] overflow-hidden`}>
            {/* The password is one row; its fields open only when asked for. */}
            <li>
              <button
                type="button"
                aria-expanded={passwordOpen}
                aria-controls={formId}
                onClick={() => setPasswordOpen(open => !open)}
                className={`group ${LIST_ROW} cursor-pointer`}
              >
                <span className="min-w-0 flex-1 text-[15px] font-semibold leading-6 text-[color:var(--ink)]">
                  {settingFirst ? t("לקבוע סיסמה (לא חובה)") : t("לשנות סיסמה")}
                </span>
                <IconChevron className={`h-5 w-5 shrink-0 text-[color:var(--ink-muted)] transition-transform duration-200 motion-reduce:transition-none ${passwordOpen ? "rotate-90" : "-rotate-90"}`} />
              </button>
              {passwordOpen ? (
                <form id={formId} onSubmit={submit} className="space-y-5 border-t border-[var(--rule)] px-4 pt-5 pb-6 sm:px-5">
                  {settingFirst ? (
                    <p className="text-[14px] leading-6 text-[color:var(--ink-soft)]">
                      <Copy text="נכנסתם עם Google. עם סיסמה אפשר להיכנס גם עם האימייל, בלי Google." /></p>
                  ) : null}
                  {fields.map((field, index) => (
                    <div key={field.label}>
                      <label htmlFor={`pw-${index}`} className={LABEL}>
                        {field.label}
                      </label>
                      <input
                        id={`pw-${index}`}
                        type="password"
                        value={field.value}
                        onChange={(e) => field.set(e.target.value)}
                        autoComplete={!settingFirst && index === 0 ? "current-password" : "new-password"}
                        className={FIELD}
                      />
                    </div>
                  ))}

                  {error ? (
                    <p role="alert" className="rounded-lg bg-[var(--danger-soft)] px-3.5 py-2.5 text-[13px] leading-5 text-[color:var(--danger)]">
                      {error}
                    </p>
                  ) : null}

                  <UIAction
                    type="submit"
                    disabled={pending || (!settingFirst && !current) || !next}
                    className="w-full sm:w-auto sm:!px-7"
                  >
                    {pending ? t("שומרים…") : settingFirst ? t("לשמור סיסמה") : t("להחליף סיסמה")}
                  </UIAction>
                </form>
              ) : null}
            </li>
            <li>
              <Link href="/billing" className={`group ${LIST_ROW}`}>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold leading-6 text-[color:var(--ink)]"><Copy text="המנוי" /></span>
                  <span className="block text-[13px] leading-5 text-[color:var(--ink-soft)]"><Copy text="החודש החינמי, התשלום והביטול" /></span>
                </span>
                <IconChevron navigation className={ROW_CHEVRON} />
              </Link>
            </li>
            <li>
              <Link href="/dashboard?tour=1" className={`group ${LIST_ROW}`}>
                <span className="min-w-0 flex-1 text-[15px] font-semibold leading-6 text-[color:var(--ink)]"><Copy text="לסייר שוב" /></span>
                <IconChevron navigation className={ROW_CHEVRON} />
              </Link>
            </li>
            {/* The backoffice: only in an admin's own account menu, and only while the server
                says this session is an admin one (api/app/services/admin_access.py). */}
            {me?.is_admin ? (
              <li>
                <Link href="/admin" className={`group ${LIST_ROW}`}>
                  <span className="min-w-0 flex-1 text-[15px] font-semibold leading-6 text-[color:var(--ink)]"><Copy text="ניהול החשבונות" /></span>
                  <IconChevron navigation className={ROW_CHEVRON} />
                </Link>
              </li>
            ) : null}
          </ul>
        </div>

        <DeleteAccount googleOnly={settingFirst} email={me?.email ?? ""} />
      </div>
    </AppShell>
  );
}
