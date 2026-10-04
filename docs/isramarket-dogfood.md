# IsraMarket as an IsraMarket customer

[Task #66](https://github.com/shaharAka/israMArket/issues/66). Working plan, 2 October 2026.
This document is a launch brief and experiment proposal. No invented visits, account
connections, customers, revenue, posts or results. Actual account and asset details belong
in the private tracker, not this public repository.

## The business and the plan

IsraMarket helps an Israeli small-business owner decide what to do in marketing, produce
content for that plan, and turn available evidence into the next decision. The plan is
the product. The editor supports it. The initial pilot audience is independent designers
and other service providers with a portfolio, an existing social profile and limited time
for marketing. This is a testable segment choice, not evidence that services sell more easily.

Positioning to test:

> תוכנית שיווק שמתחילה בעסק שלכם, ומלווה אתכם בצעד הבא.
> יודעים מה להציג, למי, ואיך לבדוק אם זה עזר.

Primary outcome: owners who save a useful plan and take its first meaningful action.
Visits and clicks are supporting indicators. Account creation alone is not success.
Use two activation paths, reported separately: a useful read from a connected source, or
a reviewed first post prepared from the owner's materials. Weekly return should include
an action, not just a page load.

Initial baseline: unknown. Obtain observations before setting a numeric growth target.
No paid promotion is authorized by this brief. Start with owned organic publication and
manual delivery; public automatic publishing is not implemented.

The current product's `services` model is only a proxy for a software subscription.
Its inquiry count, deal value and project capacity are not a SaaS activation/retention
model. Record this friction during normal onboarding; do not fill made-up service revenue
to make its goal calculator pass.

## First experiment

Hypothesis: a specific owner problem followed by one plan decision and a concrete next
action will attract more suitable, activated owners than a generic AI-content promise.
This first run establishes a baseline; it cannot prove a comparison without a second
variant and enough observations.

First content brief: **“What should a designer publish when there is no new finished project?”**
Show one decision from a plan, one explanatory post, and how to judge the next response.
Use a designer example labelled as an example, with no fabricated project testimonial.
Visual: the plan's objective, one next action and its evidence slot in the product's blue
and sun language. No stock-photo business owner or screenshot containing customer data.

Draft caption for review before publication:

> אין פרויקט חדש להעלות השבוע? עדיין יש לכם משהו מועיל להגיד.
>
> מעצבת יכולה להסביר החלטה מקצועית אחת: למה בחרה כיוון מסוים, למי הוא מתאים
> ומה כדאי ללקוח לבדוק לפני שמתחילים. הפוסט נובע מהמטרה בתוכנית, ולא רק מהצורך
> ״להעלות משהו״.
>
> בישראמארקט מתחילים בהיכרות עם העסק ובתוכנית שיווק. אחר כך בוחרים מה לקדם,
> מכינים תוכן ובודקים את הצעד הבא לפי המידע שיש.
>
> אפשר להתחיל בלי להירשם ולראות את הכיוון לעסק שלכם.

Destination: the verified live `/start` route, with distinct UTM source/medium/campaign/content
for each actual publication. The owned domain is still pending DNS/registry release at
this audit; use the current working deployment only after rechecking it. Do not insert
a guessed social profile or tell users the owned domain works before it does.

After the first review, two follow-up briefs:

- A plan decision: “More inquiries, or better-fitting projects?” Explain capacity and lead
  quality; show where an owner adjusts an assumption.
- A result decision: “People clicked, but did anyone contact you?” Explain what a link
  measures, what it cannot know, and what the owner should record next.

## Pass through the customer's actual journey

1. Verify the chosen customer identity and its active business. The app currently chooses
   the latest business and `from-draft` updates it. Never replace another customer's business
   or create a hidden database row to imitate a business switcher.
2. Complete `/start` as IsraMarket using truthful answers and unknown baselines. Save via
   the normal signup/login flow only after the account is safe for this business.
3. Record what the app recommended, where it used an assumption and whether its software
   service proxy distorted the plan. Compare the resulting plan with this brief.
4. Select only IsraMarket-owned accounts/assets in `/integrations`: its site Analytics
   property, Facebook Page, associated professional Instagram account, ad account/Pixel
   if available. Another customer's assets are not IsraMarket's marketing assets.
5. Verify each source with a real data read and timestamp. Configure site collection and
   consent before claiming that a Google account connection measures website activity.
6. Add real, non-sensitive brand/product materials, choose the offering and check voice.
   Generate and review the first post inside the product. Record any failed or onerous step.
7. Use the actual publishing kit. Publish to the confirmed owned destination, then save
   the public post URL and report publication. No social grant is proof a post went live.
8. Read the measured window, explain the finding in plain language, choose one next action,
   and update the plan. Retain the denominator and uncertainties with the conclusion.

## Instrumentation needed before useful evaluation

The site's root layout currently has no GA measurement tag. Connecting a customer GA4
property reads its data; it does not install tracking on this website. The general
measurement contract is in `docs/user-flows.md`.

Required pilot evidence:

- Property and web stream belong to IsraMarket, with a supplied measurement ID and a
  verified page/event signal under the site's consent choices.
- A tagged publication visit can be joined to pre-signup flow start and a saved plan
  without leaking answers or personal data into analytics properties.
- First useful source read and first generated/approved/reported-published post are
  independent states. OAuth success and clicking “connect” are not value delivery.
- Weekly return/action is deduplicated for a documented time window. Subscription and
  cancellation evidence comes from billing, not a landing-page estimate.

Dependencies remain: safe customer account, confirmed owned social assets, IsraMarket
Analytics collection, relevant provider approvals and the real publish/read cycle. Those
are open work, not completed by merging this brief or viewing the local flow-board sample.

## Launch and first-month content draft

Campaign task: [#74](https://github.com/shaharAka/israMArket/issues/74). Release gate:
[#73](https://github.com/shaharAka/israMArket/issues/73), defined in `docs/launch-readiness.md`.
Day 1 means the approved launch day; no calendar date is invented. This first month is
the first learning window of an ongoing strategy, not a fixed-duration customer plan.

Start with **three feed assets a week: two 18–25 second reels and one five-slide carousel**.
Reuse one clear excerpt from each as a Story. Eight reels and four carousels are drafted
below; produce one representative reel before batching the rest. If the cycle consumes
too much time or cost, reduce cadence rather than weaken quality. No paid ads are authorized.

Main audience: independent service providers with real work to show and limited marketing
time. Include a shop example to test whether the proposition transfers; report those
cohorts separately. One action per asset: start discovering the business, or review a
specific product example. Never promise revenue, instant verified analytics or automatic posting.

### Shared production treatment

- Use the real blue/sun/store identity and flat motion. The store needs an awning/sign,
  not a house silhouette. Draw the path first, then move through plan → content → evidence
  → the business. It should explain progress, not become decoration around every message.
- Use real product capture with no private account information, or label a synthetic
  example “דוגמה להמחשה”. Show readable details instead of a screen full of tiny text.
- Reel master: 9:16, 1080×1920, H.264 MP4, 30fps; editable Hebrew captions with mixed
  numbers/URLs verified. Keep text clear of the destination app's actual controls. Check
  exported phone playback and silent comprehension before approving the master (#71).
- Quiet motion: highlight one plan decision, reveal one post, show one observation.
  Captions and purposeful flat animation come first. Generated video/voice is optional.
  No licensed music, provider purchase or realistic fictional spokesperson is assumed.
- The requested advanced Claude/Opus and Astra variants are candidates for creative
  direction, script critique or motion-code work. Exact model IDs, access and costs need
  verification before use; a text-model review is not a video render. Existing Astra UX
  feedback informed the first-cycle emphasis, not a claim that campaign assets were generated.
- To pace usage, draft in-house now; use one bounded advanced-model review of the master
  only when needed. Reuse the approved template, and count retries in accepted-export cost.

### Week 1 — show the product and take the first action

**Day 1 · Reel 1 · “What comes before another post?”**

Hook/caption: “לפני עוד פוסט — מה העסק שלכם צריך לקדם?”

Script: “קל למלא את השבוע בפוסטים. קשה יותר לבחור מה כדאי לקדם. בישראמארקט
מכירים את העסק, בונים תוכנית, וממנה בוחרים את הפעולה הקרובה. התוכן משרת את
המטרה. אחר כך בודקים מה למדנו ומעדכנים את הכיוון.”

Sequence: 0–4s one empty post slot and the question; 4–11s real plan with one decision
highlighted; 11–18s a draft post beside that decision; 18–24s the next-action area and
store/sun mark. End CTA: “להתחיל להכיר את העסק שלכם”. Caption addendum: “אפשר להתחיל
בלי להירשם. שמירת התוכנית בחשבון היא שלב נפרד.”
Measurement question: do tagged visitors begin discovery and reach a plan?

**Day 3 · Carousel 1 · “A plan you can work with”**

Slides: (1) “מה יש בתוכנית שאפשר לעבוד איתה?” (2) “מה רוצים לקדם — ולמי.”
(3) “על מה אנחנו מסתמכים, ומה עוד לא יודעים.” (4) “פעולה אחת קרובה, ותוכן שיעזור
לה.” (5) “בודקים מה קרה. מעדכנים את הצעד הבא.”
Caption: “תוכנית טובה צריכה לעזור לבחור. בישראמארקט היא הבסיס לתוכן ולהחלטה הבאה.
הנתונים החסרים נשארים גלויים, והכיוון ממשיך להתעדכן.”
Visual: one plan example unfolded across slides, not five unrelated icon cards.
CTA: “ראו איך זה נראה לעסק שלכם”. Question: does this asset lead to saved plans?

**Day 5 · Reel 2 · “No new project this week?”**

Hook: “אין פרויקט חדש להעלות? יש החלטה מקצועית ששווה להסביר.”
Script: “מעצבת יכולה להראות למה בחרה פתרון מסוים, למי הוא מתאים ומה כדאי לבדוק
לפני שמתחילים. בוחרים עבודה שמותר להציג ושירות שרוצים לקדם. מהם מכינים פוסט.
אתם בודקים את הטקסט והעיצוב לפני הפרסום.”
Sequence: question → labeled designer plan → owned/example project detail → editable
post with one explanation highlighted → owner approval. No fictional client endorsement.
Caption: “לא צריך להמציא עבודה חדשה כדי להסביר את הערך שלכם. הדוגמה בסרטון להמחשה.”
CTA: “להתחיל מהשירות שלכם”. Question: which service owners take a first content action?

### Week 2 — make the first post useful and personal

**Day 8 · Reel 3 · “Use what the business already has”**

Hook: “התמונה הטובה לפוסט הבא אולי כבר אצלכם.”
Script: “מתחילים ממה שיש: עבודה אמיתית, מוצר שרוצים להציג או תשובה טובה לשאלה
של לקוח. בוחרים מה משרת את התוכנית, מוסיפים את החומר, ומכינים פוסט לבדיקה.
לא צריך לחכות לחודש של מדידה בלי לפרסם.”
Sequence: three existing material examples → one selected item → actual upload/select
flow → draft → clearly manual publish kit. Caption: “חומר אמיתי, כיוון ברור ובדיקה שלכם
לפני הפרסום. חיבורי המדידה הזמינים מתקדמים במקביל.”
CTA: “לראות מה אפשר לבנות מהעסק שלכם”. Question: where do owners get stuck supplying material?

**Day 10 · Carousel 2 · “One post, one job”**

Slides: (1) “מה התפקיד של הפוסט הזה?” (2) “להסביר שירות? להציג מוצר? לענות על
התלבטות?” (3) “בחרו דבר אחד שהלקוח צריך להבין.” (4) “הראו הוכחה אמיתית, בשפה שלכם.”
(5) “הזמינו לצעד אחד ברור.”
Caption: “לא כל פוסט צריך למכור הכול. כשיש לו תפקיד בתוכנית, קל יותר לבחור
מה להראות ומה לבדוק אחר כך.” Visual: the same example narrowed into a finished draft.
CTA: “מתחילים מהתוכנית”. Question: which topic brings appropriate owners rather than general AI curiosity?

**Day 12 · Reel 4 · “Your voice stays yours”**

Hook: “אם זה לא נשמע כמוכם — מתקנים לפני שמפרסמים.”
Script: “הטיוטה היא התחלה. בודקים מה כתוב, מתקנים ניסוח, בוחרים את התמונה ומאשרים.
המטרה היא להסביר את העסק שלכם, לא להישמע כמו כל עסק אחר. הפרסום נעשה מתוך
הערכה שאתם בודקים.”
Sequence: draft with one generic sentence → actual text edit → owned material → approval
and manual kit. Use only behavior demonstrated in the release. Caption: “אתם מכירים את
העסק. הטיוטה והעיצוב נשארים לבדיקה ולשינוי שלכם.”
CTA: “לראות את התוכנית והדרך לפוסט”. Question: do owners understand approval versus publication?

### Week 3 — explain evidence without pretending it is a result

**Day 15 · Reel 5 · “A click is not a customer”**

Hook: “לחצו על הקישור. אבל האם פנו אליכם?”
Script: “לחיצה מספרת שמישהו עבר לשלב הבא. היא לא אומרת שנשלחה הודעה, שהפנייה
התאימה או שנסגרה עבודה. מחברים את הנתונים הזמינים, מוסיפים מה שאתם יודעים
מהפניות, ובוחרים מה צריך לבדוק בהצעה הבאה.”
Sequence: labeled illustrative click → separate inquiry/fit/work states with no invented
counts → evidence limitation → one action to clarify an offer. Actual Results capture only
if that release demonstrates the stated behavior; otherwise label the visual explanation.
Caption: “מדידה מועילה מתחילה בהבנה של מה הנתון באמת אומר.”
CTA: “לבנות תוכנית עם צעד שאפשר לבדוק”. Question: can owners explain the difference in their own words?

**Day 17 · Carousel 3 · “What to do with missing data”**

Slides: (1) “אין עדיין נתונים? זה לא אפס.” (2) “רושמים מה יודעים ומה חסר.”
(3) “מחברים מקור שמתאים לעסק.” (4) “מפרסמים משהו מועיל עם דרך להגיע אליכם.”
(5) “לומדים מהתגובה — ומדייקים.”
Caption: “לא מחכים לתמונה מושלמת כדי להתחיל. וגם לא ממציאים מספרים. התוכנית
מבדילה בין מה שנמדד, מה שסיפרתם ומה שעדיין צריך לבדוק.”
Visual: a labeled blank evidence slot becomes an observation, not a fabricated rising chart.
CTA: “להתחיל מנקודת הפתיחה שלכם”. Question: does this reduce hesitation without creating false expectations?

**Day 19 · Reel 6 · “Connecting the right source”**

Hook: “החיבור צריך לעזור לתוכנית. לא להפוך לעוד פרויקט.”
Script: “כניסה עם Google היא כניסה לחשבון. קריאת נתוני האתר דורשת אישור נפרד
ובחירת האתר הנכון. גם ברשתות בוחרים את העמוד של העסק. מחברים את המקור שעוזר
לפעולה שלכם, וממשיכים לעבוד על התוכנית.”
Sequence: actual sign-in distinction → named asset selection → actual read status → plan.
Show only publicly usable integrations after approvals. Until then, hold this asset or
label an educational sketch explicitly; never simulate a successful customer connection.
Caption: “אישור גישה ובחירת הנכס הם צעדים נפרדים. זמינות החיבורים תלויה במקור.”
CTA: “להתחיל בתוכנית, ולהתקדם לפי מה שמתאים לעסק”. Question: do new owners reach a verified useful read?

### Week 4 — show learning and invite suitable owners

**Day 22 · Reel 7 · “A shop's next post”**

Hook: “לפני שמציעים הנחה — מה הלקוח צריך להבין על המוצר?”
Script: “בוחרים מוצר שרוצים לקדם ושאלה שלקוחות שואלים עליו. התוכנית עוזרת
להחליט מה להסביר, והפוסט מראה את הפרט הרלוונטי. אחר כך בודקים את התגובה
ומחליטים אם לשנות את ההסבר או את ההצעה.”
Sequence: labeled shop example → real authorized product detail or product UI schematic
→ one explanation in draft → owner approval → evidence question. Caption: “זו דוגמה
לחשיבה מתוך תוכנית — לא תוצאה של חנות אמיתית.”
CTA: “לבנות את הכיוון לחנות שלכם”. Question: compare shop and service activation without blending cohorts.

**Day 24 · Carousel 4 · “What changed in the plan?”**

Slides: (1) “פרסמנו. עכשיו מה משנים?” (2) “מה ראינו בפועל?” (3) “מה עדיין לא
אפשר להסיק?” (4) “איזו הנחה כדאי לבדוק?” (5) “שינוי אחד בפוסט או בתוכנית הבאה.”
Caption: “לא מחליפים אסטרטגיה בגלל תנודה אחת. מסבירים את התצפית, שומרים את
ההקשר ובוחרים את הניסוי הבא.” Visual: one plan decision with an evidence note; use
actual IsraMarket pilot learning if available, otherwise a plainly labeled explanatory example.
CTA: “להתחיל מתוכנית שממשיכה ללמוד”. Question: does the finding lead to a selected action?

**Day 26 · Reel 8 · “We use it too”**

Hook if completed: “גם את השיווק של ישראמארקט אנחנו בונים בישראמארקט.”
Script only after actual pilot evidence: “הגדרנו את הקהל, בחרנו פעולה, הכנו את
הפוסט ובדקנו מה קרה. כאן הייתה החלטה ששינינו, וכאן עדיין חסר מידע. זו הדרך
שאנחנו רוצים לתת גם לעסק שלכם: תוכנית, פעולה, למידה והמשך.”
Sequence: real sanitized owned plan → actual published post URL/view → dated real observation
with limitations → one changed decision. Never manufacture this case study.
Fallback if the pilot is incomplete: hook “כך נראה הצעד הבא אחרי הפוסט הראשון”;
use the approved explanatory sequence and label it as an example, without the dogfood claim.
Caption: report the real observation when available; no invented conversion percentage.
CTA: “להתחיל מהעסק שלכם”. Question: are saved plans followed by an actual useful action and return?

### Production and weekly review

For each asset, the campaign issue records: script approval, asset rights, master/template,
render review, destination/link check, publication URL/time, observation window and next
decision. A script is not a generated asset; a rendered asset is not a published post.

Days 7, 14, 21 and 28: review tagged visits, discovery starts, plans viewed/saved, first
useful source reads, generated/approved/reported-published content and meaningful return.
Record missing instrumentation rather than reporting zero. Compare the previous step's
denominator and note small samples, account tests and attribution limits. Add brief owner
feedback: did they understand the plan and know what to do next?

Choose one change for the next week: unclear hook, weak audience fit, an onboarding
friction, missing material or a confusing finding. Outcome targets wait for an observed
baseline. Initial commitments are operational: inspected assets, truthful publication
records, an actual customer cycle and a useful weekly learning note.
