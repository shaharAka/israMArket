"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { DeleteAccount } from "@/components/account/DeleteAccount";
import { CARD, FIELD, LABEL, LIST_ROW, ROW_CHEVRON } from "@/components/account/setupStyles";
import { UIAction } from "@/components/design/Controls";
import { endpoints, type AuthUser } from "@/lib/api";
import { IconChevron } from "@/lib/icons";
import { toast } from "@/lib/ui";

export default function AccountPage() {
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
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (next !== confirm) {
      setError("הסיסמה החדשה לא זהה בשני השדות.");
      return;
    }
    if (next.length < 8) {
      setError("הסיסמה החדשה קצרה מדי. צריך לפחות 8 תווים.");
      return;
    }
    setPending(true);
    try {
      if (settingFirst) await endpoints.setPassword(next);
      else await endpoints.changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      toast(settingFirst ? "הסיסמה נשמרה. אפשר להיכנס גם עם אימייל וסיסמה." : "הסיסמה החדשה נשמרה");
      if (settingFirst) loadMe();
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא הצלחנו להחליף את הסיסמה. נסו שוב.");
    } finally {
      setPending(false);
    }
  }

  const settingFirst = me !== null && !me.has_password;
  const fields = settingFirst
    ? [
        { label: "סיסמה חדשה", value: next, set: setNext },
        { label: "הקלידו שוב את הסיסמה", value: confirm, set: setConfirm },
      ]
    : [
        { label: "הסיסמה הנוכחית", value: current, set: setCurrent },
        { label: "סיסמה חדשה", value: next, set: setNext },
        { label: "הקלידו שוב את הסיסמה החדשה", value: confirm, set: setConfirm },
      ];

  return (
    <AppShell>
      <div className="mx-auto max-w-[640px]">
        <PageHeader title="החשבון" />

        <div className="space-y-4">
          {me?.google_linked ? (
            <p className={`${CARD} flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-4 text-[15px] text-[color:var(--ink)] sm:px-6`}>
              <span className="inline-flex items-center gap-2 font-semibold">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--good)] shadow-[0_0_0_3px_var(--good-soft)]" />
                מחובר עם Google
              </span>
              <span dir="ltr" className="min-w-0 truncate text-[14px] text-[color:var(--ink-muted)]">
                {me.email}
              </span>
            </p>
          ) : null}

          <form onSubmit={submit} className={`${CARD} space-y-5 p-5 sm:p-7`}>
            {settingFirst ? (
              <div>
                <h2 className="text-[17px] font-bold leading-7 text-[color:var(--ink)]">לקבוע סיסמה (לא חובה)</h2>
                <p className="mt-1 text-[14px] leading-6 text-[color:var(--ink-soft)]">
                  נכנסתם עם Google. עם סיסמה אפשר להיכנס גם עם האימייל, בלי Google.
                </p>
              </div>
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
                  autoComplete={field.label.includes("הנוכחית") ? "current-password" : "new-password"}
                  className={FIELD}
                />
              </div>
            ))}

            {error ? (
              <p role="alert" className="rounded-lg bg-[var(--danger-soft)] px-3.5 py-2.5 text-[13px] leading-5 text-[color:var(--danger)]">
                {error}
              </p>
            ) : null}

            <div className="pt-1">
              <UIAction
                type="submit"
                disabled={pending || (!settingFirst && !current) || !next}
                className="w-full sm:w-auto sm:!px-7"
              >
                {pending ? "שומרים…" : settingFirst ? "לשמור סיסמה" : "להחליף סיסמה"}
              </UIAction>
            </div>
          </form>

          {/* The subscription (app/billing) and the first-entry welcome again, on demand: two
              ways out of this page, so a list with a hairline between them. */}
          <ul className={`${CARD} divide-y divide-[var(--rule)] overflow-hidden`}>
            <li>
              <Link href="/billing" className={`group ${LIST_ROW}`}>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold leading-6 text-[color:var(--ink)]">המנוי</span>
                  <span className="block text-[13px] leading-5 text-[color:var(--ink-soft)]">החודש החינמי, התשלום והביטול</span>
                </span>
                <IconChevron className={ROW_CHEVRON} />
              </Link>
            </li>
            <li>
              <Link href="/dashboard?tour=1" className={`group ${LIST_ROW}`}>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold leading-6 text-[color:var(--ink)]">לסייר שוב</span>
                  <span className="block text-[13px] leading-5 text-[color:var(--ink-soft)]">רוצים לראות שוב מה יש כאן?</span>
                </span>
                <IconChevron className={ROW_CHEVRON} />
              </Link>
            </li>
            {/* The backoffice: only in an admin's own account menu, and only while the server
                says this session is an admin one (api/app/services/admin_access.py). */}
            {me?.is_admin ? (
              <li>
                <Link href="/admin" className={`group ${LIST_ROW}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold leading-6 text-[color:var(--ink)]">ניהול החשבונות</span>
                    <span className="block text-[13px] leading-5 text-[color:var(--ink-soft)]">כל החשבונות, איפוס סיסמה, השהיה ועלויות</span>
                  </span>
                  <IconChevron className={ROW_CHEVRON} />
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
