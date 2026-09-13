"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PostEditor } from "@/components/PostEditor";
import { endpoints, type StrategyPayload } from "@/lib/api";

function PostsWorkspace() {
  const [strategy, setStrategy] = useState<StrategyPayload | null>(null);
  const [error, setError] = useState("");
  const [requestedIndex, setRequestedIndex] = useState(0);

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

  const posts = strategy?.roadmap?.posts ?? [];

  return (
    <div className="space-y-6">
      <header className="border-b border-[#deddd8] pb-5">
        <p className="text-xs font-bold text-[#747570]">
          {strategy ? `${strategy.month_name_he} ${strategy.year}` : "טוען..."}
        </p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-[#20211f]">הפוסטים שהכנו</h1>
      </header>

      {error ? (
        <p className="rounded-md border border-[#eed1c9] bg-[#fbf2ef] px-4 py-3 text-sm text-[#9f4330]">{error}</p>
      ) : null}

      {strategy ? (
        <PostEditor
          key={`${strategy.id}-${Number.isFinite(requestedIndex) ? requestedIndex : 0}`}
          posts={posts}
          brandLanguage={strategy.brand_language}
          initialIndex={Number.isFinite(requestedIndex) ? requestedIndex : 0}
          onStrategyUpdated={setStrategy}
        />
      ) : !error ? (
        <p className="text-sm text-[#63665e]">טוען את הפוסטים של החודש...</p>
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
