"use client";

import { useEffect, useState } from "react";
import { AppShell, Badge, Button, Card, PageHeader } from "@/components/AppShell";
import { MonthGrid } from "@/components/MonthGrid";
import { endpoints, type CalendarPayload } from "@/lib/api";
import { IconCalendar, IconCopy } from "@/lib/icons";
import { monthLabel, shiftMonth } from "@/lib/months";
import { copyText } from "@/lib/ui";

export default function CalendarPage() {
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(9);
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
        subtitle="לוח חודשי לועזי מסודר (ינואר–דצמבר) הכולל את כל חגי ישראל, ימי קניות ותוכנית הפוסטים שלכם"
        action={
          <div className="flex items-center gap-2">
            <Button size="sm" tone="ghost" onClick={() => move(-1)}>
              חודש קודם
            </Button>
            <Button
              size="sm"
              tone="primary"
              onClick={() => {
                setYear(2026);
                setMonth(9);
              }}
            >
              החודש הנוכחי
            </Button>
            <Button size="sm" tone="ghost" onClick={() => move(1)}>
              חודש הבא
            </Button>
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            {data ? `${data.month_name_he} ${data.year}` : monthLabel(year, month)}
          </h2>
          <Badge tone="amber">
            {data?.events.length ?? 0} אירועים וחגים
          </Badge>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> חג ישראלי
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-400" /> יום קניות / מבצעים
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> פוסט מתוכנן
          </span>
        </div>
      </div>

      {error ? <Card className="text-rose-600">{error}</Card> : null}

      {data ? (
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Main Month Grid */}
          <div className="lg:col-span-8">
            <MonthGrid
              year={data.year}
              month={data.month}
              daysInMonth={data.days_in_month}
              firstWeekday={data.first_weekday}
              events={data.events}
              posts={data.roadmap?.posts}
              selectedDate={selected}
              onSelectDate={setSelected}
            />
          </div>

          {/* Right Details Panel */}
          <div className="lg:col-span-4 space-y-4">
            {/* Selected Date Details */}
            <Card className="border-blue-200 bg-gradient-to-br from-blue-50/20 to-white">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                    תאריך נבחר
                  </span>
                  <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                    {selected || "בחרו יום בלוח"}
                  </h3>
                </div>
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <IconCalendar className="w-4 h-4" />
                </div>
              </div>

              {dayEvents.length === 0 && dayPosts.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  אין אירוע חג או פוסט מתוכנן ביום הזה
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {dayEvents.map((ev) => (
                    <div
                      key={`${ev.name}-${ev.date}`}
                      className="rounded-xl bg-slate-50 border border-slate-100 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <Badge tone={ev.kind === "חג" ? "amber" : "purple"}>{ev.kind}</Badge>
                        <span className="text-xs font-bold text-slate-800">{ev.name}</span>
                      </div>
                      <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">{ev.note}</p>
                    </div>
                  ))}

                  {dayPosts.map((post) => (
                    <div
                      key={post.title}
                      className="rounded-xl bg-blue-50/70 border border-blue-200/60 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <Badge tone="blue">פוסט מתוכנן</Badge>
                        <span className="text-xs font-bold text-blue-950 truncate max-w-[150px]">
                          {post.title}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-slate-700 font-medium">{post.hook}</p>
                      <div className="mt-3 pt-2 border-t border-blue-200/40 flex justify-end">
                        <button
                          onClick={() => void copyText(post.hook + "\n\n" + post.caption, "הטקסט הועתק!")}
                          className="text-xs text-blue-700 font-medium hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <IconCopy className="w-3.5 h-3.5" />
                          <span>העתק תוכן</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* List of all holidays in current month */}
            <Card>
              <h3 className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-100 mb-3">
                כל אירועי {data.month_name_he}
              </h3>
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {data.events.map((ev) => (
                  <button
                    key={`${ev.name}-${ev.date}`}
                    onClick={() => setSelected(ev.date)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl text-right transition cursor-pointer ${
                      selected === ev.date
                        ? "bg-blue-50 text-blue-700 border border-blue-200"
                        : "hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    <div>
                      <span className="text-xs font-semibold block">{ev.name}</span>
                      <span className="text-[11px] text-slate-400">{ev.note}</span>
                    </div>
                    <span className="text-xs font-bold text-slate-500 shrink-0 mr-2">
                      {ev.date.split("-").slice(1).reverse().join(".")}
                    </span>
                  </button>
                ))}
              </div>
            </Card>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
