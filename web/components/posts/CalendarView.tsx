"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { endpoints, isDemo, type CalendarPayload, type RoadmapPost, type StrategyPayload } from "@/lib/api";
import type { StoredQuarterPlan } from "@/lib/quarterPlan";
import { monthLabel, shiftMonth } from "@/lib/months";
import { copyText } from "@/lib/ui";
import { LIFECYCLE_LABEL, lifecycleOf, postDay } from "./postMeta";
import { UIAction, TextField } from "@/components/design/Controls";
import { IconArrowLeft, IconChevron, IconPlus, IconTrash } from "@/lib/icons";
import styles from "./calendar.module.css";

const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const FILTERS = [{ id: "all", name: "הכל" }, { id: "posts", name: "פוסטים" }, { id: "tasks", name: "משימות" }, { id: "events", name: "מועדים" }];
type Task = { id: string; date: string; title: string; done: boolean };
type BoardPost = { post: RoadmapPost; index: number | null };
function isoFor(year: number, month: number, day: number) { return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`; }
function validDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [y, m, d] = date.split("-").map(Number);
  const value = new Date(y, m - 1, d);
  return value.getFullYear() === y && value.getMonth() === m - 1 && value.getDate() === d;
}
function formatDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `יום ${WEEKDAYS[new Date(y, m - 1, d).getDay()]}, ${d}.${m}.${y}`;
}
function validTask(value: unknown): value is Task {
  if (!value || typeof value !== "object") return false;
  const task = value as Task;
  return typeof task.id === "string" && typeof task.date === "string" && validDate(task.date) && typeof task.title === "string" && task.title.length > 0 && task.title.length <= 120 && typeof task.done === "boolean";
}

/** Personal tasks are explicitly browser-local, scoped to this plan (and separately to demo). */
function PersonalTasks({ scope, selected, onTasks }: { scope: string; selected: string; onTasks: (tasks: Task[]) => void }) {
  const key = `isramarket-calendar-tasks-v1:${scope}`;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [editing, setEditing] = useState(false);
  const callback = useRef(onTasks);
  useEffect(() => { callback.current = onTasks; }, [onTasks]);
  useEffect(() => {
    function read() {
      try {
        const raw: unknown = JSON.parse(localStorage.getItem(key) || "[]");
        if (!Array.isArray(raw) || !raw.every(validTask)) throw new Error("invalid tasks");
        setTasks(raw); callback.current(raw); setReady(true); setError("");
      } catch { setReady(false); setError("לא הצלחנו לקרוא את המשימות בדפדפן. המשימות השמורות לא הוחלפו."); }
    }
    function sync(event: StorageEvent) { if (event.key === key || event.key === null) read(); }
    read(); window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [key]);
  function save(next: Task[]) {
    if (!ready) return false;
    try { localStorage.setItem(key, JSON.stringify(next)); setTasks(next); onTasks(next); setError(""); return true; }
    catch { setError("המשימה לא נשמרה. הדפדפן לא מאפשר שמירה מקומית."); return false; }
  }
  return <div className={styles.personal}>
    <p className={styles.localNote}>משימות אישיות נשמרות בדפדפן הזה.</p>
    {tasks.filter(t => t.date === selected).map(task => <div className={styles.taskRow} key={task.id}>
      <label><input type="checkbox" checked={task.done} disabled={!ready} onChange={e => save(tasks.map(t => t.id === task.id ? { ...t, done: e.target.checked } : t))} /><span className={task.done ? styles.done : undefined}>{task.title}</span></label>
      <button type="button" disabled={!ready} title={`למחוק את המשימה: ${task.title}`} aria-label={`למחוק את המשימה: ${task.title}`} onClick={() => save(tasks.filter(t => t.id !== task.id))}><IconTrash /></button>
    </div>)}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {editing ? <form className={styles.taskForm} onSubmit={e => {
      e.preventDefault(); if (!title.trim()) return;
      if (save([...tasks, { id: crypto.randomUUID(), date: selected, title: title.trim(), done: false }])) { setTitle(""); setEditing(false); }
    }}>
      <TextField label={`משימה ל-${Number(selected.slice(-2))}.${Number(selected.slice(5, 7))}`} value={title} onChange={e => setTitle(e.target.value)} maxLength={120} required autoFocus placeholder="למשל, לבחור תמונות למוצר החדש" />
      <div><UIAction type="submit" variant="secondary" disabled={!title.trim()}>להוסיף משימה</UIAction><UIAction variant="text" onClick={() => { setEditing(false); setTitle(""); }}>ביטול</UIAction></div>
    </form> : <UIAction variant="text" disabled={!ready} onClick={() => setEditing(true)}><span className={styles.add}><IconPlus />משימה ליום הזה</span></UIAction>}
  </div>;
}

/** Shared plan calendar. Only explicitly dated plan actions become calendar items. */
export function CalendarView({ initialYear, initialMonth, posts, postsMonth, onOpenPost, strategy }: {
  initialYear: number; initialMonth: number; posts?: RoadmapPost[];
  postsMonth?: { year: number; month: number } | null; onOpenPost?: (index: number) => void;
  strategy?: StrategyPayload | null;
}) {
  const [period, setPeriod] = useState({ year: initialYear, month: initialMonth });
  const { year, month } = period;
  const [data, setData] = useState<CalendarPayload | null>(null);
  const [failure, setFailure] = useState<{ year: number; month: number; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState(isoFor(initialYear, initialMonth, 1));
  const [filter, setFilter] = useState("all");
  const [copyFallback, setCopyFallback] = useState<{ date: string; text: string } | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [fallbackPlan, setFallbackPlan] = useState<StoredQuarterPlan | null>(null);
  const strategyId = strategy?.id;
  const storedPlan = strategy?.quarter_plan;
  const [scope, setScope] = useState<string | null>(null);
  /** Today's date, for the marker on the board. Read on the client only, after mount. */
  const [today, setToday] = useState("");
  const id = useId();
  const board = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => { const now = new Date(); setToday(isoFor(now.getFullYear(), now.getMonth() + 1, now.getDate())); }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { setTasks([]); setScope(strategyId != null ? (isDemo() ? "demo" : `plan-${strategyId}`) : null); }, 0);
    return () => window.clearTimeout(timer);
  }, [strategyId]);
  useEffect(() => {
    if (storedPlan || strategyId == null) return;
    let active = true;
    endpoints.business().then(result => { if (active) setFallbackPlan(result.business?.quarter_plan ?? null); }).catch(() => undefined);
    return () => { active = false; };
  }, [strategyId, storedPlan]);
  useEffect(() => {
    let active = true;
    endpoints.calendar(year, month).then(payload => { if (active) { setData(payload); setFailure(null); } })
      .catch(err => { if (active) setFailure({ year, month, message: err instanceof Error ? err.message : "לא הצלחנו לטעון את המועדים" }); });
    return () => { active = false; };
  }, [year, month, attempt]);
  const currentData = data?.year === year && data.month === month ? data : null;
  const error = failure?.year === year && failure.month === month ? failure.message : "";
  const loading = !currentData && !error;
  const onPlanMonth = Boolean(posts && postsMonth?.year === year && postsMonth.month === month);
  const boardPosts: BoardPost[] = onPlanMonth ? (posts ?? []).map((post, index) => ({ post, index })) : (currentData?.roadmap?.posts ?? []).map(post => ({ post, index: null }));
  const planTasks = ((storedPlan ?? fallbackPlan)?.calendar ?? []).flatMap(m => m.dates).filter(t => validDate(t.date) && t.action_he?.trim());
  const events = currentData?.events ?? [];
  const showPosts = filter === "all" || filter === "posts";
  const showTasks = filter === "all" || filter === "tasks";
  const showEvents = filter === "all" || filter === "events";
  const daysInMonth = new Date(year, month, 0).getDate();
  const pad = new Date(year, month - 1, 1).getDay();
  // Blank cells fill the first and the last week, so the hairline grid closes on both ends.
  const trail = (7 - ((pad + daysInMonth) % 7)) % 7;
  const cells: (number | null)[] = [...Array.from({ length: pad }, () => null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1), ...Array.from({ length: trail }, () => null)];
  const dayPosts = showPosts ? boardPosts.filter(t => postDay(t.post) === selected) : [];
  const dayEvents = showEvents ? events.filter(t => t.date === selected) : [];
  const dayPlanTasks = showTasks ? planTasks.filter(t => t.date === selected) : [];
  const dayTasks = showTasks ? tasks.filter(t => t.date === selected) : [];
  function move(delta: number) {
    const next = shiftMonth(year, month, delta); setPeriod(next); setSelected(isoFor(next.year, next.month, 1));
  }
  async function copyPost(post: RoadmapPost) {
    const text = post.hook + "\n\n" + post.caption;
    try { await copyText(text, "הטקסט הועתק"); setCopyFallback(null); }
    catch { setCopyFallback({ date: selected, text }); }
  }
  function keyDay(event: KeyboardEvent<HTMLButtonElement>, day: number) {
    const weekday = new Date(year, month - 1, day).getDay();
    const next = event.key === "ArrowLeft" ? day + 1 : event.key === "ArrowRight" ? day - 1 : event.key === "ArrowDown" ? day + 7 : event.key === "ArrowUp" ? day - 7 : event.key === "Home" ? day - weekday : event.key === "End" ? day + 6 - weekday : null;
    if (next === null) return;
    event.preventDefault(); const clamped = Math.max(1, Math.min(daysInMonth, next));
    const date = isoFor(year, month, clamped); setSelected(date); board.current?.querySelector<HTMLButtonElement>(`[data-date="${date}"]`)?.focus();
  }
  return <div className={styles.calendar}>
    <header className={styles.toolbar}>
      <h2>{monthLabel(year, month)}</h2>
      <div className={styles.monthNav}><button type="button" onClick={() => move(-1)} title="החודש הקודם" aria-label="החודש הקודם"><IconChevron className="rotate-180" /></button><button type="button" onClick={() => move(1)} title="החודש הבא" aria-label="החודש הבא"><IconChevron /></button></div>
      {(year !== initialYear || month !== initialMonth) && <button className={styles.return} type="button" onClick={() => { setPeriod({ year: initialYear, month: initialMonth }); setSelected(isoFor(initialYear, initialMonth, 1)); }}>לחודש התוכנית</button>}
      <div className={styles.filters} role="group" aria-label="מה להציג בלוח">{FILTERS.map(item => <button type="button" key={item.id} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.name}</button>)}</div>
    </header>
    {loading && <p className={styles.load} role="status">טוענים את המועדים…</p>}
    {error && <p className={styles.error} role="alert">המועדים לא נטענו. הפוסטים והמשימות שלכם עדיין כאן. <button type="button" onClick={() => setAttempt(n => n + 1)}>לנסות שוב</button></p>}
    <div className={styles.layout}>
      <section className={styles.board} aria-label="לוח החודש">
        <div className={styles.sheet}>
        <div className={styles.weekdays}>{WEEKDAYS.map(day => <span key={day}><span className={styles.fullDay}>{day}</span><span className={styles.shortDay}>{day === "שבת" ? "ש׳" : day.slice(0, 1) + "׳"}</span></span>)}</div>
        <div className={styles.days} ref={board}>{cells.map((day, index) => {
          if (!day) return <div key={`empty-${index}`} className={styles.blank} aria-hidden="true" />;
          const date = isoFor(year, month, day);
          const pp = showPosts ? boardPosts.filter(t => postDay(t.post) === date) : [];
          const ee = showEvents ? events.filter(t => t.date === date) : [];
          const tt = showTasks ? [...planTasks.filter(t => t.date === date).map(t => ({ title: t.action_he, done: false })), ...tasks.filter(t => t.date === date)] : [];
          const count = pp.length + ee.length + tt.length;
          return <button type="button" key={date} data-date={date} data-today={date === today ? "" : undefined} aria-current={date === today ? "date" : undefined} aria-pressed={selected === date} aria-controls={`${id}-day`} tabIndex={selected === date ? 0 : -1} aria-label={`${formatDay(date)}${count ? `, ${pp.length} פוסטים, ${tt.length} משימות, ${ee.length} מועדים` : ", אין פריטים"}`} onKeyDown={e => keyDay(e, day)} onClick={() => setSelected(date)}>
            <span className={styles.number}>{day}</span>
            <span className={styles.cellItems}>{pp.slice(0, 2).map((t, i) => <span key={`post-${i}`} data-kind="post">{t.post.title}</span>)}{tt.slice(0, 2).map((t, i) => <span key={`task-${i}`} data-kind="task" className={t.done ? styles.done : undefined}>{t.title}</span>)}{ee.slice(0, 1).map(t => <span key={t.name} data-kind="event">{t.name}</span>)}</span>
            <span className={styles.marks} aria-hidden="true">{pp.length > 0 && <i data-kind="post" />}{tt.length > 0 && <i data-kind="task" />}{ee.length > 0 && <i data-kind="event" />}</span>
          </button>;
        })}</div>
        </div>
        <p className={styles.legend}><span data-kind="post">פוסט</span><span data-kind="task">משימה</span><span data-kind="event">מועד</span></p>
      </section>
      <aside id={`${id}-day`} className={styles.inspector} aria-label="פרטי היום">
        <h3>{formatDay(selected)}</h3>
        {!dayPosts.length && !dayEvents.length && !dayPlanTasks.length && !dayTasks.length && <p className={styles.empty}>אין פריטים ביום הזה.</p>}
        {dayPlanTasks.map((task, i) => <article key={`${task.date}-${i}`} className={styles.item} data-kind="task"><span>מהתוכנית · {task.name_he}</span><h4>{task.action_he}</h4><a href="/strategy#plan-calendar">לראות בתוכנית<IconArrowLeft className={styles.arrow} /></a></article>)}
        {dayPosts.map(({ post, index }, i) => <article key={`${post.title}-${i}`} className={styles.item} data-kind="post"><span>פוסט · {LIFECYCLE_LABEL[lifecycleOf(post)]}</span><h4>{post.title}</h4><p>{post.hook}</p><div>{index !== null && onPlanMonth && onOpenPost && <UIAction variant="text" onClick={() => onOpenPost(index)}><span className={styles.add}>לפתוח את הפוסט<IconArrowLeft className={styles.arrow} /></span></UIAction>}<UIAction variant="text" onClick={() => void copyPost(post)}>להעתיק טקסט</UIAction></div></article>)}
        {copyFallback?.date === selected && <div className={styles.copyFallback}><p role="alert">ההעתקה לא הצליחה. אפשר לסמן ולהעתיק את הטקסט כאן:</p><textarea aria-label="טקסט הפוסט להעתקה ידנית" readOnly rows={4} value={copyFallback.text} onFocus={e => e.currentTarget.select()} /></div>}
        {dayEvents.map((event, i) => <article key={`${event.name}-${i}`} className={styles.item} data-kind="event"><span>{event.kind}</span><h4>{event.name}</h4>{event.note && <p>{event.note}</p>}{event.source && <details><summary>מקור</summary><p>{event.source}</p></details>}</article>)}
        {showTasks && scope && <PersonalTasks key={scope} scope={scope} selected={selected} onTasks={setTasks} />}
        {showTasks && !scope && <p className={styles.localNote}>משימות אישיות יהיו זמינות כשתהיה תוכנית לעסק.</p>}
      </aside>
    </div>
  </div>;
}
