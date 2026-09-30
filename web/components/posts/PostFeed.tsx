"use client";

/* eslint-disable @next/next/no-img-element -- same-origin post images, not optimizable remote URLs */

import { useState } from "react";
import { needsPhoto } from "@/components/CardCanvas";
import type { BrandLanguage, RoadmapPost } from "@/lib/api";
import { cardTokens } from "@/lib/cardTokens";
import { IconChevron } from "@/lib/icons";
import { PhotoPlaceholder } from "./PhotoPlaceholder";
import { STATUS_LABEL, postDateLabel, postStatus } from "@/components/posts/postMeta";
import ui from "./chrome.module.css";

/**
 * The post's picture, small. Only the photograph — not the designed card — because a card
 * shrunk to 64px turns its headline into unreadable specks, and every one of those specks
 * would still be counted as words on the page. The full card is one tap away.
 *
 * A 12px corner and a hairline ring drawn over the picture, so a dark photo and a pale one
 * both keep a clean edge against the white row.
 */
function Thumb({ post, brand }: { post: RoadmapPost; brand?: BrandLanguage | null }) {
  const [broken, setBroken] = useState(false);
  const frame =
    "relative block h-20 w-16 shrink-0 overflow-hidden rounded-[12px] bg-[var(--primary-soft)] after:pointer-events-none after:absolute after:inset-0 after:rounded-[12px] after:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--ink)_10%,transparent)]";
  if (!needsPhoto(post.overlay_theme)) {
    // A typographic card has no photograph by design: its brand colour is its picture.
    const tokens = cardTokens(brand);
    return <span aria-hidden className={frame} style={{ background: tokens.primary }} />;
  }
  if (!post.image_url || broken) {
    return (
      <span aria-hidden className={`${frame} flex items-center justify-center text-[var(--ink-faint)]`}>
        <PhotoPlaceholder small />
      </span>
    );
  }
  return (
    <span aria-hidden className={frame}>
      <img
        src={post.image_url}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
        className="h-full w-full object-cover transition-transform duration-300 ease-[cubic-bezier(.2,.7,.2,1)] group-hover:scale-[1.03]"
      />
    </span>
  );
}

/**
 * The month's posts as one scrollable list — the phone-native way to pick one, replacing
 * a "פוסט: 1" dropdown that showed a number and nothing else.
 *
 * One card with hairline dividers, not a card per post (UI-RULES rule 3). Each row is a
 * real link to `/posts?post=<index>`, so it can be opened in a new tab, and the page turns
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
      <p className="py-10 text-center text-sm text-[color:var(--ink-muted)]">עוד מכינים את הפוסטים של החודש.</p>
    );
  }
  return (
    <ul className={`${ui.card} divide-y divide-[var(--rule)] overflow-hidden`}>
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
              className="group flex min-h-24 items-center gap-4 px-4 py-3 transition-colors duration-200 hover:bg-[var(--soft)] active:bg-[var(--primary-soft)] sm:px-5"
            >
              <Thumb post={post} brand={brand} />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-[15px] font-semibold leading-6 text-[color:var(--ink)] sm:text-base">
                  {post.title}
                </span>
                <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className={ui.status} data-status={status}>
                    {STATUS_LABEL[status]}
                  </span>
                  {postDateLabel(post) ? (
                    <span className={`${ui.meta} font-normal`}>{postDateLabel(post)}</span>
                  ) : null}
                </span>
              </span>
              <IconChevron className="h-4 w-4 shrink-0 text-[var(--ink-faint)] transition-[transform,color] duration-200 group-hover:-translate-x-0.5 group-hover:text-[var(--ink-muted)]" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
