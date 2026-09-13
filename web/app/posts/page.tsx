"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PostEditor } from "@/components/PostEditor";
import { endpoints, type PublishQueue, type StrategyPayload } from "@/lib/api";

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

/** The one line the header owes the owner: what is due, and a way straight to it. */
function dueLine(queue: PublishQueue | null, onFocus: (index: number) => void) {
  // Nothing is claimed until the queue has actually answered. A failed read must not read
  // as "nothing is due today".
  if (!queue) return null;
  const first = queue.due[0];
  if (!first) {
    return (
      <p className="mt-2 text-xs text-[#747570]">אין פוסטים שממתינים לפרסום</p>
    );
  }
  return (
    <Link
      href={`/posts?i=${first.index}`}
      onClick={() => onFocus(first.index)}
      className="mt-2 inline-flex text-xs font-bold text-[#9f4330] underline underline-offset-4"
    >
      {queue.due.length === 1
        ? "פוסט אחד ממתין לפרסום"
        : `${queue.due.length} פוסטים ממתינים לפרסום`}
    </Link>
  );
}

function PostsWorkspace() {
  const [strategy, setStrategy] = useState<StrategyPayload | null>(null);
  const [error, setError] = useState("");
  const [requestedIndex, setRequestedIndex] = useState(0);
  // A post is chosen by remounting the editor, so jumping to a post the editor is already
  // showing would otherwise be a no-op. The token makes every jump a real one.
  const [focusToken, setFocusToken] = useState(0);
  const [queue, setQueue] = useState<PublishQueue | null>(null);

  useEffect(() => {
    let active = true;
    async function loadPosts() {
      const index = Number(new URLSearchParams(window.location.search).get("i") || 0);
      const safeIndex = Number.isFinite(index) && index >= 0 ? index : 0;
      try {
        const current = await endpoints.strategy();
        if (!active) return;
        setRequestedIndex(safeIndex);
        setStrategy(current);
        if (current.roadmap.posts.some((post) => !post.image_url)) {
          const prepared = await endpoints.generateAllPostImages();
          if (active) setStrategy(prepared.strategy);
          if (prepared.errors?.length) {
            setError(prepared.errors[0]);
          }
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "טעינת הפוסטים נכשלה");
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

  return (
    <div className="space-y-6">
      <header className="border-b border-[#deddd8] pb-5">
        <p className="text-xs font-bold text-[#747570]">
          {strategy ? `${strategy.month_name_he} ${strategy.year}` : "טוען..."}
        </p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-[#20211f]">הפוסטים שהכנו</h1>
        {dueLine(queue, (index) => {
          setRequestedIndex(index);
          setFocusToken((token) => token + 1);
        })}
      </header>

      {error ? (
        <p className="rounded-md border border-[#eed1c9] bg-[#fbf2ef] px-4 py-3 text-sm text-[#9f4330]">{error}</p>
      ) : null}

      {strategy ? (
        <PostEditor
          key={`${strategy.id}-${Number.isFinite(requestedIndex) ? requestedIndex : 0}-${focusToken}`}
          posts={posts}
          brandLanguage={strategy.brand_language}
          initialIndex={Number.isFinite(requestedIndex) ? requestedIndex : 0}
          onStrategyUpdated={setStrategy}
        />
      ) : !error ? (
        <p className="text-sm text-[#63665e]">טוענים את הפוסטים של החודש...</p>
      ) : null}
    </div>
  );
}

export default function PostsPage() {
  return (
    <AppShell>
      <PostsWorkspace />
    </AppShell>
  );
}
