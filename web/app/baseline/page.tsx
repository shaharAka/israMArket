"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { CARD, FIELD, TEXT_ACTION } from "@/components/account/setupStyles";
import { UIAction } from "@/components/design/Controls";
import { LoadingMark } from "@/components/Doodles";
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
      <div className="mx-auto max-w-[640px]">
        <PageHeader
          title="איפה העסק היום"
          subtitle="בערך מספיק. כך נדע בסוף החודש מה באמת השתנה. לא בטוחים? השאירו ריק."
        />

        {!data ? (
          error ? (
            <p role="alert" className="text-[14px] text-[color:var(--danger)]">{error}</p>
          ) : (
            <LoadingMark label="טוענים…" />
          )
        ) : (
          <div className="space-y-6">
            {data.from_integrations ? (
              <p className="flex items-start gap-3 rounded-xl bg-[var(--good-soft)] px-4 py-3.5 text-[14px] leading-6 text-[color:var(--ink)]">
                <span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--good)]" />
                כבר יש לנו מספרים אמיתיים מהחיבורים, והם נקודת הפתיחה. אפשר להוסיף כאן גם מה שהם לא רואים.
              </p>
            ) : null}

            {/* One card, a row per number: the question on one side, the answer on the other. */}
            <div className={`${CARD} divide-y divide-[var(--rule)]`}>
              {data.fields.map((field) => (
                <div
                  key={field.key}
                  className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6"
                >
                  <label htmlFor={`baseline-${field.key}`} className="text-[15px] font-semibold leading-6 text-[color:var(--ink)]">
                    {field.label_he}
                  </label>
                  <div className="flex shrink-0 items-center gap-3">
                    <input
                      id={`baseline-${field.key}`}
                      inputMode="numeric"
                      value={values[field.key] ?? ""}
                      onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
                      placeholder="לא בטוחים"
                      className={`${FIELD} !w-40 tabular-nums`}
                    />
                    <span className="min-w-12 text-[14px] text-[color:var(--ink-muted)]">{field.unit_he}</span>
                  </div>
                </div>
              ))}
            </div>

            {error ? (
              <p role="alert" className="rounded-lg bg-[var(--danger-soft)] px-3.5 py-2.5 text-[13px] leading-5 text-[color:var(--danger)]">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <UIAction onClick={() => void save()} disabled={saving} className="w-full sm:w-auto sm:!px-7">
                {saving ? "שומרים…" : "לשמור את נקודת הפתיחה"}
              </UIAction>
              {data.saved_at ? (
                <Link href="/dashboard" className={TEXT_ACTION}>
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
