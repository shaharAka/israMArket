"use client";

import { useEffect, useState } from "react";
import { endpoints, type CalendarEvent, type CalendarPayload, type RoadmapPost } from "@/lib/api";
import { IconCopy } from "@/lib/icons";
import { monthLabel, shiftMonth } from "@/lib/months";
import { copyText } from "@/lib/ui";
import { STATUS_LABEL, STATUS_TONE, postDay, postStatus } from "@/components/posts/postMeta";

const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const WEEKDAYS_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

/** A post on the board, with its place in the month when the editor can open it. */
type BoardPost = { post: RoadmapPost; index: number | null };

function isoFor(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** `2026-09-01` → `יום שלישי, 1.9.2026`. The owner's own calendar language, not ISO. */
function formatDay(iso: string) {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  const weekday = new Date(Number(year), Number(month) - 1, Number(day)).getDay();
  return `יום ${WEEKDAYS[weekday]}, ${Number(day)}.${Number(month)}.${year}`;
}

/**
 * A day's event as a small tinted tag. Tint only, no border: inside a month grid every
 * border turns a day cell into another card, and then nothing on the page has priority.
 */
function eventChip(kind: string) {
  if (kind === "חג") return "bg-amber-100 text-amber-800";
  if (kind === "זיכרון") return "bg-slate-200 text-slate-800";
  if (kind === "לאומי") return "bg-sky-100 text-sky-800";
  if (kind === "קניות") return "bg-purple-100 text-purple-800";
  return "bg-slate-100 text-slate-700";
}

/**
 * The civil month, Sunday first, with the holidays, the shopping days and the planned posts
 * pinned onto the days they fall on. Desktop only: at phone width a seventh of the screen
 * cut every name down to "פת…", so the phone gets the agenda below instead.
 */
function MonthBoard({
  year,
  month,
  daysInMonth,
  firstWeekday,
  events,
  posts,
  selected,
  onSelect,
  onOpenPost,
}: {
  year: number;
  month: number;
  daysInMonth: number;
  firstWeekday: number;
  events: CalendarEvent[];
  posts: BoardPost[];
  selected: string | null;
  onSelect: (date: string) => void;
  onOpenPost?: (index: number) => void;
}) {
  const pad = (firstWeekday + 1) % 7;
  const cells: (number | null)[] = [
    ...Array.from({ length: pad }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  return (
    <section aria-label="לוח החודש" className="overflow-hidden rounded-2xl bg-white">
      <div className="grid grid-cols-7 bg-[#f8f7f4] text-center text-[11px] font-black text-[#6b6c66]">
        {WEEKDAYS.map((day) => (
          <div key={day} className="py-2.5">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 divide-x divide-y divide-[#eeede8] divide-x-reverse">
        {cells.map((day, index) => {
          if (!day) {
            return <div key={`empty-${index}`} className="min-h-[110px] bg-[#faf9f7] p-2" />;
          }

          const iso = isoFor(year, month, day);
          const dayEvents = events.filter((event) => event.date === iso);
          const dayPosts = posts.filter((item) => postDay(item.post) === iso);
          const isSelected = selected === iso;
          const isWeekend = index % 7 === 5 || index % 7 === 6;
          const hasHoliday = dayEvents.some((event) => event.kind === "חג");

          return (
            <div
              key={iso}
              onClick={() => onSelect(iso)}
              className={`flex min-h-[110px] cursor-pointer flex-col p-2 transition ${
                isSelected
                  ? "bg-[#f4f3ee]"
                  : isWeekend
                    ? "bg-[#faf9f7] hover:bg-[#f4f3ee]"
                    : "bg-white hover:bg-[#f8f7f4]"
              }`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  isSelected
                    ? "bg-[#20211f] text-white"
                    : hasHoliday
                      ? "bg-amber-100 text-amber-900"
                      : "text-[#3c3e3a]"
                }`}
              >
                {day}
              </span>

              <div className="mt-1 space-y-0.5">
                {dayEvents.map((event) => (
                  <div
                    key={`${event.name}-${event.date}`}
                    className={`truncate rounded px-1.5 py-0.5 text-[11px] font-semibold ${eventChip(event.kind)}`}
                    title={`${event.name} (${event.kind}): ${event.note}`}
                  >
                    {event.name}
                  </div>
                ))}

                {dayPosts.map(({ post, index: postIndex }) =>
                  postIndex !== null && onOpenPost ? (
                    <button
                      key={`${postIndex}-${post.title}`}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenPost(postIndex);
                      }}
                      title={`פתיחת הפוסט: ${post.title}`}
                      className="block w-full truncate rounded bg-blue-50 px-1.5 py-0.5 text-right text-[11px] font-bold text-blue-800 hover:bg-blue-100"
                    >
                      {post.title}
                    </button>
                  ) : (
                    <div
                      key={post.title}
                      className="truncate rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700"
                      title={`פוסט: ${post.title}`}
                    >
                      {post.title}
                    </div>
                  ),
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * The phone's month: only the days that have something on them, each day a heading and its
 * holidays and posts written out in full. A seven-column grid at 390px gave every name about
 * 40 pixels, which is where "פת…" and "רא…" came from.
 */
function Agenda({
  year,
  month,
  daysInMonth,
  events,
  posts,
  onOpenPost,
}: {
  year: number;
  month: number;
  daysInMonth: number;
  events: CalendarEvent[];
  posts: BoardPost[];
  onOpenPost?: (index: number) => void;
}) {
  const days = Array.from({ length: daysInMonth }, (_, index) => isoFor(year, month, index + 1))
    .map((iso) => ({
      iso,
      events: events.filter((event) => event.date === iso),
      posts: posts.filter((item) => postDay(item.post) === iso),
    }))
    .filter((day) => day.events.length || day.posts.length);

  if (!days.length) {
    return <p className="py-8 text-center text-sm text-[#62635f]">אין חגים או פוסטים בחודש הזה.</p>;
  }

  return (
    <ol className="divide-y divide-[#eeede8] overflow-hidden rounded-2xl border border-[#e6e4dc] bg-white">
      {days.map((day) => {
        const [, , d] = day.iso.split("-");
        const weekday = new Date(`${day.iso}T12:00:00`).getDay();
        return (
          <li key={day.iso} className="flex gap-3 px-3 py-3">
            {/* The date is one block: weekday over day number, like a paper diary. */}
            <span className="flex w-10 shrink-0 flex-col items-center pt-0.5 text-center">
              <span className="text-xs font-bold text-[#6b6c66]">{WEEKDAYS_SHORT[weekday]}</span>
              <span className="text-lg font-black leading-6 text-[#20211f]">{Number(d)}</span>
            </span>
            <ul className="min-w-0 flex-1 space-y-1.5">
              {day.events.map((event) => (
                <li key={`${event.name}-${event.date}`}>
                  <span className={`inline-block rounded-md px-2 py-1 text-sm font-bold ${eventChip(event.kind)}`}>
                    {event.name}
                  </span>
                </li>
              ))}
              {day.posts.map(({ post, index }) => {
                const status = postStatus(post);
                const body = (
                  <>
                    <span className="min-w-0 flex-1 text-sm font-bold leading-6 text-[#20211f]">{post.title}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_TONE[status]}`}>
                      {STATUS_LABEL[status]}
                    </span>
                  </>
                );
                return (
                  <li key={`${index}-${post.title}`}>
                    {index !== null && onOpenPost ? (
                      <button
                        type="button"
                        onClick={() => onOpenPost(index)}
                        className="flex min-h-11 w-full items-center gap-2 rounded-md bg-blue-50/60 px-2 text-right hover:bg-blue-50"
                      >
                        {body}
                      </button>
                    ) : (
                      <span className="flex min-h-11 items-center gap-2 rounded-md bg-blue-50/60 px-2">{body}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * A month step. Icon-only on purpose: the month is already named in the heading next to
 * it. The control keeps its meaning in an accessible label and a tooltip (UI-RULES rule 6).
 */
function MonthStep({ dir, label, onClick }: { dir: "prev" | "next"; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-md text-[#63665e] transition-colors hover:bg-[#f4f3ee] hover:text-[#20211f]"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {/* In a right-to-left page "back" points right. */}
        {dir === "prev" ? <path d="M14 6l6 6-6 6" /> : <path d="M10 6l-6 6 6 6" />}
      </svg>
    </button>
  );
}

/**
 * The month view used by both `/posts?view=calendar` and `/calendar`.
 *
 * `posts` / `postsMonth` are the month the editor works on. On that month the board shows
 * those posts — with their live status — and each one opens in the editor. On any other
 * month it falls back to what the calendar endpoint returns, read-only, because the editor
 * can only open posts of the active plan.
 */
export function CalendarView({
  initialYear,
  initialMonth,
  posts,
  postsMonth,
  onOpenPost,
}: {
  initialYear: number;
  initialMonth: number;
  posts?: RoadmapPost[];
  postsMonth?: { year: number; month: number } | null;
  onOpenPost?: (index: number) => void;
}) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [data, setData] = useState<CalendarPayload | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    endpoints
      .calendar(year, month)
      .then((payload) => {
        if (!active) return;
        setData(payload);
        setError("");
        setSelected(payload.events[0]?.date ?? isoFor(year, month, 1));
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "שגיאה בטעינת הלוח");
      });
    return () => {
      active = false;
    };
  }, [year, month]);

  function move(delta: number) {
    const next = shiftMonth(year, month, delta);
    setYear(next.year);
    setMonth(next.month);
  }

  const onPlanMonth = Boolean(
    posts && postsMonth && data && data.year === postsMonth.year && data.month === postsMonth.month,
  );
  const boardPosts: BoardPost[] = onPlanMonth
    ? (posts ?? []).map((post, index) => ({ post, index }))
    : (data?.roadmap?.posts ?? []).map((post) => ({ post, index: null }));
  const openPost = onPlanMonth ? onOpenPost : undefined;

  const dayEvents = data?.events.filter((event) => event.date === selected) ?? [];
  const dayPosts = boardPosts.filter((item) => selected && postDay(item.post) === selected);
  const awayFromStart = year !== initialYear || month !== initialMonth;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-xl font-black tracking-tight text-[#20211f] md:text-2xl">
          {data && data.year === year && data.month === month ? `${data.month_name_he} ${data.year}` : monthLabel(year, month)}
        </h2>
        <div className="flex items-center">
          <MonthStep dir="prev" label="החודש הקודם" onClick={() => move(-1)} />
          <MonthStep dir="next" label="החודש הבא" onClick={() => move(1)} />
        </div>
        {awayFromStart ? (
          <button
            type="button"
            onClick={() => {
              setYear(initialYear);
              setMonth(initialMonth);
            }}
            className="min-h-11 text-sm font-bold text-[#20211f] underline underline-offset-4"
          >
            חזרה ל{monthLabel(initialYear, initialMonth)}
          </button>
        ) : null}
        {/* The grid's colours need a key; the phone's agenda writes every item out. */}
        <div className="hidden items-center gap-x-4 text-xs text-[#6b6c66] md:mr-auto md:flex">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> חג
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-purple-400" /> קניות
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> פוסט
          </span>
        </div>
      </div>

      {error ? (
        <p className="mb-4 rounded-md border border-[#eed1c9] bg-[#fbf2ef] px-4 py-3 text-sm text-[#9f4330]">{error}</p>
      ) : null}

      {data ? (
        <>
          <div className="md:hidden">
            <Agenda
              year={data.year}
              month={data.month}
              daysInMonth={data.days_in_month}
              events={data.events}
              posts={boardPosts}
              onOpenPost={openPost}
            />
          </div>

          <div className="hidden gap-6 md:grid lg:grid-cols-12">
            <div className="lg:col-span-8">
              <MonthBoard
                year={data.year}
                month={data.month}
                daysInMonth={data.days_in_month}
                firstWeekday={data.first_weekday}
                events={data.events}
                posts={boardPosts}
                selected={selected}
                onSelect={setSelected}
                onOpenPost={openPost}
              />
            </div>

            {/* What happens on the chosen day. One border, hairlines inside. */}
            <aside className="lg:col-span-4">
              <div className="rounded-2xl border border-[#e6e4dc] bg-white p-5">
                <h3 className="text-sm font-black text-[#20211f]">
                  {selected ? formatDay(selected) : "בחרו יום בלוח"}
                </h3>

                {dayEvents.length === 0 && dayPosts.length === 0 ? (
                  <p className="mt-3 text-xs leading-5 text-[#6b6c66]">אין חג או פוסט ביום הזה.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-[#eeede8]">
                    {dayEvents.map((event) => (
                      <li key={`${event.name}-${event.date}`} className="py-2.5">
                        <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${eventChip(event.kind)}`}>
                          {event.kind}
                        </span>
                        <span className="mr-2 text-sm font-bold text-[#20211f]">{event.name}</span>
                        {event.note ? <p className="mt-1 text-xs leading-5 text-[#5e6159]">{event.note}</p> : null}
                      </li>
                    ))}

                    {dayPosts.map(({ post, index }) => (
                      <li key={`${index}-${post.title}`} className="py-2.5">
                        <p className="text-sm font-bold text-[#20211f]">{post.title}</p>
                        <p className="mt-1 text-xs leading-5 text-[#5e6159]">{post.hook}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-4">
                          {index !== null && openPost ? (
                            <button
                              type="button"
                              onClick={() => openPost(index)}
                              className="text-xs font-bold text-[#20211f] underline underline-offset-4"
                            >
                              פתיחת הפוסט
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => void copyText(post.hook + "\n\n" + post.caption, "הטקסט הועתק!")}
                            className="inline-flex items-center gap-1 text-xs font-bold text-[#3f4a5c] underline underline-offset-4 hover:text-[#20211f]"
                          >
                            <IconCopy className="h-3.5 w-3.5" />
                            העתקת התוכן
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </aside>
          </div>
        </>
      ) : !error ? (
        <p className="text-sm text-[#63665e]">טוענים את הלוח…</p>
      ) : null}
    </div>
  );
}
