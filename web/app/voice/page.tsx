"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LoadingMark } from "@/components/Doodles";
import { SectionHeader } from "@/components/SectionHeader";
import { StepLink } from "@/components/trial/StepLink";
import { ApiError } from "@/lib/api";
import ui from "@/components/posts/chrome.module.css";
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
            <p role="alert" className={ui.error}>{error}</p>
          ) : (
            <LoadingMark label="טוענים…" />
          )
        ) : (
          <div>
            {/* The style as we read it, then the two sample lines as they would read in a
                post: each in its own soft bubble, like a caption, not a quote with a rule. */}
            <section className={`${ui.card} p-5 sm:p-6`}>
              {data.voice_he ? <p className="text-[15px] leading-7 text-[color:var(--ink-soft)]">{data.voice_he}</p> : null}
              {data.examples_he.length ? (
                <ul className={`${data.voice_he ? "mt-4" : ""} space-y-2`}>
                  {data.examples_he.map((line) => (
                    <li key={line} className={`${ui.inset} px-4 py-3 text-base font-semibold leading-7 text-[color:var(--ink)]`}>
                      {line}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[15px] leading-7 text-[color:var(--ink-soft)]">עוד לא קראנו דוגמאות מהאתר. ספרו לנו במילים שלכם איך אתם מדברים.</p>
              )}
            </section>

            {check && !adjusting ? (
              <p className="mt-8 flex flex-wrap items-center gap-x-3 text-[15px] leading-7 text-[color:var(--ink)]">
                <span className={`${ui.status} text-[15px] font-medium text-[color:var(--ink)]`} data-status={check.ok ? "published" : "review"}>
                  {check.ok ? "אישרתם: כותבים בסגנון הזה." : `ביקשתם לשנות: ${check.note || "בלי פרטים"}.`}
                </span>{" "}
                <button type="button" onClick={() => setAdjusting(true)} className={ui.link}>
                  לשנות
                </button>
              </p>
            ) : (
              <div className="mt-8">
                <button
                  type="button"
                  onClick={() => void answer(true)}
                  disabled={saving}
                  className="drawn-button inline-flex min-h-12 w-full items-center justify-center bg-[var(--primary)] px-6 text-[15px] text-white enabled:hover:bg-[var(--primary-dark)] sm:w-auto"
                >
                  כן, ככה אנחנו מדברים
                </button>
                <div className="mt-8 border-t border-[var(--rule)] pt-6">
                  <label htmlFor="voice-note" className={`${ui.groupTitle} mb-2 block`}>
                    לא בדיוק? מה לשנות
                  </label>
                  <textarea
                    id="voice-note"
                    value={note}
                    maxLength={400}
                    rows={3}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="למשל: פחות רשמי, בלי אימוג׳ים, לפנות בלשון רבים"
                    className={ui.field}
                  />
                  <button
                    type="button"
                    onClick={() => void answer(false)}
                    disabled={saving || !note.trim()}
                    className={`${ui.button} mt-3`}
                  >
                    לשמור את התיקון
                  </button>
                </div>
              </div>
            )}

            {error ? (
              <p role="alert" className={`${ui.error} mt-6`}>
                {error}
              </p>
            ) : null}
            <div className="mt-6 flex flex-col items-start">
              {check ? (
                <Link href="/dashboard" className={ui.link}>
                  לצעד הבא
                  <IconArrowLeft data-forward="" />
                </Link>
              ) : null}
              <StepLink stepKey="voice" />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
