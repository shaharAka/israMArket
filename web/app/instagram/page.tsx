"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LoadingMark } from "@/components/Doodles";
import { HandlesEditor } from "@/components/instagram/HandlesEditor";
import { LearnedList } from "@/components/instagram/LearnedList";
import { OwnTopPosts } from "@/components/instagram/OwnTopPosts";
import { SectionHeader } from "@/components/SectionHeader";
import { endpoints, type InstagramBriefPayload } from "@/lib/api";
import { IconArrowLeft } from "@/lib/icons";
import { toast } from "@/lib/ui";

/**
 * What the post writer learned from Instagram, in the owner's words.
 *
 * Posts used to come out generic because the writer saw nothing from Instagram. Now it
 * learns from the business's own best posts and from accounts the owner names, and this
 * page is where the owner (a) names those accounts, (b) reads what was learned, each
 * lesson pointing at the real post it came from, and (c) is asked to connect Instagram
 * when it is not — the one dark button in that state. Connected, the page asks for
 * nothing unless there is no brief yet, and then its one ask is to build it.
 */
export default function InstagramPage() {
  const [data, setData] = useState<InstagramBriefPayload | null>(null);
  const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState("");
  const [failures, setFailures] = useState<Record<string, string>>({});

  useEffect(() => {
    endpoints
      .instagramBrief()
      .then(setData)
      .catch((err) => setLoadError(err instanceof Error ? err.message : "לא הצלחנו לטעון את הנתונים."));
  }, []);

  async function refresh() {
    setRefreshing(true);
    setRefreshNote("");
    try {
      const result = await endpoints.refreshInstagramBrief();
      const { refresh: outcome, ...payload } = result;
      setData(payload);
      setFailures(
        Object.fromEntries(outcome.competitors.filter((item) => !item.ok).map((item) => [item.handle, item.error_he]))
      );
      if (outcome.status === "empty") setRefreshNote(outcome.reason_he);
      else toast("למדנו מחדש מהאינסטגרם");
    } catch (err) {
      setRefreshNote(err instanceof Error ? err.message : "הלמידה נכשלה. נסו שוב בעוד כמה דקות.");
    } finally {
      setRefreshing(false);
    }
  }

  const header = <SectionHeader section="business" title="מה עובד באינסטגרם" />;

  if (!data) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl">
          {header}
          {loadError ? (
            <p role="alert" className="text-sm text-[#9f4330]">
              {loadError}
            </p>
          ) : (
            <LoadingMark label="טוענים את מה שלמדנו…" />
          )}
        </div>
      </AppShell>
    );
  }

  const connected = data.meta_connected;
  const brief = data.brief;
  // The page's one dark button: connect when not connected; build the first brief when
  // connected and there is none. Once a brief exists, relearning is a quiet control.
  const refreshIsPrimary = connected && !brief;
  // Accounts the stored brief could not read (not found, not a business account…), so a
  // typo shows on its chip without a fresh refresh. A refresh's own answer overrides it.
  const briefFailures: Record<string, string> = Object.fromEntries(
    (brief?.sources.competitors ?? [])
      .filter((entry) => !entry.ok && entry.error_he)
      .map((entry) => [entry.handle, entry.error_he])
  );

  const refreshButton = connected ? (
    <button
      type="button"
      onClick={() => void refresh()}
      disabled={refreshing}
      aria-busy={refreshing}
      className={
        refreshIsPrimary
          ? "mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-md bg-[#20211f] px-6 text-sm font-bold text-white disabled:bg-[#c7c6c0] sm:w-auto"
          : "inline-flex min-h-10 shrink-0 items-center rounded-full border border-[#cecdc7] bg-white px-3.5 text-sm font-bold text-[#20211f] hover:bg-[#f4f3ee] disabled:opacity-50"
      }
    >
      {refreshing ? "לומדים…" : refreshIsPrimary ? "ללמוד מהאינסטגרם" : "ללמוד מחדש"}
    </button>
  ) : null;

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        {header}

        <div className="space-y-7">
          {connected ? null : (
            <section className="rounded-lg border border-[#cecdc7] bg-white p-4 sm:p-5">
              <p className="text-base font-black text-[#20211f]">האינסטגרם עוד לא מחובר</p>
              {data.meta_ready ? (
                <>
                  <p className="mt-1 text-sm leading-6 text-[#3c3e3a]">
                    אחרי החיבור הפוסטים ילמדו ממה שכבר עבד לכם ומהחשבונות שתבחרו.
                  </p>
                  <Link
                    href="/integrations"
                    className="group mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[#20211f] px-6 text-sm font-bold text-white transition-colors hover:bg-[#343632] sm:w-auto"
                  >
                    לחבר את האינסטגרם
                    <IconArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-1" />
                  </Link>
                </>
              ) : (
                <p className="mt-1 text-sm leading-6 text-[#3c3e3a]">{data.empty_reason}</p>
              )}
            </section>
          )}

          {connected || brief ? (
            <section aria-labelledby="learned-heading">
              <div className="flex items-center justify-between gap-3">
                <h2 id="learned-heading" className="text-base font-black text-[#20211f]">
                  מה למדנו
                </h2>
                {brief ? refreshButton : null}
              </div>
              {brief ? (
                <LearnedList brief={brief} />
              ) : (
                <>
                  <p className="mt-1 text-sm leading-6 text-[#3c3e3a]">{data.empty_reason}</p>
                  {refreshButton}
                </>
              )}
              {refreshNote ? (
                <p role="status" className="mt-2 text-sm leading-6 text-[#7a5216]">
                  {refreshNote}
                </p>
              ) : null}
            </section>
          ) : null}

          <OwnTopPosts posts={data.own_top_posts} />

          <HandlesEditor
            handles={data.handles}
            max={data.max_handles}
            failures={{ ...briefFailures, ...failures }}
            onSaved={(handles) => setData((prev) => (prev ? { ...prev, handles } : prev))}
          />
        </div>
      </div>
    </AppShell>
  );
}
