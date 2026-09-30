import { EXAMPLE, GOAL, MEASURES, THIS_WEEK } from "./content";

/**
 * The hero's product view: the weekly home as an owner sees it in the middle of the plan.
 * This week's step, where the plan stands, what we learned, and the three numbers.
 * Drawn in HTML (not a screenshot), so it stays sharp and matches the copy.
 */
export function HeroWeek({ className = "" }: { className?: string }) {
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
        <section className="lv2-wk-main">
          <h3 className="lv2-part-title">הצעד של השבוע</h3>
          <p className="lv2-wk-step">{THIS_WEEK.step}</p>
          <p className="lv2-wk-note">{THIS_WEEK.stepNote}</p>
          <ul className="lv2-wk-posts">
            {THIS_WEEK.posts.map((post) => (
              <li key={post.text}>
                <span className="lv2-wk-thumb" aria-hidden />
                <span className="lv2-wk-post">
                  <small>{post.where} · מחכה לאישור</small>
                  {post.text}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="lv2-wk-side">
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
        </section>
      </div>

      <ul className="lv2-wk-kpis">
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
