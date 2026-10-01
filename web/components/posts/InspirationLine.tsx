import { SourceLink } from "@/components/instagram/SourceLink";
import { sourceWho } from "@/components/instagram/sources";
import type { PostInspiration } from "@/lib/api";
import { IconChevron, IconSparkles } from "@/lib/icons";

/**
 * One quiet line under the post's "why": what already worked for this business and was
 * applied to the post ("עודכן לפי מה שהצליח אצלכם: …"). The server's `informed_by_note`
 * leads; a post written before it falls back to the note on the Instagram post(s) the
 * writer followed. When there are such posts the line opens to each of them as a link,
 * with the one number that made it worth copying ("הריל שלכם מ-12.8 · נשמר 38 פעמים").
 *
 * Renders nothing without either: no line is better than a vague one. There is nothing to
 * accept or dismiss here; what worked is applied when the post is written (posts-v2,
 * Revision 1), and this line only says so.
 */
export function InspirationLine({
  inspiration,
  note,
}: {
  inspiration: PostInspiration | null | undefined;
  note?: string | null;
}) {
  const sources = inspiration?.sources ?? [];
  const text =
    (note || "").trim() || (inspiration?.note || "").trim() || (sources.length ? `בהשראת ${sourceWho(sources[0])}` : "");
  if (!text) return null;
  // On a phone the line is one line until opened, so the post and its one button keep the
  // first screen; from 768px up it has the room to say it all.
  return (
    <details className="group mt-1 text-[13px] leading-5 text-[var(--ink-muted)]">
      <summary className="-mx-1.5 flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-[10px] px-1.5 py-1 transition-colors duration-200 hover:text-[var(--ink-soft)] [&::-webkit-details-marker]:hidden">
        <IconSparkles className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate group-open:whitespace-normal md:whitespace-normal">{text}</span>
        <IconChevron
          className={`h-3.5 w-3.5 shrink-0 -rotate-90 transition-transform duration-200 group-open:rotate-90 ${sources.length ? "" : "md:hidden"}`}
        />
      </summary>
      {sources.length ? (
        <ul className="space-y-0.5 ps-6 pb-1">
          {sources.map((source) => (
            <li key={source.ref}>
              <SourceLink source={source} className="inline-flex min-h-11 items-center" />
            </li>
          ))}
        </ul>
      ) : null}
    </details>
  );
}
