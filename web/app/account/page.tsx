"use client";

import Link from "next/link";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { DeleteAccount } from "@/components/account/DeleteAccount";
import { endpoints } from "@/lib/api";
import { toast } from "@/lib/ui";

export default function AccountPage() {
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
      await endpoints.changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      toast("הסיסמה החדשה נשמרה");
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא הצלחנו להחליף את הסיסמה. נסו שוב.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-lg">
        <header className="border-b border-[#e1e7f2] pb-5">
          <h1 className="text-2xl font-black tracking-tight text-[#1d2940]">החשבון</h1>
        </header>

        <form onSubmit={submit} className="mt-6 space-y-4 rounded-lg border border-[#e1e7f2] bg-white p-5">
          {[
            { label: "הסיסמה הנוכחית", value: current, set: setCurrent },
            { label: "סיסמה חדשה", value: next, set: setNext },
            { label: "הקלידו שוב את הסיסמה החדשה", value: confirm, set: setConfirm },
          ].map((field) => (
            <div key={field.label}>
              <label className="mb-1 block text-xs font-bold text-[#1d2940]">{field.label}</label>
              <input
                type="password"
                value={field.value}
                onChange={(e) => field.set(e.target.value)}
                autoComplete={field.label.includes("הנוכחית") ? "current-password" : "new-password"}
                className="w-full rounded-md border border-[var(--rule-dark)] bg-[#faf8f5] px-3 py-2 text-sm"
              />
            </div>
          ))}

          {error ? (
            <p className="rounded-md border border-[#eed1c9] bg-[#fbf2ef] px-3 py-2 text-xs text-[#9f4330]">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending || !current || !next}
            className="w-full rounded-md bg-[#2853c7] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
          >
            {pending ? "שומרים…" : "להחליף סיסמה"}
          </button>
        </form>

        {/* The first-entry welcome, again, on demand (it is shown once by itself). */}
        <p className="mt-6 text-sm text-[color:var(--ink-soft)]">
          רוצים לראות שוב מה יש כאן?{" "}
          <Link href="/dashboard?tour=1" className="font-bold text-[color:var(--ink)] underline underline-offset-4">
            לסייר שוב
          </Link>
        </p>

        <DeleteAccount />
      </div>
    </AppShell>
  );
}
