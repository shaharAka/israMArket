// node --test tests/copySpacing.test.mjs
import { RuleTester } from "eslint";
import parser from "@typescript-eslint/parser";
import { copySpacing } from "../eslint-rules/copy-spacing.mjs";

const tester = new RuleTester({
  languageOptions: { parser, parserOptions: { ecmaFeatures: { jsx: true } } },
});
const glued = [{ messageId: "glued" }];

tester.run("copy-spacing", copySpacing, {
  valid: [
    `<p><Copy text="שבוע" /> {week}</p>`,
    `<p><Copy text="לפני כן:" />{" "}{prior}</p>`,
    `<p><Copy text="לפני כן:" />{" "}\n  {prior}</p>`,
    // Deliberate joins: a prefix letter, a maqaf, an opening bracket.
    `<p><Copy text="פרטי ה" />{kind}</p>`,
    `<p><Copy text="נקרא ב־" />{date}</p>`,
    `<summary><Copy text="ההשערות שנבדוק (" />{count})</summary>`,
    // Closing punctuation needs no space before it.
    `<p>{AGENT_NAME}<Copy text=", או לכתוב בעצמכם." /></p>`,
    `<p><Copy text="יום חינם" />{card ? ", בלי כרטיס" : ""}</p>`,
    // Text that starts with a space.
    `<h2><Copy text="בונים את החודש" />{name ? t(" של {arg_0}", { arg_0: name }) : ""}</h2>`,
    // Elements a parent lays out on their own never run together.
    `<div className="flex gap-2"><span>{n}</span><Copy text="פוסטים" /></div>`,
    `<p><span className={styles.label}><Copy text="מטרה" /></span><strong>{goal}</strong></p>`,
    // Values alone are not translated copy.
    `<p>{a}{b}</p>`,
  ],
  invalid: [
    { code: `<p><Copy text="שבוע" />{week}</p>`, errors: glued },
    { code: `<p><Copy text="החודש הבא:" />\n  {month}</p>`, errors: glued },
    { code: `<p><Copy text="יום" /><span className="font-semibold tabular-nums">{day}</span></p>`, errors: glued },
    { code: `<p>{count}<Copy text="פניות" /></p>`, errors: glued },
    { code: `<p>{t("שבוע")}{week}</p>`, errors: glued },
    { code: `<p className="flex gap-2"><Copy text="כל הפוסטים של" />{month}</p>`, errors: glued },
    { code: `<p><b><Copy text="החודש עוד לא מוכן." /></b><Copy text="בונים את הצעדים." /></p>`, errors: glued },
  ],
});
