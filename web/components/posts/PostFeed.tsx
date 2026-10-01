"use client";

/* eslint-disable @next/next/no-img-element -- same-origin post images, not optimizable remote URLs */

import { useState } from "react";
import { needsPhoto } from "@/components/CardCanvas";
import type { BrandLanguage, RoadmapPost, StrategyPayload } from "@/lib/api";
import { cardTokens } from "@/lib/cardTokens";
import { IconChevron } from "@/lib/icons";
import { CHANNEL_LABEL, channelOf, ownerNeedsOf, resultShort } from "@/lib/postLifecycle";
import { ChannelIcon } from "./ChannelIcon";
import { PhotoPlaceholder } from "./PhotoPlaceholder";
import { LIFECYCLE_LABEL, lifecycleOf, postDateLabel, postWeek, weekFocus } from "@/components/posts/postMeta";
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

/** What a post waiting on the owner is waiting for, in one word after its state. */
function needHint(post: RoadmapPost): string {
  const needs = ownerNeedsOf(post);
  if (needs.some((need) => need.kind === "photo")) return "תמונה";
  return needs.length ? "פרט לבדוק" : "";
}

type Row = { post: RoadmapPost; index: number };

/** The month's posts by plan week, in the plan's order; a post with no week goes last. */
function groupByWeek(posts: RoadmapPost[]): { week: number; rows: Row[] }[] {
  const groups = new Map<number, Row[]>();
  posts.forEach((post, index) => {
    const week = postWeek(post);
    groups.set(week, [...(groups.get(week) ?? []), { post, index }]);
  });
  return [...groups.entries()]
    .sort(([a], [b]) => (a || Infinity) - (b || Infinity))
    .map(([week, rows]) => ({ week, rows }));
}

/**
 * The month's posts as the plan's weeks, each a short list — the phone-native way to pick
 * one. A week is headed by its focus ("שבוע 2 · ראש השנה ושעות החג"), so every post reads
 * as a step of the plan rather than an item in a pile.
 *
 * One card per week with hairline dividers, not a card per post (UI-RULES rule 3). Each row
 * is a real link to `/posts?post=<index>`, so it can be opened in a new tab, and the page
 * turns the click into an in-place navigation that the back button undoes.
 */
export function PostFeed({
  posts,
  brand,
  strategy,
  onOpen,
}: {
  posts: RoadmapPost[];
  brand?: BrandLanguage | null;
  strategy?: Pick<StrategyPayload, "roadmap" | "weekly_breakdown"> | null;
  onOpen: (index: number) => void;
}) {
  if (!posts.length) {
    return (
      <p className="py-10 text-center text-sm text-[color:var(--ink-muted)]">עוד מכינים את הפוסטים של החודש.</p>
    );
  }
  const groups = groupByWeek(posts);
  return (
    <div className="space-y-8">
      {groups.map(({ week, rows }) => {
        const focus = week ? weekFocus(week, rows[0]?.post, strategy) : "";
        return (
          <section key={week} aria-labelledby={`posts-week-${week}`}>
            <h2
              id={`posts-week-${week}`}
              className="mb-3 flex min-w-0 items-baseline gap-1.5 px-1 text-[15px] font-semibold leading-6 text-[color:var(--ink)]"
            >
              <span className="shrink-0">{week ? `שבוע ${week}` : "עוד פוסטים"}</span>
              {focus ? <span className="truncate font-normal text-[color:var(--ink-muted)]">· {focus}</span> : null}
            </h2>
            <ul className={`${ui.card} divide-y divide-[var(--rule)] overflow-hidden`}>
              {rows.map(({ post, index }) => {
                const stage = lifecycleOf(post);
                const hint = stage === "needs_owner" ? needHint(post) : "";
                const result = stage === "measured" ? resultShort(post) : "";
                const channel = channelOf(post);
                const day = postDateLabel(post);
                return (
                  <li key={`${index}-${post.uid || post.title}`}>
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
                          <span className={ui.status} data-status={stage}>
                            {LIFECYCLE_LABEL[stage]}
                            {hint ? <small>· {hint}</small> : null}
                          </span>
                          {result ? (
                            <span className="text-[13px] font-semibold tabular-nums text-[color:var(--ink)]">{result}</span>
                          ) : null}
                          {day ? <span className={`${ui.meta} font-normal`}>{day}</span> : null}
                          <span
                            role="img"
                            aria-label={CHANNEL_LABEL[channel]}
                            title={CHANNEL_LABEL[channel]}
                            className="inline-flex text-[color:var(--ink-muted)]"
                          >
                            <ChannelIcon channel={channel} />
                          </span>
                        </span>
                      </span>
                      <IconChevron className="h-4 w-4 shrink-0 text-[var(--ink-faint)] transition-[transform,color] duration-200 group-hover:-translate-x-0.5 group-hover:text-[var(--ink-muted)]" />
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
