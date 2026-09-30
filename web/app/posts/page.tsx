"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { SunProgress } from "@/components/brand/SunProgress";
import { PostEditor } from "@/components/PostEditor";
import { CalendarView } from "@/components/posts/CalendarView";
import { PostFeed } from "@/components/posts/PostFeed";
import { isDone, nextPendingIndex } from "@/components/posts/postMeta";
import { endpoints, type PublishQueue, type StrategyPayload } from "@/lib/api";
import { IconCalendar } from "@/lib/icons";

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
        `${post.approval_status || ""}|${post.scheduled_for || ""}|${post.published_url || ""}`
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
  const item = (active: boolean) =>
    `inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-bold transition-colors ${
      active ? "bg-white text-[color:var(--ink)] shadow-sm" : "text-[color:var(--ink-soft)] hover:text-[color:var(--ink)]"
    }`;
  return (
    <div role="group" aria-label="תצוגה" className="inline-flex shrink-0 rounded-full bg-[var(--primary-soft)] p-1">
      <button type="button" aria-pressed={!calendar} onClick={() => onChange(false)} className={item(!calendar)}>
        רשימה
      </button>
      <button type="button" aria-pressed={calendar} onClick={() => onChange(true)} className={item(calendar)}>
        <IconCalendar className="h-4 w-4" />
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
        if (active) setError(err instanceof Error ? err.message : "לא הצלחנו לטעון את הפוסטים");
      }
    }
    void loadPosts();
    return () => {
      active = false;
    };
  }, []);

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
      <p className="rounded-md border border-[#eed1c9] bg-[#fbf2ef] px-4 py-3 text-sm text-[#9f4330]">{error}</p>
    ) : (
      <p className="text-sm text-[color:var(--ink-soft)]">טוענים את הפוסט…</p>
    );
  }

  if (strategy && openIndex !== null) {
    return (
      <PostEditor
        key={`${strategy.id}-${openIndex}`}
        posts={posts}
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

  return (
    // The month view needs the width; a list of rows does not, and at 1100px a row's title
    // and its arrow ended up a screen apart.
    <div className={`mx-auto space-y-5 ${location.calendar ? "max-w-6xl" : "max-w-3xl"}`}>
      <header className="space-y-3">
        <Link href="/strategy" className="inline-flex min-h-10 items-center text-xs text-[color:var(--ink-soft)] underline underline-offset-4">כלי הביצוע של התוכנית</Link>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-black tracking-tight text-[color:var(--ink)] sm:text-3xl">
            {strategy ? `הפוסטים של ${strategy.month_name_he}` : "הפוסטים"}
          </h1>
          {posts.length > 0 ? <SunProgress value={doneCount} total={posts.length} label="פוסטים שאושרו החודש" /> : null}
        </div>

        <div className="flex items-center justify-between gap-3">
          {strategy && posts.length ? (
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <p className="shrink-0 text-sm font-bold text-[color:var(--ink)]">
                {doneCount} מתוך {posts.length} אושרו
              </p>
              <div className="h-1.5 max-w-40 flex-1 overflow-hidden rounded-full bg-[var(--rule)]">
                <div
                  className="h-full rounded-full bg-[var(--primary)] transition-all"
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

        {/* A failed queue read must not read as "nothing is due", so nothing is claimed
            until it answers. With posts still to approve, publishing is the secondary ask. */}
        {due && firstPending >= 0 ? (
          <button
            type="button"
            onClick={() => openPost(due.index)}
            className="min-h-11 text-sm font-bold text-[#9f4330] underline underline-offset-4"
          >
            {queue && queue.due.length > 1 ? `${queue.due.length} פוסטים מחכים לפרסום` : "פוסט אחד מחכה לפרסום"}
          </button>
        ) : null}
      </header>

      {error ? (
        <p className="rounded-md border border-[#eed1c9] bg-[#fbf2ef] px-4 py-3 text-sm text-[#9f4330]">{error}</p>
      ) : null}

      {/* The page's one dark button: the next thing we are asking for. */}
      {strategy && !location.calendar ? (
        firstPending >= 0 ? (
          <button
            type="button"
            onClick={() => openPost(firstPending)}
            className="flex min-h-12 w-full items-center justify-center rounded-xl bg-[var(--primary)] px-6 text-base font-bold text-white sm:w-auto"
          >
            {doneCount ? "להמשיך לאשר" : "להתחיל לאשר"}
          </button>
        ) : due ? (
          <button
            type="button"
            onClick={() => openPost(due.index)}
            className="flex min-h-12 w-full items-center justify-center rounded-xl bg-[var(--primary)] px-6 text-base font-bold text-white sm:w-auto"
          >
            לפרסם את הפוסט של היום
          </button>
        ) : null
      ) : null}

      {!strategy ? (
        !error ? <p className="text-sm text-[color:var(--ink-soft)]">טוענים את הפוסטים של החודש…</p> : null
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
        <PostFeed posts={posts} brand={strategy.brand_language} onOpen={openPost} />
      )}
    </div>
  );
}

export default function PostsPage() {
  return (
    <AppShell>
      {/* The workspace reads the URL, which a prerender does not have (Next's rule for
          useSearchParams), so it renders inside its own Suspense boundary. */}
      <Suspense fallback={<p className="text-sm text-[color:var(--ink-soft)]">טוענים את הפוסטים…</p>}>
        <PostsWorkspace />
      </Suspense>
    </AppShell>
  );
}
