import { EXAMPLE, GOAL, MEASURES, THIS_WEEK } from "./content";

/**
 * The weekly screen as an owner sees it in the middle of the plan: this week's step, the
 * posts waiting for approval (drawn as real post designs, not placeholders), where the
 * plan stands, what we learned, and the three numbers.
 *
 * `tour` marks the three regions the landing's scroll tour highlights one by one
 * (`data-i` 0 step, 1 posts, 2 numbers; ScrollScenes sets their `data-state`).
 */
export function HeroWeek({ className = "", tour = false }: { className?: string; tour?: boolean }) {
  const region = (i: number) => (tour ? { "data-i": i, "data-region": "" } : {});
  return (
    <div className={`lv2-sheet lv2-week-card ${className}`}>
      <div className="lv2-sheet-head">
        <span className="lv2-sheet-mark" aria-hidden />
        <p>
          <strong>{EXAMPLE.name}</strong>
          <span>{THIS_WEEK.range}</span>
        </p>
        <span className="lv2-sheet-tag">דוגמה</span>
      </div>

      <div className="lv2-wk-grid">
        <div className="lv2-wk-main">
          <section className="lv2-wk-region" {...region(0)}>
            <h3 className="lv2-part-title">הצעד של השבוע</h3>
            <p className="lv2-wk-step">{THIS_WEEK.step}</p>
            <p className="lv2-wk-note">{THIS_WEEK.stepNote}</p>
          </section>

          <section className="lv2-wk-region lv2-wk-posts-region" {...region(1)}>
            <h3 className="lv2-part-title">מחכים לאישור שלכם</h3>
            <ul className="lv2-wk-posts">
              <li>
                <div className="lv2-post lv2-post--cream" aria-hidden>
                  <span className="lv2-post-donut" />
                  <strong>סופגניות בהזמנה מראש</strong>
                  <small>מזמינים עד יום חמישי</small>
                </div>
                <p className="lv2-wk-post">
                  <span>{THIS_WEEK.posts[0].where}</span>
                  <span className="lv2-wk-pill">מוכן לאישור</span>
                </p>
              </li>
              <li>
                <div className="lv2-post lv2-post--dark" aria-hidden>
                  <strong>מי שמזמין מראש לא עומד בתור</strong>
                  <small>{EXAMPLE.name}</small>
                </div>
                <p className="lv2-wk-post">
                  <span>{THIS_WEEK.posts[1].where}</span>
                  <span className="lv2-wk-pill">מוכן לאישור</span>
                </p>
              </li>
            </ul>
          </section>
        </div>

        <aside className="lv2-wk-side">
          <h3 className="lv2-part-title">התוכנית</h3>
          <div className="lv2-wk-bar" aria-hidden>
            <i data-fill="full" />
            <i data-fill="half" />
            <i />
          </div>
          <p className="lv2-wk-month">{THIS_WEEK.month}</p>
          <p className="lv2-wk-goal">
            המטרה: <strong>{GOAL.target}</strong> {GOAL.unit}. היום {GOAL.today}.
          </p>
          <h3 className="lv2-part-title lv2-wk-sub">מה למדנו השבוע</h3>
          <p className="lv2-wk-learned">{THIS_WEEK.learned}</p>
        </aside>
      </div>

      <ul className="lv2-wk-kpis lv2-wk-region" {...region(2)}>
        {MEASURES.map((m) => (
          <li key={m.k}>
            <span>{m.k}</span>
            <strong>{m.v.toLocaleString("he-IL")}</strong>
            {m.delta ? <em>{m.delta}</em> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
