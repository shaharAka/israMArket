"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { MonthBuildProgress } from "@/components/MonthBuildProgress";
import { PostEditor } from "@/components/PostEditor";
import { CalendarView } from "@/components/posts/CalendarView";
import { PostFeed } from "@/components/posts/PostFeed";
import { isDone, nextPendingIndex } from "@/components/posts/postMeta";
import { ownerNeedsOf } from "@/lib/postLifecycle";
import { StepLink } from "@/components/trial/StepLink";
import ui from "@/components/posts/chrome.module.css";
import { ApiError, endpoints, type PublishQueue, type StrategyPayload } from "@/lib/api";
import { IconArrowLeft, IconChevron } from "@/lib/icons";

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
  };
}

function go(query: string, mode: "push" | "replace") {
  const url = query ? `/posts?${query}` : "/posts";
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

/** List or month — a quiet two-way switch, not a second call to action. */
function ViewToggle({ calendar, onChange }: { calendar: boolean; onChange: (calendar: boolean) => void }) {
  return (
    <div role="group" aria-label="תצוגה" className={`${ui.segmented} shrink-0`}>
      <button type="button" aria-pressed={!calendar} onClick={() => onChange(false)}>
        רשימה
      </button>
      <button type="button" aria-pressed={calendar} onClick={() => onChange(true)}>
        לוח
      </button>
    </div>
  );
}

function PostsWorkspace() {
  const params = useSearchParams();
  const location = readLocation(params);
  const [strategy, setStrategy] = useState<StrategyPayload | null>(null);
  const [error, setError] = useState("");
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

  useEffect(() => {
    let active = true;
    async function loadPosts() {
      try {
        const current = await endpoints.strategy();
        if (!active) return;
        setStrategy(current);
        if (current.roadmap.posts.some((post) => !post.image_url)) {
          const prepared = await endpoints.generateAllPostImages();
          if (active) setStrategy(prepared.strategy);
          if (prepared.errors?.length) {
            setError(prepared.errors[0]);
          }
        }
      } catch (err) {
        if (!active) return;
        // No month yet (right after /start, while it is written) is a normal state with
        // its own screen, not an error. A 401 is AppShell's redirect to make.
        if (err instanceof ApiError && err.status === 404) setNoMonth(true);
        else if (!(err instanceof ApiError && err.status === 401))
          setError(err instanceof Error ? err.message : "לא הצלחנו לטעון את הפוסטים");
      }
    }
    void loadPosts();
    return () => {
      active = false;
    };
  }, [reload]);

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
  const openIndex =
    location.post !== null && location.post < posts.length ? location.post : null;

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

  if (location.post !== null && !strategy) {
    return error ? (
      <p className={`${ui.error} mx-auto max-w-3xl`}>
        {error}
      </p>
    ) : (
      <p className="mx-auto max-w-3xl text-sm text-[color:var(--ink-muted)]">טוענים את הפוסט…</p>
    );
  }

  if (strategy && openIndex !== null) {
    return (
      <PostEditor
        key={`${strategy.id}-${openIndex}`}
        posts={posts}
        strategy={strategy}
        brandLanguage={strategy.brand_language}
        initialIndex={openIndex}
        onStrategyUpdated={setStrategy}
        onNavigate={moveEditor}
        onClose={closeEditor}
      />
    );
  }

  const doneCount = posts.filter(isDone).length;
  const firstPending = nextPendingIndex(posts, -1);
  const due = queue?.due[0];
  // A failed queue read must not read as "nothing is due", so nothing is claimed until it
  // answers. With posts still to approve, publishing is the secondary ask.
  const showDue = Boolean(due && firstPending >= 0);
  // The page's one ask is the next post that needs the owner, worded as what it needs.
  const primary =
    strategy && !location.calendar
      ? firstPending >= 0
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
    <div className={`mx-auto ${location.calendar ? "max-w-6xl" : "max-w-3xl"}`}>
      <header>
        <Link href="/strategy" className={`${ui.link} ${ui.linkQuiet} -my-2 text-[13px] font-medium`}>
          כלי הביצוע של התוכנית
        </Link>
        <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-tight text-[color:var(--ink)] sm:text-[32px]">
          {strategy ? `הפוסטים של ${strategy.month_name_he}` : "הפוסטים"}
        </h1>

        <div className="mt-5 flex items-center justify-between gap-4">
          {strategy && posts.length ? (
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <p className="shrink-0 text-sm font-semibold tabular-nums text-[color:var(--ink)]">
                {doneCount} מתוך {posts.length} אושרו
              </p>
              <div
                role="progressbar"
                aria-label="פוסטים שאושרו החודש"
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
          <ViewToggle
            calendar={location.calendar}
            onChange={(calendar) => go(calendar ? "view=calendar" : "", "replace")}
          />
        </div>
      </header>

      {error ? (
        <p className={`${ui.error} mt-6`}>
          {error}
        </p>
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
              {primary.label}
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
              {queue && queue.due.length > 1 ? `${queue.due.length} פוסטים מחכים לפרסום` : "פוסט אחד מחכה לפרסום"}
              <IconChevron className="h-4 w-4 shrink-0 text-[color:var(--sand-dark)] transition-transform duration-200 group-hover:-translate-x-0.5" />
            </button>
          ) : null}
        </div>
      ) : null}

      {/* The posts the owner asked for ("להתחיל לכתוב") are written on the server: say so
          while the month has none yet, never a bare "loading". */}
      {strategy && posts.length === 0 ? (
        <div className="mt-8">
          <MonthBuildProgress kind="posts" onDone={() => setReload((n) => n + 1)} />
        </div>
      ) : null}

      <div className="mt-8">
        {!strategy ? (
          noMonth ? (
            <NoPostsYet />
          ) : !error ? (
            <p className="text-sm text-[color:var(--ink-muted)]">טוענים את הפוסטים של החודש…</p>
          ) : null
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
      </div>
    </div>
  );
}

/**
 * No month yet — normal in the free month: posts are written only once the week-2
 * foundations are in (Revision 8). Says why, and links to the step that is next.
 */
function NoPostsYet() {
  return (
    <section className={`${ui.card} px-6 py-12 text-center sm:px-10`}>
      <h2 className="text-lg font-bold tracking-tight text-[color:var(--ink)]">עוד אין פוסטים לחודש הזה</h2>
      <p className="mx-auto mt-2 max-w-md text-[15px] leading-7 text-[color:var(--ink-soft)]">
        קודם מחברים מדידה ובוחרים מוצרים, ככה הפוסטים יהיו שלכם. אחר כך נכתוב אותם, והם יחכו כאן
        לאישור שלכם.
      </p>
      <div className="mt-6 flex flex-col items-center gap-2">
        <Link href="/strategy" className={ui.button}>
          לראות את התוכנית
        </Link>
        <StepLink stepKey={["instagram", "site_data", "whatsapp", "gbp", "baseline", "photos", "featured", "voice", "start_posts"]} />
      </div>
    </section>
  );
}

export default function PostsPage() {
  return (
    <AppShell>
      {/* The workspace reads the URL, which a prerender does not have (Next's rule for
          useSearchParams), so it renders inside its own Suspense boundary. */}
      <Suspense fallback={<p className="mx-auto max-w-3xl text-sm text-[color:var(--ink-muted)]">טוענים את הפוסטים…</p>}>
        <PostsWorkspace />
      </Suspense>
    </AppShell>
  );
}
