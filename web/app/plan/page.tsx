"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AppShell } from "@/components/AppShell";
import { LoadingMark } from "@/components/Doodles";
import { SectionHeader } from "@/components/SectionHeader";
import { endpoints, isDemo, type StrategyPayload } from "@/lib/api";
import { SECTIONS } from "@/lib/sections";
import { IconArrowLeft, IconBell, IconFlag } from "@/lib/icons";

/**
 * The demo flag lives in localStorage, so it may only be read on the client — a server
 * render would disagree and hydration would warn. `useSyncExternalStore` is the sanctioned
 * way to read a client-only value during render: the server snapshot is `false`, the
 * client snapshot is the real flag, and React reconciles the two after hydration.
 * Nothing writes it while the page is open, so the subscription is a no-op that still
 * keeps the value live if another tab flips it.
 */
function subscribeDemo(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}
function demoSnapshot() {
  return isDemo();
}
function demoServerSnapshot() {
  return false;
}

/**
 * The quarterly plan.
 *
 * This lived in the payload from the start but was never rendered anywhere, so the owner
 * only ever saw a month. The layout is a three-column track because the point of the
 * screen is that the months are stages in sequence — a stack of cards hid that.
 *
 * What the page did not have was an ask: five headings, eight bordered boxes and no
 * button, so it read as reference material the owner had to decide what to do with. The
 * one ask is the monthly plan — this page is the quarter, and the quarter is only
 * actionable month by month — so `התוכנית של ספטמבר — מה עושים החודש` is the single dark
 * button, and every block below it is one container with hairline dividers instead of a
 * box per idea. Nothing was cut: the hypothesis, the ranked targets, the stage track and
 * the management/checkpoints block all still carry the same content.
 */
export default function PlanPage() {
  const [strategy, setStrategy] = useState<StrategyPayload | null>(null);
  const [error, setError] = useState("");
  const demo = useSyncExternalStore(subscribeDemo, demoSnapshot, demoServerSnapshot);
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
      <div className="mx-auto max-w-4xl">
        <SectionHeader
          section="plan"
          title="לאן אנחנו הולכים"
          subtitle={`${plan?.horizon || "הרבעון הקרוב"} — הרבעון הוא הכיוון. כל חודש הוא אבן דרך אחת בדרך אליו.`}
          action={
            strategy ? (
              <Link
                href="/strategy"
                className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[#20211f] px-4 text-sm font-bold text-white transition-colors hover:bg-[#343632]"
              >
                התוכנית של {strategy.month_name_he} — מה עושים החודש
                <IconArrowLeft className="h-4 w-4" />
              </Link>
            ) : undefined
          }
        />

        {error ? (
          <p className="rounded-md border border-[#eed1c9] bg-[#fbf2ef] px-4 py-3 text-sm text-[#9f4330]">
            {error}
          </p>
        ) : null}

        {demo ? <p className="mb-5 text-xs text-[#685f47]">מצב הדגמה — הנתונים לדוגמה.</p> : null}

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
          // One container, hairline dividers between ideas: the quarter is a single
          // statement, not four equal-weight rectangles.
          <div className="divide-y divide-[#e9e8e3] rounded-lg border border-[#e6e4dc] bg-white">
            {/* The bet the whole quarter rests on. */}
            <section className="p-4 sm:p-5">
              <p className="text-[11px] font-bold" style={{ color: identity.accent }}>
                ההשערה שמחזיקה את הרבעון
              </p>
              <h2 className="mt-1.5 text-lg leading-7 font-black text-[#20211f]">{plan.hypothesis}</h2>
            </section>

            <section className="p-4 sm:p-5">
              <h2 className="flex items-center gap-2 text-sm font-black text-[#20211f]">
                <span style={{ color: identity.accent }}>
                  <IconFlag className="h-4 w-4" />
                </span>
                היעדים, לפי סדר החשיבות
              </h2>
              <p className="mt-1 text-xs text-[#8b8e84]">
                הסדר הזה נקבע על ידכם. היעד הראשון הוא המוביל, והתוכניות נבנות סביבו.
              </p>
              <ol className="mt-2.5 space-y-1.5">
                {plan.targets.map((target, index) => (
                  <li key={`${target}-${index}`} className="flex items-start gap-2.5">
                    <span
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                      style={
                        index === 0
                          ? { background: identity.accent, color: "#fff" }
                          : { border: "1px solid #dedcd4", color: "#5e6159" }
                      }
                    >
                      {index + 1}
                    </span>
                    <span
                      className={`text-sm leading-6 ${
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
            <section className="p-4 sm:p-5">
              <h2 className="text-sm font-black text-[#20211f]">השלבים — חודש אחר חודש</h2>
              <p className="mt-1 text-xs text-[#8b8e84]">
                כל חודש נסגר בנקודת בקרה. אם משהו לא עובד — מתקנים לפני החודש הבא.
              </p>

              <ol className="relative mt-4 grid gap-5 sm:grid-cols-3 sm:gap-4">
                <span
                  aria-hidden
                  className="absolute top-3 right-0 left-0 hidden h-px sm:block"
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
                    <div className="min-w-0 flex-1 sm:mt-3">
                      <span className="text-[11px] font-bold text-[#8b8e84]">{milestone.month_label}</span>
                      <span className="mt-0.5 block text-sm leading-6 font-bold text-[#20211f]">
                        {milestone.milestone}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-[#5e6159]">
                        <span className="font-bold text-[#3c3e3a]">נקודת בקרה: </span>
                        {milestone.checkpoint}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            {management ? (
              <section className="p-4 sm:p-5">
                <h2 className="flex items-center gap-2 text-sm font-black text-[#20211f]">
                  <span style={{ color: identity.accent }}>
                    <IconBell className="h-4 w-4" />
                  </span>
                  מה אנחנו עושים, ומתי נצטרך אתכם
                </h2>
                {management.how_we_help ? (
                  <p className="mt-1.5 text-sm leading-6 text-[#3c3e3a]">{management.how_we_help}</p>
                ) : null}

                {/* Two columns, tight rows: four reminders and four checkpoint windows used to
                    cost far more height for what is a list of short lines. */}
                <div className="mt-3 grid gap-x-8 gap-y-4 border-t border-[#efeee9] pt-3 sm:grid-cols-2">
                  {management.when_we_need_user?.length ? (
                    <div>
                      <span className="text-[11px] font-bold text-[#8b8e84]">נצטרך מכם</span>
                      <ul className="mt-2 space-y-1">
                        {management.when_we_need_user.map((item, index) => (
                          <li
                            key={`${item}-${index}`}
                            className="flex items-start gap-2 text-xs leading-5 text-[#3c3e3a]"
                          >
                            <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#b3b0a5]" />
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
                          <li key={`${checkpoint.timing}-${index}`} className="text-xs leading-5">
                            <span className="font-bold text-[#20211f]">{checkpoint.timing}</span>
                            <span className="text-[#5e6159]">
                              {" — "}
                              {checkpoint.purpose}
                            </span>
                            {checkpoint.user_action ? (
                              <span className="block text-[#3c3e3a]">
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
          </div>
        ) : null}

        {plan ? (
          <p className="mt-5 border-t border-[#deddd8] pt-4">
            <Link href="/decisions" className="text-sm font-bold text-[#5e6159] underline underline-offset-4">
              לשינוי היעדים, התקציב והאבחון
            </Link>
          </p>
        ) : null}
      </div>
    </AppShell>
  );
}
