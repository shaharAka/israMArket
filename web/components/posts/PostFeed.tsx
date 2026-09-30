"use client";

/* eslint-disable @next/next/no-img-element -- same-origin post images, not optimizable remote URLs */

import { useState } from "react";
import { needsPhoto } from "@/components/CardCanvas";
import type { BrandLanguage, RoadmapPost } from "@/lib/api";
import { cardTokens } from "@/lib/cardTokens";
import { IconArrowLeft } from "@/lib/icons";
import { PhotoPlaceholder } from "./PhotoPlaceholder";
import { STATUS_LABEL, STATUS_TONE, postDateLabel, postStatus } from "@/components/posts/postMeta";

/**
 * The post's picture, small. Only the photograph — not the designed card — because a card
 * shrunk to 64px turns its headline into unreadable specks, and every one of those specks
 * would still be counted as words on the page. The full card is one tap away.
 */
function Thumb({ post, brand }: { post: RoadmapPost; brand?: BrandLanguage | null }) {
  const [broken, setBroken] = useState(false);
  const base = "h-20 w-16 shrink-0 overflow-hidden rounded-lg";
  if (!needsPhoto(post.overlay_theme)) {
    // A typographic card has no photograph by design: its brand colour is its picture.
    const tokens = cardTokens(brand);
    return <span aria-hidden className={base} style={{ background: tokens.primary, display: "block" }} />;
  }
  if (!post.image_url || broken) {
    return (
      <span aria-hidden className={`${base} flex items-center justify-center bg-[var(--primary-soft)] text-[#a3a29b]`}>
        <PhotoPlaceholder small />
      </span>
    );
  }
  return (
    <img
      src={post.image_url}
      alt=""
      loading="lazy"
      onError={() => setBroken(true)}
      className={`${base} bg-[var(--primary-soft)] object-cover`}
    />
  );
}

/**
 * The month's posts as one scrollable list — the phone-native way to pick one, replacing
 * a "פוסט: 1" dropdown that showed a number and nothing else.
 *
 * One container with hairline dividers, not a card per post (UI-RULES rule 3). Each row is
 * a real link to `/posts?post=<index>`, so it can be opened in a new tab, and the page turns
 * the click into an in-place navigation that the back button undoes.
 */
export function PostFeed({
  posts,
  brand,
  onOpen,
}: {
  posts: RoadmapPost[];
  brand?: BrandLanguage | null;
  onOpen: (index: number) => void;
}) {
  if (!posts.length) {
    return (
      <p className="py-10 text-center text-sm text-[color:var(--ink-soft)]">עוד מכינים את הפוסטים של החודש.</p>
    );
  }
  return (
    <ul className="divide-y divide-[var(--primary-soft)] overflow-hidden border-y border-[var(--rule)] bg-white">
      {posts.map((post, index) => {
        const status = postStatus(post);
        return (
          <li key={`${index}-${post.title}`}>
            <a
              href={`/posts?post=${index}`}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                event.preventDefault();
                onOpen(index);
              }}
              className="flex min-h-24 items-center gap-3 px-3 py-2.5 transition-colors hover:bg-[var(--canvas)] active:bg-[var(--primary-soft)] sm:px-4"
            >
              <Thumb post={post} brand={brand} />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-[15px] font-bold leading-6 text-[color:var(--ink)]">
                  {post.title}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className={`text-xs ${STATUS_TONE[status]}`}>
                    {STATUS_LABEL[status]}
                  </span>
                  <span className="text-xs font-bold text-[color:var(--ink-soft)]">{postDateLabel(post)}</span>
                </span>
              </span>
              <IconArrowLeft className="h-4 w-4 shrink-0 text-[#a3a29b]" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
