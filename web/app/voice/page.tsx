"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LoadingMark } from "@/components/Doodles";
import { SectionHeader } from "@/components/SectionHeader";
import { StepLink } from "@/components/trial/StepLink";
import { ApiError } from "@/lib/api";
import { IconArrowLeft } from "@/lib/icons";
import { foundations, type VoicePayload } from "@/lib/trial";
import { toast } from "@/lib/ui";

/**
 * A quick voice check (Revision 8, week 2): the style we read off the site, in two sample
 * lines, and one question — does this sound like you? "Not quite" asks what to change, so
 * the posts are fixed before they are written, not after.
 */
export default function VoicePage() {
  const [data, setData] = useState<VoicePayload | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    foundations
      .voice()
      .then((payload) => {
        setData(payload);
        setNote(payload.check?.note ?? "");
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) return;
        setError(err instanceof Error ? err.message : "לא הצלחנו לטעון.");
      });
  }, []);

  async function answer(ok: boolean) {
    setSaving(true);
    setError("");
    try {
      setData(await foundations.saveVoice(ok, ok ? "" : note));
      setAdjusting(false);
      toast(ok ? "מעולה, כותבים בסגנון הזה" : "תודה, נכתוב לפי זה");
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "לא הצלחנו לשמור. נסו שוב.");
    } finally {
      setSaving(false);
    }
  }

  const check = data?.check;

  return (
    <AppShell>
      <div className="mx-auto max-w-lg">
        <SectionHeader section="business" title="זה נשמע כמוכם?" subtitle="כך קראנו את הסגנון שלכם מהאתר. ככה נכתוב את הפוסטים." />

        {!data ? (
          error ? (
            <p role="alert" className="text-sm text-[#9f4330]">{error}</p>
          ) : (
            <LoadingMark label="טוענים…" />
          )
        ) : (
          <div className="space-y-5">
            <section className="rounded-lg border border-[var(--rule)] bg-white p-5">
              {data.voice_he ? <p className="text-sm leading-6 text-[color:var(--ink)]">{data.voice_he}</p> : null}
              {data.examples_he.length ? (
                <ul className="mt-3 space-y-2">
                  {data.examples_he.map((line) => (
                    <li key={line} className="border-r-2 border-[#374b3d] pr-3 text-[15px] font-bold leading-7 text-[color:var(--ink)]">
                      {line}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[color:var(--ink-soft)]">עוד לא קראנו דוגמאות מהאתר. ספרו לנו במילים שלכם איך אתם מדברים.</p>
              )}
            </section>

            {check && !adjusting ? (
              <p className="text-sm leading-6 text-[color:var(--ink)]">
                {check.ok ? "אישרתם: כותבים בסגנון הזה." : `ביקשתם לשנות: ${check.note || "בלי פרטים"}.`}{" "}
                <button type="button" onClick={() => setAdjusting(true)} className="font-bold underline underline-offset-4">
                  לשנות
                </button>
              </p>
            ) : (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => void answer(true)}
                  disabled={saving}
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-[var(--primary)] px-6 text-sm font-bold text-white hover:bg-[var(--primary-dark)] disabled:opacity-40 sm:w-auto"
                >
                  כן, ככה אנחנו מדברים
                </button>
                <div>
                  <label htmlFor="voice-note" className="mb-1 block text-sm font-bold text-[color:var(--ink)]">
                    לא בדיוק? מה לשנות
                  </label>
                  <textarea
                    id="voice-note"
                    value={note}
                    maxLength={400}
                    rows={3}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="למשל: פחות רשמי, בלי אימוג׳ים, לפנות בלשון רבים"
                    className="w-full rounded-md border border-[var(--rule-dark)] bg-[#faf8f5] px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void answer(false)}
                    disabled={saving || !note.trim()}
                    className="mt-2 inline-flex min-h-11 items-center rounded-md border border-[var(--rule-dark)] bg-white px-4 text-sm font-bold text-[color:var(--ink)] hover:bg-[var(--primary-soft)] disabled:opacity-40"
                  >
                    לשמור את התיקון
                  </button>
                </div>
              </div>
            )}

            {error ? (
              <p role="alert" className="text-sm text-[#9f4330]">
                {error}
              </p>
            ) : null}
            {check ? (
              <Link href="/dashboard" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-[color:var(--ink)] underline underline-offset-4">
                לצעד הבא
                <IconArrowLeft className="h-4 w-4" />
              </Link>
            ) : null}
            <StepLink stepKey="voice" />
          </div>
        )}
      </div>
    </AppShell>
  );
}
