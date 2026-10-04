# Beta invitation (#100)

> **DRAFT for Shahar's approval. Nothing here has been sent.** The invitation texts, the
> `/beta` page and the beta terms (`/beta/terms`, marked as a draft in its code) all wait
> for Shahar's approval of the wording and of every promise in the checklist below.

Placeholders: `{name}` the person's first name, `{business}` the business name as they say
it, `{link}` the invitation link: `<site>/beta?invite=<code>`. Until #103 (invite-only
access) exists, nothing checks the code: `/beta` passes it on to the normal start flow as
`/start?invite=<code>`. Shahar sends each message himself, from his own phone or mailbox.

## WhatsApp (86 words)

```text
היי {name}, מה שלומך?
אני בונה את ישראמארקט: תוכנית שיווק מתמשכת לעסקים קטנים שאין להם איש שיווק. כל שבוע מקבלים את הצעד הבא ופוסטים מוכנים בסגנון של העסק, ואחר כך בודקים מה הצליח ומעדכנים את התוכנית.
לפני שאני פותח לכולם, אני מחפש כמה עסקים שינסו את זה איתי, וחשבתי על {business}.
זה בחינם, בלי כרטיס אשראי. בתמורה אני מבקש בערך רבע שעה בשבוע לספר לי בכנות מה עובד ומה לא, ושיחה קצרה אחרי השבוע הראשון.
כל הפרטים כאן: {link}
ואם זה לא מתאים עכשיו, הכול טוב.
```

## Email (subject + 120 words)

**Subject:** `הזמנה אישית לבטא של ישראמארקט, בשביל {business}`

```text
היי {name},

אני בונה את ישראמארקט: תוכנית שיווק מתמשכת לעסקים קטנים שאין להם איש שיווק. כל שבוע מקבלים את הצעד הבא ופוסטים מוכנים בסגנון של העסק. אחר כך בודקים מה הצליח ומעדכנים את התוכנית.

לפני שאני פותח לכולם, אני מזמין כמה עסקים שאני מכיר לנסות את זה איתי. חשבתי על {business}.

בשבוע הראשון תקבלו תוכנית לעסק עם מטרה אחת ברורה, ופוסטים ראשונים בסגנון שלכם. אתם מאשרים כל פוסט ומפרסמים בעצמכם. אנחנו לא מפרסמים כלום בשמכם.

מה אני מבקש: בערך רבע שעה בשבוע לספר לי בכנות מה עובד ומה לא, ושיחה קצרה אחרי השבוע הראשון.

הבטא כולה בחינם, בלי כרטיס אשראי, ואפשר להפסיק ולמחוק הכול בכל רגע.

כל הפרטים, והכפתור להתחיל:
{link}

ואם זה לא מתאים עכשיו, הכול טוב.
תודה,
שחר
```

Word counts exclude the subject and count `{name}`, `{business}` and `{link}` as one word each.

## What Shahar confirms before the first invitation

Every promise below appears in the invitation, on `/beta` or in `/beta/terms`. Tick it,
or tell Claude what to change.

- [ ] **Free for the whole beta: no card, no charge.** This depends on #103: until beta
      accounts run with billing off, an invited account is an ordinary free month. After
      30 days it shows the subscription reminder, and if `BILLING_ENFORCE` is ever turned
      on, AI generation stops (docs/billing.md).
- [ ] **The beta runs from signup until the public launch.** No end date is given.
- [ ] **At least 30 days' email notice before the beta ends** (`BETA_NOTICE_DAYS`, the same
      30 days `/terms` promises for any change).
- [ ] **After the beta, they continue on the normal terms (99 ₪ a month) or leave.** A
      subscription starts only if they start it on `/billing`. Is there a beta discount
      or a longer free period? If so, the terms need a line for it.
- [ ] **About 15 minutes a week of honest feedback** (`BETA_FEEDBACK_MINUTES`), by WhatsApp,
      email or a call, as they prefer. It is a request, not an obligation.
- [ ] **One short phone call after the first week.**
- [ ] **What the first week brings:** a plan with one goal with numbers and the first step,
      first posts in their style (once they add photos), and a WhatsApp link that counts
      clicks per post. Is this realistic for a beta business in its first 7 days?
- [ ] **"We see how far you got":** the beta funnel (#101) shows Shahar each business's stage
      (plan built, post approved, marked as published), its time in that stage and the last
      activity. The data line on `/beta` and the feedback section of the terms say so.
- [ ] **The data is used only to work for them** (as `/terms` and `/security` already say),
      and they can delete everything at any time (`/account`, `/data-deletion`).
- [ ] **No use of their business name, content or data in marketing, demos or customer
      stories without explicit permission.** This also limits the Meta and Google review
      recordings (#41, #42): those should use IsraMarket's own business or a demo account.
- [ ] **"We never publish anything in your name."** This is true in the product today: no
      publishing permission is requested from Meta or Google (`services/meta.py`,
      `services/publish.py`, `/security`), and the owner approves and publishes each post.
      Any future auto-publishing would need each post's approval to keep this promise.
- [ ] **Connecting Instagram, Facebook and Google needs an extra step** until Meta and Google
      approve the app (#104 app testers, #105 Google test users or an unverified screen).
      We explain the step when they reach it.
- [ ] **Leave at any time, with no reason needed.**
- [ ] **Contact address:** the terms point to `CONTACT_EMAIL` (`web/lib/company.ts`).
