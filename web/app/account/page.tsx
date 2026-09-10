"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
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
      setError("הסיסמה החדשה והאימות אינם זהים.");
      return;
    }
    if (next.length < 8) {
      setError("הסיסמה החדשה חייבת להיות באורך 8 תווים לפחות.");
      return;
    }
    setPending(true);
    try {
      await endpoints.changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      toast("הסיסמה עודכנה.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "עדכון הסיסמה נכשל");
    } finally {
      setPending(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-lg">
        <header className="border-b border-[#deddd8] pb-5">
          <h1 className="text-2xl font-black tracking-tight text-[#20211f]">החשבון</h1>
          <p className="mt-1 text-sm text-[#62635f]">שינוי הסיסמה להתחברות.</p>
        </header>

        <form onSubmit={submit} className="mt-6 space-y-4 rounded-lg border border-[#deddd8] bg-white p-5">
          {[
            { label: "הסיסמה הנוכחית", value: current, set: setCurrent },
            { label: "סיסמה חדשה", value: next, set: setNext },
            { label: "אימות הסיסמה החדשה", value: confirm, set: setConfirm },
          ].map((field) => (
            <div key={field.label}>
              <label className="mb-1 block text-xs font-bold text-[#191b18]">{field.label}</label>
              <input
                type="password"
                value={field.value}
                onChange={(e) => field.set(e.target.value)}
                autoComplete={field.label.includes("הנוכחית") ? "current-password" : "new-password"}
                className="w-full rounded-md border border-[#dedcd4] bg-[#faf8f5] px-3 py-2 text-sm"
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
            className="w-full rounded-md bg-[#20211f] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
          >
            {pending ? "מעדכנים…" : "עדכון סיסמה"}
          </button>
        </form>
      </div>
    </AppShell>
  );
}
