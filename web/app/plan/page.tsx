"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LoadingMark } from "@/components/Doodles";
import { SectionHeader } from "@/components/SectionHeader";
import { endpoints, isDemo, type StrategyPayload } from "@/lib/api";
import { SECTIONS } from "@/lib/sections";
import { IconArrowLeft, IconBell, IconFlag } from "@/lib/icons";

/**
 * The quarterly plan.
 *
 * This lived in the payload from the start but was never rendered anywhere, so the owner
 * only ever saw a month. The layout is a three-column track because the point of the
 * screen is that the months are stages in sequence — a stack of cards hid that.
 */
export default function PlanPage() {
  const [strategy, setStrategy] = useState<StrategyPayload | null>(null);
  const [error, setError] = useState("");
  const identity = SECTIONS.plan;

  useEffect(() => {
    endpoints
      .strategy()
      .then(setStrategy)
      .catch((err) => setError(err instanceof Error ? err.message : "שגיאה בטעינת התוכנית הרבעונית"));
  }, []);

  const plan = strategy?.long_horizon_plan || strategy?.roadmap?.long_horizon_plan;
  const management =
    strategy?.management_and_checkpoints || strategy?.roadmap?.management_and_checkpoints;

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        <SectionHeader
          section="plan"
          title="לאן אנחנו הולכים"
          subtitle={`${plan?.horizon || "הרבעון הקרוב"} — הרבעון הוא הכיוון. כל חודש הוא אבן דרך אחת בדרך אליו, וכל פוסט משרת את החודש.`}
        />

        {error ? (
          <p className="rounded-md border border-[#eed1c9] bg-[#fbf2ef] px-4 py-3 text-sm text-[#9f4330]">
            {error}
          </p>
        ) : null}

        {isDemo() && strategy ? (
          <p className="mb-5 rounded-md border border-[#e2d7c3] bg-[#fcf9f2] px-4 py-2 text-xs text-[#685f47]">
            מצב הדגמה — הנתונים לדוגמה.
          </p>
        ) : null}

        {!strategy && !error ? <LoadingMark /> : null}

        {strategy && !plan ? (
          <section className="rounded-lg border border-[#e6e4dc] bg-white p-6 text-center">
            <p className="text-sm text-[#5e6159]">
              אין עדיין תוכנית רבעונית לתוכנית הזו. אפשר לבנות אותה מחדש מהאשף.
            </p>
            <Link
              href="/onboarding"
              className="mt-4 inline-flex min-h-11 items-center rounded-md bg-[#20211f] px-4 text-sm font-bold text-white hover:bg-[#343632]"
            >
              לאשף הבנייה
            </Link>
          </section>
        ) : null}

        {plan ? (
          <div className="space-y-7">
            {/* The bet the whole quarter rests on. */}
            <section className="rounded-lg border p-6" style={{ borderColor: identity.border, background: identity.surface }}>
              <span className="text-[11px] font-bold" style={{ color: identity.accent }}>
                ההשערה שמחזיקה את הרבעון
              </span>
              <h2 className="mt-2 text-xl font-black leading-8 text-[#20211f]">{plan.hypothesis}</h2>
            </section>

            <section>
              <h2 className="flex items-center gap-2 text-sm font-black text-[#20211f]">
                <span style={{ color: identity.accent }}>
                  <IconFlag className="h-4 w-4" />
                </span>
                היעדים, לפי סדר החשיבות
              </h2>
              <p className="mt-1 text-xs text-[#8b8e84]">
                הסדר הזה נקבע על ידכם. היעד הראשון הוא המוביל, והתוכניות נבנות סביבו.
              </p>
              <ol className="mt-4 grid gap-3 sm:grid-cols-3">
                {plan.targets.map((target, index) => (
                  <li
                    key={`${target}-${index}`}
                    className="rounded-lg border bg-white p-4"
                    style={index === 0 ? { borderColor: identity.accent } : { borderColor: "#e6e4dc" }}
                  >
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold"
                      style={
                        index === 0
                          ? { background: identity.accent, color: "#fff" }
                          : { border: "1px solid #dedcd4", color: "#5e6159" }
                      }
                    >
                      {index + 1}
                    </span>
                    <span
                      className={`mt-3 block text-sm leading-6 ${
                        index === 0 ? "font-bold text-[#20211f]" : "text-[#3c3e3a]"
                      }`}
                    >
                      {target}
                    </span>
                  </li>
                ))}
              </ol>
            </section>

            {/* The stages, read left to right as a track rather than down a stack. */}
            <section>
              <h2 className="text-sm font-black text-[#20211f]">השלבים — חודש אחר חודש</h2>
              <p className="mt-1 text-xs text-[#8b8e84]">
                כל חודש נסגר בנקודת בקרה. אם משהו לא עובד — מתקנים לפני החודש הבא.
              </p>

              <ol className="relative mt-5 grid gap-6 sm:grid-cols-3 sm:gap-4">
                <span
                  aria-hidden
                  className="absolute right-0 left-0 top-3 hidden h-px sm:block"
                  style={{ background: identity.border }}
                />
                {plan.milestones.map((milestone, index) => (
                  <li key={`${milestone.month_label}-${index}`} className="relative flex gap-3 sm:block">
                    <span
                      className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                      style={{ background: identity.accent }}
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1 sm:mt-4">
                      <span className="text-[11px] font-bold text-[#8b8e84]">{milestone.month_label}</span>
                      <span className="mt-1 block text-sm font-bold leading-6 text-[#20211f]">
                        {milestone.milestone}
                      </span>
                      <span
                        className="mt-2 block rounded-md border px-3 py-2 text-xs leading-5 text-[#5e6159]"
                        style={{ borderColor: identity.border, background: identity.surface }}
                      >
                        <span className="font-bold text-[#3c3e3a]">נקודת בקרה: </span>
                        {milestone.checkpoint}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            {management ? (
              <section className="rounded-lg border border-[#e6e4dc] bg-white p-6">
                <h2 className="flex items-center gap-2 text-sm font-black text-[#20211f]">
                  <span style={{ color: identity.accent }}>
                    <IconBell className="h-4 w-4" />
                  </span>
                  מה אנחנו עושים, ומתי נצטרך אתכם
                </h2>
                {management.how_we_help ? (
                  <p className="mt-3 text-sm leading-6 text-[#3c3e3a]">{management.how_we_help}</p>
                ) : null}

                <div className="mt-5 grid gap-6 sm:grid-cols-2">
                  {management.when_we_need_user?.length ? (
                    <div>
                      <span className="text-[11px] font-bold text-[#8b8e84]">נצטרך מכם</span>
                      <ul className="mt-2 space-y-1.5">
                        {management.when_we_need_user.map((item, index) => (
                          <li
                            key={`${item}-${index}`}
                            className="flex items-start gap-2 text-sm leading-6 text-[#3c3e3a]"
                          >
                            <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#b3b0a5]" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {management.checkpoints?.length ? (
                    <div>
                      <span className="text-[11px] font-bold text-[#8b8e84]">נקודות בקרה</span>
                      <ul className="mt-2 space-y-2">
                        {management.checkpoints.map((checkpoint, index) => (
                          <li
                            key={`${checkpoint.timing}-${index}`}
                            className="rounded-md border border-[#e6e4dc] bg-[#f8f7f4] p-3"
                          >
                            <span className="text-xs font-bold text-[#20211f]">{checkpoint.timing}</span>
                            <span className="mt-1 block text-xs leading-5 text-[#5e6159]">
                              {checkpoint.purpose}
                            </span>
                            {checkpoint.user_action ? (
                              <span className="mt-1 block text-xs leading-5 text-[#3c3e3a]">
                                <span className="font-bold">מה שצריך מכם: </span>
                                {checkpoint.user_action}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[#deddd8] pt-5">
              <Link
                href="/strategy"
                className="inline-flex items-center gap-2 text-sm font-bold text-[#20211f] underline underline-offset-4"
              >
                <IconArrowLeft className="h-4 w-4" />
                לתוכנית של {strategy?.month_name_he} — מה עושים החודש
              </Link>
              <Link href="/decisions" className="text-sm font-bold text-[#5e6159] underline underline-offset-4">
                לשינוי היעדים, התקציב והאבחון
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
