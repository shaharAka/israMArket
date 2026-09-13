"use client";

import { useEffect, useState } from "react";
import { AppShell, Badge, Button, ErrorNote, PageHeader } from "@/components/AppShell";
import { endpoints, type CalendarEvent, type CalendarPayload, type RoadmapPost } from "@/lib/api";
import { IconCopy } from "@/lib/icons";
import { monthLabel, shiftMonth } from "@/lib/months";
import { copyText } from "@/lib/ui";

/**
 * The month this product treats as "now", and the one the reset control returns to.
 *
 * The board itself is always a civil (Gregorian) month with the Jewish holidays and the
 * Israeli shopping days pinned onto it — never a Hebrew-month calendar. That is a product
 * rule, not a rendering detail, so `data.calendar_kind` is expected to stay `gregorian`.
 */
const CURRENT_YEAR = 2026;
const CURRENT_MONTH = 9;

const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

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
 * pinned onto the days they fall on. The grid is the structure of the page, so it carries
 * hairline rules and whitespace rather than a border per day.
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
}: {
  year: number;
  month: number;
  daysInMonth: number;
  firstWeekday: number;
  events: CalendarEvent[];
  posts: RoadmapPost[];
  selected: string | null;
  onSelect: (date: string) => void;
}) {
  const pad = (firstWeekday + 1) % 7;
  const cells: (number | null)[] = [
    ...Array.from({ length: pad }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  return (
    <section aria-label="לוח החודש" className="overflow-hidden rounded-2xl bg-white">
      <div className="grid grid-cols-7 bg-[#f8f7f4] text-center text-[11px] font-black text-[#8b8e84]">
        {WEEKDAYS.map((day) => (
          <div key={day} className="py-2.5">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 divide-x divide-y divide-[#eeede8] divide-x-reverse">
        {cells.map((day, index) => {
          if (!day) {
            return <div key={`empty-${index}`} className="min-h-[100px] bg-[#faf9f7] p-2 sm:min-h-[110px]" />;
          }

          const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayEvents = events.filter((event) => event.date === iso);
          const dayPosts = posts.filter(
            (post) => post.date_hint.startsWith(iso) || post.date_hint.includes(iso)
          );
          const isSelected = selected === iso;
          const isWeekend = index % 7 === 5 || index % 7 === 6;
          const hasHoliday = dayEvents.some((event) => event.kind === "חג");

          return (
            <div
              key={iso}
              onClick={() => onSelect(iso)}
              className={`flex min-h-[100px] cursor-pointer flex-col p-2 transition sm:min-h-[110px] ${
                isSelected
                  ? "bg-[#f4f3ee]"
                  : isWeekend
                    ? "bg-[#faf9f7] hover:bg-[#f4f3ee]"
                    : "bg-white hover:bg-[#f8f7f4]"
              }`}
            >
              <div className="flex items-center justify-between">
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
                {dayPosts.length > 0 ? (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-blue-500"
                    title={`${dayPosts.length} פוסטים מתוכננים`}
                  />
                ) : null}
              </div>

              <div className="mt-1 space-y-0.5">
                {dayEvents.map((event) => (
                  <div
                    key={`${event.name}-${event.date}`}
                    className={`truncate rounded px-1.5 py-0.5 text-[10px] font-semibold ${eventChip(event.kind)}`}
                    title={`${event.name} (${event.kind}): ${event.note}`}
                  >
                    {event.name}
                  </div>
                ))}

                {dayPosts.map((post) => (
                  <div
                    key={post.title}
                    className="truncate rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700"
                    title={`פוסט: ${post.title}`}
                  >
                    {post.title}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function CalendarPage() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [data, setData] = useState<CalendarPayload | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    endpoints
      .calendar(year, month)
      .then((payload) => {
        setData(payload);
        setSelected(payload.events[0]?.date ?? `${year}-${String(month).padStart(2, "0")}-01`);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "שגיאה בטעינת הלוח"));
  }, [year, month]);

  function move(delta: number) {
    const next = shiftMonth(year, month, delta);
    setYear(next.year);
    setMonth(next.month);
  }

  const dayEvents = data?.events.filter((event) => event.date === selected) ?? [];
  const dayPosts =
    data?.roadmap?.posts.filter(
      (post) =>
        selected && (post.date_hint.startsWith(selected) || post.date_hint.includes(selected))
    ) ?? [];

  return (
    <AppShell>
      <PageHeader
        title="לוח שנה שיווקי וישראלי"
        subtitle="לוח חודשי לועזי (ינואר–דצמבר) עם חגי ישראל, ימי קניות והפוסטים שלכם"
        action={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => move(-1)}>
              החודש הקודם
            </Button>
            <Button size="sm" variant="outline" onClick={() => move(1)}>
              החודש הבא
            </Button>
            {/* The one dark button on this screen: the way back to the month the owner is
                actually in, after browsing away from it. */}
            <Button
              size="sm"
              tone="primary"
              onClick={() => {
                setYear(CURRENT_YEAR);
                setMonth(CURRENT_MONTH);
              }}
            >
              חזרה ל{monthLabel(CURRENT_YEAR, CURRENT_MONTH)}
            </Button>
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-2xl font-black tracking-tight text-[#20211f]">
            {data ? `${data.month_name_he} ${data.year}` : monthLabel(year, month)}
          </h2>
          <span className="text-xs font-bold text-[#8b8e84]">
            {data?.events.length ?? 0} אירועים וחגים
          </span>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#8b8e84]">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> חג ישראלי
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-purple-400" /> יום קניות / מבצעים
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> פוסט מתוכנן
          </span>
        </div>
      </div>

      <ErrorNote message={error} />

      {data ? (
        <div className="grid gap-6 lg:grid-cols-12">
          {/* The month itself. It is the page, so it gets the width and no box. */}
          <div className="lg:col-span-8">
            <MonthBoard
              year={data.year}
              month={data.month}
              daysInMonth={data.days_in_month}
              firstWeekday={data.first_weekday}
              events={data.events}
              posts={data.roadmap?.posts ?? []}
              selected={selected}
              onSelect={setSelected}
            />
          </div>

          {/* One panel for everything about a date: what happens on the chosen day, and the
              whole month's list to jump from. Hairline dividers inside, a single border. */}
          <aside className="lg:col-span-4">
            <div className="overflow-hidden rounded-2xl border border-[#e6e4dc] bg-white">
              <div className="p-4 sm:p-5">
                <h2 className="text-sm font-black text-[#20211f]">מה קורה ביום הנבחר</h2>
                <p className="mt-0.5 text-xs text-[#8b8e84]">
                  {selected ? formatDay(selected) : "בחרו יום בלוח"}
                </p>

                {dayEvents.length === 0 && dayPosts.length === 0 ? (
                  <p className="mt-3 text-xs leading-5 text-[#8b8e84]">
                    אין אירוע, חג או פוסט מתוכנן ביום הזה.
                  </p>
                ) : (
                  <ul className="mt-2 divide-y divide-[#eeede8]">
                    {dayEvents.map((event) => (
                      <li key={`${event.name}-${event.date}`} className="py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={event.kind === "חג" ? "amber" : "purple"}>{event.kind}</Badge>
                          <span className="text-xs font-bold text-[#20211f]">{event.name}</span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-[#63665e]">{event.note}</p>
                      </li>
                    ))}

                    {dayPosts.map((post) => (
                      <li key={post.title} className="py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone="blue">פוסט מתוכנן</Badge>
                          <span className="min-w-0 truncate text-xs font-bold text-[#20211f]">
                            {post.title}
                          </span>
                        </div>
                        <p className="mt-1 text-xs font-medium leading-5 text-[#5e6159]">{post.hook}</p>
                        <button
                          onClick={() =>
                            void copyText(post.hook + "\n\n" + post.caption, "הטקסט הועתק!")
                          }
                          className="mt-1.5 inline-flex cursor-pointer items-center gap-1 text-xs font-bold text-[#3f4a5c] underline underline-offset-4 hover:text-[#20211f]"
                        >
                          <IconCopy className="w-3.5 h-3.5" />
                          <span>העתקת התוכן</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="border-t border-[#e6e4dc] p-4 sm:p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-sm font-black text-[#20211f]">כל אירועי {data.month_name_he}</h2>
                  <span className="text-[11px] text-[#8b8e84]">לחיצה מעבירה ליום</span>
                </div>
                <ul className="mt-2 max-h-[320px] divide-y divide-[#eeede8] overflow-y-auto">
                  {data.events.map((event) => (
                    <li key={`${event.name}-${event.date}`}>
                      <button
                        onClick={() => setSelected(event.date)}
                        className={`flex w-full cursor-pointer items-center justify-between gap-3 py-2 text-right transition ${
                          selected === event.date
                            ? "text-[#20211f]"
                            : "text-[#5e6159] hover:text-[#20211f]"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-bold">{event.name}</span>
                          <span className="mt-0.5 block truncate text-[11px] text-[#8b8e84]">
                            {event.note}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs font-bold text-[#8b8e84]">
                          {event.date.split("-").slice(1).reverse().join(".")}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </AppShell>
  );
}
