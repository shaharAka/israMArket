
import { Copy } from "@/components/language/LanguageProvider";
import { EXAMPLE, GOAL, MEASURES, THIS_WEEK } from "./content";

/**
 * The weekly screen as an owner sees it in the middle of the plan: this week's step, the
 * posts waiting for approval (drawn as real post designs, not placeholders), where the
 * plan stands, what we learned, and the three numbers.
 *
 * `tour` marks the three regions the landing's tour highlights one by one
 * (`data-i` 0 step, 1 posts, 2 numbers; ScenePlayer sets their `data-state`).
 */
export function HeroWeek({ className = "", tour = false }: { className?: string; tour?: boolean }) {
  const region = (i: number) => (tour ? { "data-i": i, "data-region": "" } : {});
  return (
    <div className={`lv2-sheet lv2-week-card ${className}`}>
      <div className="lv2-sheet-head">
        <span className="lv2-sheet-mark" aria-hidden />
        <p>
          <strong>{EXAMPLE.name}</strong>
          <span><Copy text={THIS_WEEK.range} /></span>
        </p>
        <span className="lv2-sheet-tag"><Copy text="דוגמה" /></span>
      </div>

      <div className="lv2-wk-grid">
        <div className="lv2-wk-main">
          <section className="lv2-wk-region" {...region(0)}>
            <h3 className="lv2-part-title"><Copy text="הצעד של השבוע" /></h3>
            <p className="lv2-wk-step"><Copy text={THIS_WEEK.step} /></p>
            <p className="lv2-wk-note"><Copy text={THIS_WEEK.stepNote} /></p>
          </section>

          <section className="lv2-wk-region lv2-wk-posts-region" {...region(1)}>
            <h3 className="lv2-part-title"><Copy text="מחכים לכם" /></h3>
            <ul className="lv2-wk-posts">
              <li>
                <div className="lv2-post lv2-post--cream" aria-hidden>
                  <span className="lv2-post-donut" />
                  <strong><Copy text="סופגניות בהזמנה מראש" /></strong>
                  <small><Copy text="מזמינים עד יום חמישי" /></small>
                </div>
                <p className="lv2-wk-post">
                  <span><Copy text={THIS_WEEK.posts[0].where} /></span>
                  <span className="lv2-wk-pill"><Copy text="מוכן לאישור" /></span>
                </p>
              </li>
              <li>
                <div className="lv2-post lv2-post--dark" aria-hidden>
                  <strong><Copy text="מי שמזמין מראש לא עומד בתור" /></strong>
                  <small>{EXAMPLE.name}</small>
                </div>
                <p className="lv2-wk-post">
                  <span><Copy text={THIS_WEEK.posts[1].where} /></span>
                  <span className="lv2-wk-pill"><Copy text="מוכן לאישור" /></span>
                </p>
              </li>
            </ul>
          </section>
        </div>

        <aside className="lv2-wk-side">
          <h3 className="lv2-part-title"><Copy text="התוכנית" /></h3>
          <div className="lv2-wk-bar" aria-hidden>
            <i data-fill="full" />
            <i data-fill="half" />
            <i />
          </div>
          <p className="lv2-wk-month"><Copy text={THIS_WEEK.month} /></p>
          <p className="lv2-wk-goal"><Copy text="המטרה:" />{" "}<strong>{GOAL.target}</strong> <Copy text={GOAL.unit} /><Copy text=". היום {arg_0}." args={{ arg_0: GOAL.today }} />
          </p>
          <h3 className="lv2-part-title lv2-wk-sub"><Copy text="מה למדנו השבוע" /></h3>
          <p className="lv2-wk-learned"><Copy text={THIS_WEEK.learned} /></p>
        </aside>
      </div>

      <ul className="lv2-wk-kpis lv2-wk-region" {...region(2)}>
        {MEASURES.map((m) => (
          <li key={m.k}>
            <span><Copy text={m.k} /></span>
            <strong>{m.v.toLocaleString("he-IL")}</strong>
            {m.delta ? <em><Copy text={m.delta} /></em> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
