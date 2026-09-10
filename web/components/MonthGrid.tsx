"use client";

import type { CalendarEvent, RoadmapPost } from "@/lib/api";

const WEEKDAYS_HE = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

type Props = {
  year: number;
  month: number;
  daysInMonth: number;
  firstWeekday: number;
  events: CalendarEvent[];
  posts?: RoadmapPost[];
  selectedDate?: string | null;
  onSelectDate?: (date: string) => void;
};

export function MonthGrid({
  year,
  month,
  daysInMonth,
  firstWeekday,
  events,
  posts = [],
  selectedDate,
  onSelectDate,
}: Props) {
  const pad = (firstWeekday + 1) % 7;
  const cells = [...Array(pad).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/70 text-center text-xs font-bold text-slate-500 py-3">
        {WEEKDAYS_HE.map((day) => (
          <div key={day} className="px-1">
            {day}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 divide-x-reverse">
        {cells.map((day, index) => {
          if (!day) {
            return (
              <div
                key={`empty-${index}`}
                className="min-h-[105px] sm:min-h-[120px] bg-slate-50/40 p-2"
              />
            );
          }

          const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayEvents = events.filter((e) => e.date === iso);
          const dayPosts = posts.filter(
            (p) => p.date_hint.startsWith(iso) || p.date_hint.includes(iso)
          );
          const isSelected = selectedDate === iso;
          const isFridayOrShabbat = (index % 7 === 5) || (index % 7 === 6);

          return (
            <div
              key={iso}
              onClick={() => onSelectDate?.(iso)}
              className={`min-h-[105px] sm:min-h-[120px] p-2 flex flex-col justify-between transition cursor-pointer ${
                isSelected
                  ? "bg-blue-50/60 ring-2 ring-blue-600 ring-inset z-10"
                  : isFridayOrShabbat
                  ? "bg-slate-50/30 hover:bg-slate-100/60"
                  : "bg-white hover:bg-slate-50"
              }`}
            >
              {/* Day Number Header */}
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                    isSelected
                      ? "bg-blue-600 text-white"
                      : dayEvents.some((e) => e.kind === "חג")
                      ? "bg-amber-100 text-amber-900"
                      : "text-slate-700"
                  }`}
                >
                  {day}
                </span>

                {dayPosts.length > 0 ? (
                  <span
                    className="w-2 h-2 rounded-full bg-blue-600"
                    title={`${dayPosts.length} פוסט מתוכנן`}
                  />
                ) : null}
              </div>

              {/* Day Events & Posts */}
              <div className="mt-1 space-y-1 overflow-hidden">
                {dayEvents.map((event) => (
                  <div
                    key={`${event.name}-${event.date}`}
                    className={`truncate text-[10px] font-medium px-1.5 py-0.5 rounded ${eventBadgeStyle(
                      event.kind
                    )}`}
                    title={`${event.name} (${event.kind}): ${event.note}`}
                  >
                    {event.name}
                  </div>
                ))}

                {dayPosts.map((post) => (
                  <div
                    key={post.title}
                    className="truncate text-[10px] bg-blue-50 text-blue-700 border border-blue-200/60 px-1.5 py-0.5 rounded font-medium"
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
    </div>
  );
}

function eventBadgeStyle(kind: string) {
  if (kind === "חג") return "bg-amber-100 text-amber-800 font-semibold";
  if (kind === "זיכרון") return "bg-slate-200 text-slate-800";
  if (kind === "לאומי") return "bg-sky-100 text-sky-800 font-semibold";
  if (kind === "קניות") return "bg-purple-100 text-purple-800 font-semibold";
  return "bg-slate-100 text-slate-700";
}
