"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LoadingMark, Scribble } from "@/components/Doodles";
import { MonthAhead } from "@/components/MonthAhead";
import { endpoints, type Business, type RecommendationPayload, type StrategyPayload } from "@/lib/api";
import { IconArrowLeft, IconCheck, IconImage } from "@/lib/icons";

export default function DashboardPage() {
  const [business, setBusiness] = useState<Business | null>(null);
  const [strategy, setStrategy] = useState<StrategyPayload | null>(null);
  const [recommendation, setRecommendation] = useState<RecommendationPayload | null>(null);

  useEffect(() => {
    Promise.all([endpoints.business(), endpoints.strategy()]).then(([businessResult, strategyResult]) => {
      setBusiness(businessResult.business);
      setStrategy(strategyResult);
    });
    endpoints.recommendations().then(setRecommendation).catch(() => {});
  }, []);

  const posts = strategy?.roadmap?.posts || [];
  const nextIndex = posts.findIndex((post) => post.approval_status !== "approved");
  const reviewIndex = nextIndex >= 0 ? nextIndex : 0;
  const nextPost = posts[reviewIndex];
  const approvedCount = posts.filter((post) => post.approval_status === "approved").length;
  const monthly = strategy?.monthly_horizon_plan || strategy?.roadmap?.monthly_horizon_plan;
  const weeks = strategy?.weekly_breakdown || strategy?.roadmap?.weekly_breakdown || [];
  const nextUserAction = weeks.flatMap((week) => week.what_user_does || []).find(Boolean);
  const allApproved = posts.length > 0 && approvedCount === posts.length;

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl">
        <header className="border-b border-[#deddd8] pb-6">
          <p className="text-xs font-bold text-[#747570]">
            {business?.name ? `${business.name} · ` : ""}
            {strategy ? `${strategy.month_name_he} ${strategy.year}` : "החודש הנוכחי"}
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-[#20211f]">החודש שלך</h1>
          <Scribble className="mt-2" />
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#62635f]">
            אנחנו מנהלים את השיווק. כאן תראו רק מה מתקדם ומה באמת דורש החלטה שלכם.
          </p>
        </header>

        {strategy ? (
          <div className="rise-stagger space-y-9 py-7">
            <section>
              <p className="text-xs font-bold text-[#747570]">הכיוון החודשי</p>
              <h2 className="mt-2 max-w-3xl text-xl font-black leading-8 text-[#20211f] sm:text-2xl">
                {monthly?.hypothesis || strategy.usp.growth_hypothesis || strategy.roadmap.theme}
              </h2>
            </section>

            <section className="rounded-lg border border-[#cecdc7] bg-white">
              <div className="border-b border-[#e9e8e3] px-5 py-4">
                <p className="text-xs font-bold text-[#747570]">
                  {allApproved ? "הכול אושר" : "הדבר היחיד שצריך מכם עכשיו"}
                </p>
              </div>

              {allApproved ? (
                <div className="flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#343632] text-white">
                      <IconCheck className="h-4 w-4" />
                    </span>
                    <div>
                      <h2 className="text-lg font-black text-[#20211f]">הפוסטים של החודש אושרו</h2>
                      <p className="mt-1 text-sm leading-6 text-[#62635f]">
                        אנחנו ממשיכים לעקוב אחרי הביצועים ולהתאים את ההמשך.
                      </p>
                    </div>
                  </div>
                </div>
              ) : nextPost ? (
                <div className="grid gap-5 p-5 sm:p-6 md:grid-cols-[112px_1fr_auto] md:items-center">
                  <div className="relative aspect-square overflow-hidden rounded-md bg-[#f0efeb]">
                    {nextPost.image_url ? (
                      <Image
                        src={nextPost.image_url}
                        alt={nextPost.title}
                        width={224}
                        height={224}
                        unoptimized
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full items-center justify-center text-[#898a85]">
                        <IconImage className="h-6 w-6" />
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[#747570]">
                      פוסט {reviewIndex + 1} מתוך {posts.length} · {nextPost.date_hint}
                    </p>
                    <h2 className="mt-1 text-lg font-black text-[#20211f]">{nextPost.title}</h2>
                    <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#62635f]">{nextPost.caption}</p>
                  </div>
                  <Link
                    href={`/posts?i=${reviewIndex}`}
                    className="group inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[#20211f] px-5 text-sm font-bold text-white transition-colors hover:bg-[#343632] md:w-auto"
                  >
                    לבדוק ולאשר
                    <IconArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-1" />
                  </Link>
                </div>
              ) : (
                <p className="p-6 text-sm text-[#62635f]">אנחנו עדיין מכינים את התוכן לחודש.</p>
              )}
            </section>

            <MonthAhead horizon={strategy.horizon} onReady={setStrategy} />

            {recommendation?.suggestions?.suggestions?.[0] ? (
              <section className="rounded-lg border border-[#e2d7c3] bg-[#fcf9f2] px-5 py-4">
                <p className="text-xs font-bold text-[#685f47]">הדבר האחד השבוע</p>
                <h2 className="mt-1 text-lg font-black text-[#191b18]">
                  {recommendation.suggestions.suggestions[0].title}
                </h2>
                <p className="mt-1 text-sm leading-6 text-[#5e6159]">
                  {recommendation.suggestions.suggestions[0].action}
                </p>
              </section>
            ) : null}

            <section className="grid gap-8 border-y border-[#deddd8] py-7 sm:grid-cols-2">
              <div>
                <h2 className="text-sm font-black text-[#20211f]">אנחנו מטפלים עכשיו</h2>
                <ul className="mt-4 space-y-3">
                  <StatusRow text={`${posts.length} פוסטים נכתבו והותאמו לערוצים`} />
                  <StatusRow text="התוצאות נאספות ונבדקות לאורך החודש" />
                  <StatusRow text="התוכנית הבאה תותאם לפי מה שעובד" />
                </ul>
              </div>
              <div>
                <h2 className="text-sm font-black text-[#20211f]">צריך מכם</h2>
                <p className="mt-4 text-sm font-bold leading-7 text-[#20211f]">
                  {nextUserAction || "כרגע לא צריך לעשות דבר."}
                </p>
                <p className="mt-1 text-xs leading-5 text-[#747570]">
                  נבקש מכם משהו רק כשנדרש מידע שאי אפשר להסיק מהנתונים.
                </p>
              </div>
            </section>

            <section>
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-lg font-black text-[#20211f]">מצב החודש</h2>
                  <p className="mt-1 text-sm text-[#747570]">אישור התוכן לפני שהמערכת ממשיכה.</p>
                </div>
                <p className="text-sm font-bold text-[#20211f]">{approvedCount}/{posts.length}</p>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e1e0db]">
                <div
                  className="h-full rounded-full bg-[#343632] transition-[width] duration-700 ease-out"
                  style={{ width: `${posts.length ? (approvedCount / posts.length) * 100 : 0}%` }}
                />
              </div>
            </section>
          </div>
        ) : (
          <LoadingMark label="אנחנו טוענים את מצב החודש…" />
        )}
      </div>
    </AppShell>
  );
}

function StatusRow({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2.5 text-sm leading-6 text-[#62635f]">
      <IconCheck className="mt-1 h-4 w-4 shrink-0 text-[#343632]" />
      <span>{text}</span>
    </li>
  );
}
