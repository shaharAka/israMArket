"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { QuickPost, type QuickPostDraft } from "@/components/posts/QuickPost";
import { FirstPosts } from "@/components/posts/FirstPosts";
import { MonthBuildProgress } from "@/components/MonthBuildProgress";
import { PostEditor } from "@/components/PostEditor";
import { RecommendationReview } from "@/components/results/RecommendationReview";
import { CalendarView } from "@/components/posts/CalendarView";
import { PostFeed } from "@/components/posts/PostFeed";
import { isDone, nextPendingIndex } from "@/components/posts/postMeta";
import { ownerNeedsOf } from "@/lib/postLifecycle";
import { useCopy, useLanguage } from "@/components/language/LanguageProvider";
import ui from "@/components/posts/chrome.module.css";
import { ApiError, endpoints, isPlanRequired, type PublishQueue, type StrategyPayload } from "@/lib/api";
import { IconArrowLeft, IconChevron } from "@/lib/icons";
import { useImageJob } from "@/lib/useImageJob";
import { LOCALE_META } from "@/lib/i18n/locales";

/**
 * What the header's due line depends on.
 *
 * Image work rewrites the strategy on almost every click and never moves a post between
 * the queue's buckets, so the queue is refetched on the fields that do: approving a post,
 * giving it a date, and marking it as published. Without that, the line would keep saying
 * "nothing is waiting" right after the owner scheduled something for today.
 */
function queueSignature(strategy: StrategyPayload | null) {
  return (strategy?.roadmap?.posts ?? [])
    .map(
      (post) =>
        `${post.approval_status || ""}|${post.scheduled_for || ""}|${post.published_url || ""}|${post.published_at || ""}`
    )
    .join(",");
}

/**
 * The page's state lives in the URL, so the phone's back button does what the owner expects
 * and other pages can link straight to a post:
 *
 *   /posts                 the month's feed
 *   /posts?post=<index>    one post in the editor (index = its place in the month, from 0)
 *   /posts?view=calendar   the month view
 *
 * `?i=<index>` is the older spelling of `?post=` and is still accepted.
 */
function readLocation(params: URLSearchParams | ReturnType<typeof useSearchParams>) {
  const raw = params.get("post") ?? params.get("i");
  return {
    post: raw !== null && /^\d+$/.test(raw) ? Number(raw) : null,
    calendar: params.get("view") === "calendar",
    creating: params.get("create") === "1",
  };
}

function go(query: string, mode: "push" | "replace") {
  const next = new URLSearchParams(query);
  const language = new URLSearchParams(window.location.search).get("lang");
  if (language) next.set("lang", language);
  const url = next.size ? `/posts?${next}` : "/posts";
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

/** List or month — a quiet two-way switch, not a second call to action. */
function ViewToggle({ calendar, onChange }: { calendar: boolean; onChange: (calendar: boolean) => void }) {
  const t = useCopy();
  return (
    <div role="group" aria-label={t("תצוגה")} className={`${ui.segmented} shrink-0`}>
      <button type="button" aria-pressed={!calendar} onClick={() => onChange(false)}>
        {t("רשימה")}
      </button>
      <button type="button" aria-pressed={calendar} onClick={() => onChange(true)}>
        {t("לוח")}
      </button>
    </div>
  );
}

function PostsWorkspace() {
  const t = useCopy();
  const [quickDraft, setQuickDraft] = useState<QuickPostDraft | null>(null);
  const { locale } = useLanguage();
  const params = useSearchParams();
  const location = readLocation(params);
  const reviewing = params.has("recommendation");
  const reviewPlan = params.get("plan");
  const reviewUid = params.get("post_uid");
  const [strategy, setStrategy] = useState<StrategyPayload | null>(null);
  const [error, setError] = useState("");
  const [readNeedsPlan, setReadNeedsPlan] = useState(false);
  const [noMonth, setNoMonth] = useState(false);
  // Bumped when the posts being written on the server are done: load them again.
  const [reload, setReload] = useState(0);
  const [queue, setQueue] = useState<PublishQueue | null>(null);

  // Whether the open post was reached from this page's own feed. Closing it then steps
  // back through history, so the feed is where it was; a post opened from a link elsewhere
  // closes onto the feed instead of leaving the app.
  const openedHere = useRef(false);
  const feedScroll = useRef(0);

  useEffect(() => {
    // The older `?i=` spelling becomes the current one, without a new history entry.
    const current = new URLSearchParams(window.location.search);
    const legacy = current.get("i");
    if (legacy !== null && current.get("post") === null) go(`post=${legacy}`, "replace");
  }, []);

  // The posts' images are made on the server, once, when the month's posts are written (or
  // when the owner asks for one in the editor). Opening this page never starts or pays for
  // them (#123): it reads the image job and loads the month again as each image lands.
  const imageJob = useImageJob({ refreshKey: reload, onProgress: () => setReload((n) => n + 1) });

  useEffect(() => {
    let active = true;
    async function loadPosts() {
      try {
        const current = await endpoints.postsWorkspace();
        if (!active) return;
        setStrategy(current);
        setError("");
        setReadNeedsPlan(false);
        setNoMonth(false);
      } catch (err) {
        if (!active) return;
        // No month yet (right after /start, while it is written) is a normal state with
        // its own screen, not an error. A 401 is AppShell's redirect to make.
        if (err instanceof ApiError && err.status === 404) setNoMonth(true);
        else if (!(err instanceof ApiError && err.status === 401)) {
          setReadNeedsPlan(isPlanRequired(err));
          setError(err instanceof ApiError && err.status > 0 && err.status < 500 ? err.message : "לא הצלחנו לטעון את הפוסטים.");
        }
      }
    }
    void loadPosts();
    return () => {
      active = false;
    };
  }, [reload, reviewing]);

  const signature = queueSignature(strategy);

  // One cheap read of the same month the editor is showing, so the header and the editor
  // can never disagree about what is due — the grouping rules live on the server.
  useEffect(() => {
    if (!signature) return;
    let active = true;
    endpoints
      .publishQueue()
      .then((result) => {
        if (active) setQueue(result);
      })
      .catch(() => {
        if (active) setQueue(null);
      });
    return () => {
      active = false;
    };
  }, [signature]);

  const posts = strategy?.roadmap?.posts ?? [];
  function retryRead() { setError(""); setReadNeedsPlan(false); setNoMonth(false); setReload(n => n + 1); }
  const readRecovery = readNeedsPlan ? <Link href="/billing" className={`${ui.link} mt-2 min-h-11`}>{t("למנוי שלי")}</Link> : <button type="button" className={`${ui.link} mt-2 min-h-11`} onClick={retryRead}>{t("לטעון את הפוסטים שוב")}</button>;
  const matching = reviewUid ? posts.map((post, index) => post.uid === reviewUid ? index : -1).filter(index => index >= 0) : [];
  const reviewPost = matching.length === 1 ? posts[matching[0]] : null;
  const guardedIndex = reviewing
    ? reviewPlan === String(strategy?.id) && reviewPost && !reviewPost.published_at && !reviewPost.published_url ? matching[0] : null
    : location.post;
  const openIndex = guardedIndex !== null && guardedIndex < posts.length ? guardedIndex : null;

  // Coming back to the feed returns to the row the owner tapped, not the top of the list.
  const editorOpen = openIndex !== null;
  useEffect(() => {
    if (!editorOpen) window.scrollTo(0, feedScroll.current);
  }, [editorOpen]);

  function openPost(index: number) {
    feedScroll.current = window.scrollY;
    openedHere.current = true;
    go(`post=${index}`, "push");
    window.scrollTo(0, 0);
  }

  function closeEditor() {
    if (openedHere.current) {
      openedHere.current = false;
      window.history.back();
      return;
    }
    feedScroll.current = 0;
    go("", "replace");
  }

  /** The editor moving on to another post (after an approval) replaces, never stacks. */
  function moveEditor(index: number) {
    go(`post=${index}`, "replace");
    window.scrollTo(0, 0);
  }

  if (location.post !== null && !strategy && !noMonth) {
    return error ? (
      <div role="alert" className={`${ui.error} mx-auto max-w-3xl`}>
        <p>{t(error)}</p>
        {readRecovery}
      </div>
    ) : (
      <p className="mx-auto max-w-3xl text-sm text-[color:var(--ink-muted)]">{t("טוענים את הפוסט…")}</p>
    );
  }

  if (strategy && openIndex !== null) {
    return (
      <div>
        <RecommendationReview planId={strategy.id} postUid={posts[openIndex].uid} />
        <PostEditor
          key={`${strategy.id}-${openIndex}`}
          posts={posts}
          strategy={strategy}
          brandLanguage={strategy.brand_language}
          initialIndex={openIndex}
          onStrategyUpdated={setStrategy}
          onNavigate={moveEditor}
          onClose={closeEditor}
          imagesWaiting={imageJob?.waiting}
        />
      </div>
    );
  }

  const doneCount = posts.filter(isDone).length;
  const firstPending = nextPendingIndex(posts, -1);
  const due = queue?.due[0];
  // Only the real queue establishes that a post is due. Complete one first publication
  // before asking the owner to approve more of the batch; preserve later scheduling.
  const firstPublicationDue = due && !posts.some((post) => (post.published_url || "").trim() || post.published_at);
  const showDue = Boolean(due && firstPending >= 0 && !firstPublicationDue);
  // The page's one ask is the next post that needs the owner, worded as what it needs.
  const primary =
    strategy && !location.calendar && !location.creating
      ? firstPublicationDue
        ? { label: "לפרסם את הפוסט הראשון", index: due.index }
        : firstPending >= 0
        ? {
            label: ownerNeedsOf(posts[firstPending]).some((need) => need.kind === "photo")
              ? "להוסיף תמונה לפוסט"
              : doneCount
                ? "להמשיך לאשר"
                : "להתחיל לאשר",
            index: firstPending,
          }
        : due
          ? { label: "לפרסם את הפוסט של היום", index: due.index }
          : null
      : null;

  return (
    // The month view needs the width; a list of rows does not, and at 1100px a row's title
    // and its arrow ended up a screen apart.
    <div className={`mx-auto ${location.calendar && posts.length ? "max-w-6xl" : "max-w-3xl"}`}>
      <RecommendationReview planId={strategy?.id} targetUnavailable={reviewing && Boolean(strategy) && openIndex === null} />
      <header>
        {!strategy?.post_workspace_only ? <Link href="/strategy" className={`${ui.link} ${ui.linkQuiet} -my-2 text-[13px] font-medium`}>
          {t("כלי הביצוע של התוכנית")}
        </Link> : null}
        <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-tight text-[color:var(--ink)] sm:text-[32px]">
          {strategy && !strategy.post_workspace_only ? t("הפוסטים של {arg_0}", { arg_0: new Intl.DateTimeFormat(LOCALE_META[locale].formatLocale, { month: "long" }).format(new Date(strategy.year, strategy.month - 1, 1)) }) : t("הפוסטים")}
        </h1>

        {posts.length && !location.creating ? <Link href="/campaign" className={`${ui.link} mt-3 min-h-11 me-5`}>{t("לראות את הקמפיין")}</Link> : null}
        {!location.creating ? <button type="button" className={`${ui.link} mt-3 min-h-11`} onClick={() => go("create=1", "push")}>{t("ליצור פוסט משלכם")}</button> : null}
        {!location.creating ? <div className="mt-5 flex items-center justify-between gap-4">
          {strategy && !strategy.post_workspace_only && posts.length && !location.creating ? (
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <p className="shrink-0 text-sm font-semibold tabular-nums text-[color:var(--ink)]">
                {t("{arg_0} מתוך {arg_1} אושרו", { arg_0: doneCount, arg_1: posts.length })}
              </p>
              <div
                role="progressbar"
                aria-label={t("פוסטים שאושרו החודש")}
                aria-valuemin={0}
                aria-valuemax={posts.length}
                aria-valuenow={doneCount}
                className="h-1.5 max-w-36 flex-1 overflow-hidden rounded-full bg-[var(--rule)]"
              >
                <div
                  className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-500"
                  style={{ width: `${(doneCount / posts.length) * 100}%` }}
                />
              </div>
            </div>
          ) : (
            <span />
          )}
          {posts.length ? (
            <ViewToggle
              calendar={location.calendar}
              onChange={(calendar) => go(calendar ? "view=calendar" : "", "replace")}
            />
          ) : null}
        </div> : null}
      </header>

      {/* The rest of the month still being written: the weeks below are ready to work on
          now, and each new week joins them as it is saved. Nothing when no build runs. */}
      {strategy && !strategy.post_workspace_only && posts.length && !location.creating ? (
        <div className="mt-6 empty:hidden">
          <MonthBuildProgress
            kind="posts"
            onDone={() => setReload((n) => n + 1)}
            onProgress={() => setReload((n) => n + 1)}
          />
        </div>
      ) : null}

      {error ? (
        <div role="alert" className={`${ui.error} mt-6`}>
          <p>{t(error)}</p>
          {readRecovery}
        </div>
      ) : null}

      {/* The page's one filled button — the next thing we are asking for — and beside it the
          quieter "waiting to go out" line, in the sun because it is about today. */}
      {primary || showDue ? (
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
          {primary ? (
            <button
              type="button"
              onClick={() => openPost(primary.index)}
              className="drawn-button group inline-flex min-h-12 w-full items-center justify-center gap-2.5 bg-[var(--primary)] px-6 text-base text-white hover:bg-[var(--primary-dark)] sm:w-auto"
            >
              {t(primary.label)}
              <IconArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
            </button>
          ) : null}
          {showDue && due ? (
            <button
              type="button"
              onClick={() => openPost(due.index)}
              className="group inline-flex min-h-11 items-center gap-2.5 self-start rounded-full bg-[var(--sand)] ps-4 pe-3 text-sm font-semibold text-[color:var(--ink)] transition-colors hover:bg-[var(--sand-rule)] sm:self-auto"
            >
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-[var(--sun)] shadow-[0_0_0_3px_var(--paper)]" />
              {queue && queue.due.length > 1 ? t("{arg_0} פוסטים מחכים לפרסום", { arg_0: queue.due.length }) : t("פוסט אחד מחכה לפרסום")}
              <IconChevron className="h-4 w-4 shrink-0 text-[color:var(--sand-dark)] transition-transform duration-200 group-hover:-translate-x-0.5" />
            </button>
          ) : null}
        </div>
      ) : null}

      <QuickPost draft={quickDraft} onDraftChange={setQuickDraft} open={location.creating} onCancel={() => go("", "replace")} onCreated={(saved, index) => {
        setStrategy(saved); setNoMonth(false); setError("");
        openedHere.current = false;
        go(`post=${index}`, "replace"); window.scrollTo(0, 0);
      }} />
      {!location.creating ? <div className="mt-8">
        {!strategy ? (
          noMonth ? (
            <NoPostsYet onCreate={() => go("create=1", "push")} />
          ) : !error ? (
            <p className="text-sm text-[color:var(--ink-muted)]">{t("טוענים את הפוסטים של החודש…")}</p>
          ) : null
        ) : posts.length === 0 ? (
          <FirstPosts onDone={() => setReload((n) => n + 1)} onWeekReady={() => setReload((n) => n + 1)} />
        ) : location.calendar ? (
          <CalendarView
            strategy={strategy}
            initialYear={strategy.year}
            initialMonth={strategy.month}
            posts={posts}
            postsMonth={{ year: strategy.year, month: strategy.month }}
            onOpenPost={openPost}
          />
        ) : (
          <PostFeed posts={posts} brand={strategy.brand_language} strategy={strategy} onOpen={openPost} />
        )}
      </div> : null}
    </div>
  );
}

/**
 * No execution plan yet. Preparation is already inline when a plan exists; here
 * the owner must reach that plan first, without a competing connection checklist.
 */
function NoPostsYet({ onCreate }: { onCreate: () => void }) {
  // English intent: make a timely post now, or continue building the marketing plan.
  const t = useCopy();
  return (
    <section className={`${ui.card} px-6 py-12 text-center sm:px-10`}>
      <h2 className="text-lg font-bold tracking-tight text-[color:var(--ink)]">{t("יש לכם משהו לספר ללקוחות?")}</h2>
      <p className="mx-auto mt-2 max-w-md text-[15px] leading-7 text-[color:var(--ink-soft)]">
        {t("כתבו את הרעיון או הטקסט, והמשיכו לערוך את הפוסט.")}
      </p>
      <div className="mt-6 flex flex-col items-center gap-2">
        <button type="button" onClick={onCreate} className={ui.button}>{t("ליצור פוסט משלכם")}</button>
        <Link href="/strategy" className={`${ui.link} min-h-11`}>{t("להמשיך לתוכנית")}</Link>
      </div>
    </section>
  );
}

export default function PostsPage() {
  const t = useCopy();
  return (
    <AppShell>
      {/* The workspace reads the URL, which a prerender does not have (Next's rule for
          useSearchParams), so it renders inside its own Suspense boundary. */}
      <Suspense fallback={<p className="mx-auto max-w-3xl text-sm text-[color:var(--ink-muted)]">{t("טוענים את הפוסטים…")}</p>}>
        <PostsWorkspace />
      </Suspense>
    </AppShell>
  );
}
