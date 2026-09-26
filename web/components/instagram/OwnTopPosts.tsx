import Image from "next/image";
import type { InstagramOwnPost } from "@/lib/api";
import { IconCamera } from "./SourceLink";
import { keyMetric } from "./sources";

/** Three is enough to see the pattern; the brief already cites the rest. */
const SHOWN = 3;

/**
 * The business's own best posts, ranked on the server by saves and shares per person
 * reached. Each row is its hook and the one number that made it a top post; the row
 * opens the post on Instagram.
 */
export function OwnTopPosts({ posts }: { posts: InstagramOwnPost[] }) {
  if (!posts.length) return null;
  return (
    <section aria-labelledby="own-heading">
      <h2 id="own-heading" className="text-base font-black text-[#20211f]">
        הפוסטים שלכם שהכי עבדו
      </h2>
      <ul className="mt-3 divide-y divide-[#eeede8] overflow-hidden rounded-lg border border-[#e6e4dc] bg-white">
        {posts.slice(0, SHOWN).map((post) => {
          const thumb = post.thumbnail_url || (post.format === "reel" || post.format === "video" ? "" : post.media_url);
          const body = (
            <>
              <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-[#f0efeb]">
                {thumb ? (
                  <Image src={thumb} alt="" width={96} height={96} unoptimized className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full items-center justify-center text-[#898a85]">
                    <IconCamera className="h-5 w-5" />
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#20211f]">
                {post.hook || post.format_he}
              </span>
              <span className="shrink-0 text-xs font-bold text-[#374b3d]">{keyMetric(post.metrics)}</span>
            </>
          );
          return (
            <li key={post.media_id || post.ref}>
              {post.permalink ? (
                <a
                  href={post.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="נפתח באינסטגרם"
                  className="flex min-h-16 items-center gap-3 px-3 py-2 transition-colors hover:bg-[#faf9f7]"
                >
                  {body}
                </a>
              ) : (
                <div className="flex min-h-16 items-center gap-3 px-3 py-2">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
