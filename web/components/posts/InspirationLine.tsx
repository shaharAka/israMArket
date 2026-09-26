import { SourceLink } from "@/components/instagram/SourceLink";
import { sourceWho } from "@/components/instagram/sources";
import type { PostInspiration } from "@/lib/api";

/**
 * "Why this post": one quiet line under the preview naming the real Instagram post(s) the
 * writer followed. Collapsed it is a single truncated line, so the preview and the approve
 * button still fit one phone screen; opened it shows the whole note and each source as a
 * link with the one number that made it worth copying ("הריל שלכם מ-12.8 · נשמר 38 פעמים").
 *
 * Renders nothing when the writer had no Instagram signal — no line is better than a
 * vague one.
 */
export function InspirationLine({ inspiration }: { inspiration: PostInspiration | null | undefined }) {
  if (!inspiration || !inspiration.sources.length) return null;
  const note = inspiration.note || `בהשראת ${sourceWho(inspiration.sources[0])}`;
  return (
    <details className="group mt-1.5 text-xs leading-5 text-[#5e6159]">
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1 px-1">
        <span className="min-w-0 flex-1 truncate group-open:whitespace-normal">
          <span className="font-bold text-[#3c3e3a]">למה הפוסט הזה:</span> {note}
        </span>
        <span aria-hidden className="shrink-0 text-[#8b8e84] transition-transform group-open:-rotate-90">
          ‹
        </span>
      </summary>
      <ul className="space-y-0.5 px-1 pb-1">
        {inspiration.sources.map((source) => (
          <li key={source.ref}>
            <SourceLink source={source} />
          </li>
        ))}
      </ul>
    </details>
  );
}
