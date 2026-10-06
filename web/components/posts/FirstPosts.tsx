"use client";

import { PostPreparation } from "./preparation/PostPreparation";

/** Review is explicit: background completion cannot take the owner away from a form. */
export function FirstPosts({ onDone }: { onDone: () => void; onWeekReady?: () => void }) {
  return <PostPreparation onReview={onDone} />;
}
