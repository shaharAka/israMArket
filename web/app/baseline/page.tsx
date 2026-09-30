"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LoadingMark } from "@/components/Doodles";
import { SectionHeader } from "@/components/SectionHeader";
import { StepLink } from "@/components/trial/StepLink";
import { ApiError } from "@/lib/api";
import { IconArrowLeft } from "@/lib/icons";
import { foundations, type BaselineKey, type BaselinePayload } from "@/lib/trial";
import { toast } from "@/lib/ui";

/**
 * "איפה העסק היום" — the numbers the month is measured against (Revision 8, week 1).
 *
 * Only when no connected source gives them: with real numbers synced, the page says so and
 * asks nothing. Every field is optional; empty means "לא בטוחים", never zero.
 */
export default function BaselinePage() {
  const [data, setData] = useState<BaselinePayload | null>(null);
  const [values, setValues] = useState<Partial<Record<BaselineKey, string>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    foundations
      .baseline()
      .then((payload) => {
        setData(payload);
        setValues(
          Object.fromEntries(
            Object.entries(payload.baseline)
              .filter(([, value]) => typeof value === "number")
              .map(([key, value]) => [key, String(value)])
          )
        );
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) return;
        setError(err instanceof Error ? err.message : "לא הצלחנו לטעון.");
      });
  }, []);

  async function save() {
    if (!data) return;
    setSaving(true);
    setError("");
    try {
      const body = Object.fromEntries(
        data.fields.map((field) => {
          const raw = (values[field.key] || "").replace(/[,\s₪%]/g, "");
          return [field.key, raw === "" ? null : Math.max(0, Math.round(Number(raw)))];
        })
      ) as Partial<Record<BaselineKey, number | null>>;
      if (Object.values(body).some((value) => value !== null && Number.isNaN(value))) {
        setError("כתבו מספר בלבד, או השאירו ריק אם לא בטוחים.");
        setSaving(false);
        return;
      }
      setData(await foundations.saveBaseline(body));
      toast("נקודת הפתיחה נשמרה");
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "לא הצלחנו לשמור. נסו שוב.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-lg">
        <SectionHeader
          section="business"
          title="איפה העסק היום"
          subtitle="בערך מספיק. כך נדע בסוף החודש מה באמת השתנה. לא בטוחים? השאירו ריק."
        />

        {!data ? (
          error ? (
            <p role="alert" className="text-sm text-[#9f4330]">{error}</p>
          ) : (
            <LoadingMark label="טוענים…" />
          )
        ) : (
          <div className="space-y-5">
            {data.from_integrations ? (
              <p className="rounded-lg border border-[#d3ddcf] bg-[var(--primary-soft)] px-4 py-3 text-sm leading-6 text-[color:var(--ink)]">
                כבר יש לנו מספרים אמיתיים מהחיבורים, והם נקודת הפתיחה. אפשר להוסיף כאן גם מה שהם לא רואים.
              </p>
            ) : null}

            <div className="space-y-4 rounded-lg border border-[var(--rule)] bg-white p-5">
              {data.fields.map((field) => (
                <div key={field.key}>
                  <label htmlFor={`baseline-${field.key}`} className="mb-1 block text-sm font-bold text-[color:var(--ink)]">
                    {field.label_he}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id={`baseline-${field.key}`}
                      inputMode="numeric"
                      value={values[field.key] ?? ""}
                      onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
                      placeholder="לא בטוחים"
                      className="min-h-11 w-40 rounded-md border border-[var(--rule-dark)] bg-[#faf8f5] px-3 text-sm"
                    />
                    <span className="text-sm text-[color:var(--ink-soft)]">{field.unit_he}</span>
                  </div>
                </div>
              ))}
            </div>

            {error ? (
              <p role="alert" className="text-sm text-[#9f4330]">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-[var(--primary)] px-6 text-sm font-bold text-white hover:bg-[var(--primary-dark)] disabled:opacity-40 sm:w-auto"
              >
                {saving ? "שומרים…" : "לשמור את נקודת הפתיחה"}
              </button>
              {data.saved_at ? (
                <Link href="/dashboard" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-[color:var(--ink)] underline underline-offset-4">
                  לצעד הבא
                  <IconArrowLeft className="h-4 w-4" />
                </Link>
              ) : null}
            </div>
            <StepLink stepKey="baseline" />
          </div>
        )}
      </div>
    </AppShell>
  );
}
