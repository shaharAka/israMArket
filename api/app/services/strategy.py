from datetime import date
from urllib.parse import urlencode, urlparse, urlunparse, parse_qsl
import re

from app.services.brand import extract_brand_language, public_scan
from app.services.calendar_il import israeli_events_for_month, posting_plan
from app.services.gemini import lite_json, strategy_json
from app.services.jsonutil import loads
from app.services.schemas_llm import (
    COMPETITOR_EXTRACT_SCHEMA,
    HYPOTHESES_SCHEMA,
    MONTHLY_POSTS_SCHEMA,
    PLAN_CORE_SCHEMA,
    POST_REWRITE_SCHEMA,
    SITE_EXTRACT_SCHEMA,
    USP_SCHEMA,
)
from app.services.month_loop import prior_prompt_block
from app.services.scraper import scrape_site


def extract_site_profile(scraped: dict) -> dict:
    prompt = f"""
חלץ הצעות ערך מהאתר הבא. השתמש רק בטקסט שסופק. אל תמציא יתרונות שלא כתובים.

URL: {scraped.get("url")}
כותרת: {scraped.get("title")}
מטא: {scraped.get("meta")}
כותרות: {scraped.get("headings")}
כפתורים: {scraped.get("buttons")}
טקסט:
{scraped.get("text")}
"""
    return loads(lite_json(prompt, SITE_EXTRACT_SCHEMA), {})


def extract_competitor(scraped: dict, name: str) -> dict:
    prompt = f"""
נתח את אתר המתחרה. רק מתוך הטקסט שסופק.

שם שהמשתמש ציין: {name}
URL: {scraped.get("url")}
כותרת: {scraped.get("title")}
טקסט:
{scraped.get("text")}
"""
    parsed = loads(lite_json(prompt, COMPETITOR_EXTRACT_SCHEMA), {})
    parsed["name"] = name
    parsed["url"] = scraped.get("url")
    return parsed


def scan_website(url: str) -> dict:
    own = scrape_site(url)
    profile = extract_site_profile(own)
    brand = extract_brand_language(own)
    if not profile.get("business_name") and brand.get("business_name"):
        profile["business_name"] = brand["business_name"]
    return public_scan(own, profile, brand)


def propose_hypotheses(business: dict, brand: dict, profile: dict) -> list[dict]:
    prompt = f"""
הצע בדיוק שלוש השערות צמיחה שונות לבעל עסק ישראלי קטן.
כל השערה חייבת להיות משפט אחד: אם נעשה X נשיג Y בתוך זמן Z.
אל תבקש מהעסק לכתוב אסטרטגיה. תן לו לבחור כיוון.

עסק: {business}
שפת מותג: {brand}
פרופיל מהאתר: {profile}
"""
    parsed = loads(strategy_json(prompt, HYPOTHESES_SCHEMA), {})
    items = parsed.get("hypotheses") or []
    if len(items) != 3:
        raise RuntimeError("Gemini לא החזיר שלוש השערות צמיחה לבחירה.")
    return items


def build_usp(profile: dict, competitors: list[dict], business: dict, brand: dict, prior: dict | None = None) -> dict:
    prompt = f"""
בנה אסטרטגיה עסקית, בידול (USP), השערת צמיחה ושיטות עבודה מוכחות (BKMs) לעסק ישראלי.
שפת המותג והמסרים חייבים לצאת מהאתר והנכסים האמיתיים של העסק, לא משפת סוכנות.

פרטי העסק מהאשף:
שם: {business.get("name")}
סוג: {business.get("business_type")}
הצעות ליבה ומוצרים: {business.get("offerings")}
מיקום: {business.get("location")}
מודל נוכחות: {business.get("presence_type")} (חנות פיזית / רק אתר / משולב)
מטרה: {business.get("primary_goal")}
תקציב חודשי בשקלים: {business.get("monthly_budget_ils")}
השערת צמיחה שהעסק בחר: {business.get("growth_hypothesis")}

שפת המותג שחולצה מהאתר:
{brand}

פרופיל שחולץ מהאתר:
{profile}

מתחרים שחולצו:
{competitors}

הנחיות קריטיות:
1. נסח הצעת ערך ייחודית (USP) ומשפט קמפיין מנצח (usp_one_liner).
2. אם יש השערת צמיחה שהעסק בחר — חדד אותה, אל תחליף אותה בכיוון אחר.
3. הגדר 2-3 יעדי צמיחה מדידים (growth_targets).
4. רשום 3-5 שיטות עבודה מוכחות (known_bkms) לתחום ולסוג הנוכחות (פיזי/אונליין).
5. חלק את התקציב באחוזים (budget_allocation) עם הסבר מפורש.
6. הטון חייב להישמע כמו האתר ({brand.get("voice")}).
7. אל תשתמש במילים שהאתר נמנע מהן: {brand.get("dont_say")}.
8. {prior_prompt_block(prior)}
9. אם יש אופק ארוך מהחודש הקודם — קדם את אבן הדרך של החודש החדש, אל תתחיל סיפור אחר.
"""
    return loads(strategy_json(prompt, USP_SCHEMA), {})


def _slug(value: str) -> str:
    cleaned = re.sub(r"[^\w]+", "-", value or "", flags=re.UNICODE).strip("-")
    return (cleaned[:32] or "post").lower()


def attach_tracking(posts: list[dict], business: dict, year: int, month: int) -> list[dict]:
    website = (business.get("website_url") or "").strip()
    campaign = f"isramarket-{year}-{month:02d}"
    tagged = []
    for index, post in enumerate(posts):
        item = dict(post)
        source = item.get("primary_outlet") or "instagram"
        content = f"p{index + 1}-{_slug(item.get('title') or '')}"
        utm = {
            "utm_source": source,
            "utm_medium": "organic",
            "utm_campaign": campaign,
            "utm_content": content,
        }
        item["utm"] = utm
        item["tracking_url"] = _with_query(website, utm) if website else ""
        item.setdefault("approval_status", "review")
        item.setdefault("published_url", "")
        item.setdefault("published_at", None)
        tagged.append(item)
    return tagged


def _with_query(url: str, params: dict) -> str:
    parsed = urlparse(url)
    existing = dict(parse_qsl(parsed.query, keep_blank_values=True))
    existing.update(params)
    return urlunparse(parsed._replace(query=urlencode(existing)))


def _write_posts_for_weeks(
    business: dict,
    usp: dict,
    core: dict,
    brand: dict,
    weeks: list[int],
    prior: dict | None = None,
) -> list[dict]:
    week_text = " ו".join(str(week) for week in weeks)
    prompt = f"""
כתוב 3 עד 4 פוסטים מוכנים לפרסום לשבועות {week_text} בלבד.
אל תמציא כיוון חדש. כל פוסט חייב לשרת את נושא החודש ואת אחד השבועות האלה.

עסק: {business}
שפת מותג: {brand}
USP: {usp}
תוכנית החודש: {core}
אירועים רלוונטיים: {core.get("relevant_events")}
שבועות לכתיבה: {weeks}

לכל פוסט חובה:
- פורמט reel / carousel / image / story
- title, angle, hook, caption, cta בעברית חדה
- cta חייב להיות קצר: 2 עד 4 מילים. הוא מודפס על הכרטיס הגרפי, לא בקפשן.
- why_now: משפט אחד לבעל העסק למה הפוסט הזה עכשיו
- image_prompt באנגלית לפי שפת העיצוב של האתר. בלי טקסט עברי בתוך התמונה.
- overlay_text עד 6 מילים בעברית — לכיתוב מעל התמונה באפליקציה, לא בתוך הפיקסלים
- primary_outlet, outlets, metrics_to_watch
- stat_highlight: מספר קונקרטי אחד שמופיע בחומר המקור (למשל "100 חלות כל שישי", "מהתנור ב-07:00") שיוצג גדול על הכרטיס. אם אין מספר אמיתי — החזר מחרוזת ריקה. אסור להמציא נתון.
- outlet_captions לאינסטגרם, פייסבוק ווואטסאפ
- טון האתר: {brand.get("voice")}
- מילים לשימוש: {brand.get("do_say")}
- מילים שאסור: {brand.get("dont_say")}
{prior_prompt_block(prior)}
אל תחזור על כותרות שכבר אושרו בחודש הקודם.
"""
    posts = loads(strategy_json(prompt, MONTHLY_POSTS_SCHEMA), {})
    items = posts.get("posts") or []
    if len(items) < 2:
        raise RuntimeError(f"Gemini החזיר פחות מדי פוסטים לשבועות {week_text}.")
    return items


def build_roadmap(business: dict, usp: dict, events: list[dict], plan: dict, brand: dict, prior: dict | None = None) -> dict:
    plan_prompt = f"""
בנה את כיוון החודש לעסק ישראלי קטן. בלי לכתוב את הפוסטים עצמם.
החודש הוא חודש אזרחי רגיל. חגים יהודיים וימי קניות ישראליים מופיעים כאירועים בתוך אותו חודש אזרחי.

פרטי העסק והאסטרטגיה:
עסק: {business}
USP והשערת צמיחה: {usp}
תמהיל פרסום: {plan}
אירועי החודש בישראל: {events}

חובה לבנות במדויק לפי הסכימה:
1. relevant_events: זהה מתוך אירועי החודש את המועדים הרלוונטיים ספציפית למוצרי העסק, הסבר למה זה קריטי, ודרג critical/high/medium.
2. long_horizon_plan: השערת צמיחה לרבעון, יעדים, ואבני דרך חודשיות.
3. monthly_horizon_plan: השערת החודש ויעדים לחודש.
4. management_and_checkpoints: איך המערכת מנהלת, ומתי צריך את בעל העסק.
5. weekly_breakdown לשבועות 1 עד 4: מיקוד, מה אנחנו עושים, מה צריך מהעסק, מה מודדים, ואיפה מפרסמים.
{prior_prompt_block(prior)}
"""
    core = loads(strategy_json(plan_prompt, PLAN_CORE_SCHEMA), {})
    if not core.get("theme") or not core.get("weekly_breakdown"):
        raise RuntimeError("Gemini לא החזיר תוכנית חודשית מלאה.")
    return core


def build_monthly_posts(business: dict, usp: dict, core: dict, brand: dict, prior: dict | None = None) -> list[dict]:
    early = _write_posts_for_weeks(business, usp, core, brand, [1, 2], prior=prior)
    late = _write_posts_for_weeks(business, usp, core, brand, [3, 4], prior=prior)
    items = early + late
    if len(items) < 4:
        raise RuntimeError("Gemini החזיר פחות מדי פוסטים לחודש. יש לייצר שוב את התוכנית.")
    return items


def rewrite_post(post: dict, tone: str, brand: dict) -> dict:
    tones_he = {
        "direct": "ישיר, חד, מכירתי, קורא לפעולה מיידית בוואטסאפ או באתר",
        "neighborhood": "שכונתי, חם, אישי, כאילו כתוב בפתק בכתב יד על הדלפק",
        "punchy": "קצרצר וקצבי, לא יותר מ-2 עד 3 משפטים חותכים",
        "holiday": "אווירת חג ישראלי, דחיפות סביב השולחן המשפחתי והכנות מוקדמות",
        "story": "סיפור קצר ואותנטי מאחורי הקלעים או מהעשייה היומית",
    }
    tone_desc = tones_he.get(tone, tone)
    prompt = f"""
שכתב את הפוסט הבא לסושיאל בסגנון: {tone_desc}.
השתמש בשפת המותג של העסק:
טון כללי: {brand.get("voice")}
מילים להשתמש בהן: {brand.get("do_say")}
מילים שאסור להשתמש בהן: {brand.get("dont_say")}

הפוסט המקורי:
כותרת: {post.get("title")}
משפט פתיחה (Hook): {post.get("hook")}
כיתוב: {post.get("caption")}
קריאה לפעולה (CTA): {post.get("cta")}
טקסט על התמונה: {post.get("overlay_text")}

ספק כותרת, Hook, כיתוב מלא (caption), CTA חד, טקסט קצרצר על התמונה (overlay_text), וגרסאות מותאמות לאינסטגרם, פייסבוק ווואטסאפ (outlet_captions).
"""
    return loads(lite_json(prompt, POST_REWRITE_SCHEMA, thinking_level="LOW"), {})


def generate_monthly_strategy(
    business: dict,
    year: int | None = None,
    month: int | None = None,
    scan: dict | None = None,
    state: dict | None = None,
    on_stage=None,
    one_stage: bool = False,
    prior: dict | None = None,
) -> dict:
    today = date.today()
    year = year or today.year
    month = month or today.month
    state = dict(state or {})
    stage = state.get("stage") or "scan"

    def mark(next_stage: str, **extra) -> None:
        state.update(extra)
        state["stage"] = next_stage
        state["year"] = year
        state["month"] = month
        if on_stage:
            on_stage(dict(state))

    def pack(*, complete: bool, core: dict, items: list[dict], usp: dict, competitors: list, events: list, plan: dict) -> dict:
        return {
            "year": year,
            "month": month,
            "scraped_profile": scraped_profile,
            "brand_language": brand,
            "competitors": competitors,
            "usp": usp,
            "calendar": events,
            "posting_plan": plan,
            "roadmap": {**core, "posts": items} if core else {"posts": items},
            "generate_state": state,
            "complete": complete,
        }

    if scan and scan.get("brand_language"):
        profile = scan.get("extracted") or {}
        brand = scan["brand_language"]
        scraped_profile = scan
    elif business.get("website_url"):
        scraped_profile = scan_website(business["website_url"])
        profile = scraped_profile["extracted"]
        brand = scraped_profile["brand_language"]
    else:
        raise RuntimeError("אין סריקת אתר שמורה ואין כתובת אתר. סרקו אתר או הזינו כתובת לפני בניית התוכנית.")

    if not business.get("name") and (profile.get("business_name") or brand.get("business_name")):
        business["name"] = profile.get("business_name") or brand.get("business_name")

    if stage in {"scan", "usp"}:
        mark("usp")
        competitor_profiles = []
        for competitor in business.get("competitors") or []:
            if not competitor.get("website_url"):
                competitor_profiles.append(
                    {"name": competitor.get("name"), "url": "", "positioning": "", "offers": []}
                )
                continue
            scraped = scrape_site(competitor["website_url"])
            competitor_profiles.append(extract_competitor(scraped, competitor["name"]))
        usp = build_usp(profile, competitor_profiles, business, brand, prior=prior)
        events = israeli_events_for_month(year, month)
        plan = posting_plan(int(business["monthly_budget_ils"]), business["primary_goal"])
        mark(
            "plan",
            usp=usp,
            competitors=competitor_profiles,
            calendar=events,
            posting_plan=plan,
        )
        if one_stage:
            return pack(complete=False, core={}, items=[], usp=usp, competitors=competitor_profiles, events=events, plan=plan)
    else:
        competitor_profiles = state.get("competitors") or []
        usp = state.get("usp") or {}
        events = state.get("calendar") or israeli_events_for_month(year, month)
        plan = state.get("posting_plan") or posting_plan(int(business["monthly_budget_ils"]), business["primary_goal"])

    if stage == "plan" or (stage in {"scan", "usp"} and not one_stage):
        core = build_roadmap(business, usp, events, plan, brand, prior=prior)
        mark("posts", roadmap_core=core)
        if one_stage:
            return pack(complete=False, core=core, items=[], usp=usp, competitors=competitor_profiles, events=events, plan=plan)
    else:
        core = state.get("roadmap_core") or {}
        if stage not in {"scan", "usp"} and not core.get("theme"):
            raise RuntimeError("חסרה תוכנית חודשית שמורה. יש לייצר את התוכנית מחדש.")

    if stage == "posts" or (stage in {"scan", "usp", "plan"} and not one_stage):
        early = _write_posts_for_weeks(business, usp, core, brand, [1, 2], prior=prior)
        mark("posts_late", posts_early=early)
        if one_stage:
            return pack(complete=False, core=core, items=early, usp=usp, competitors=competitor_profiles, events=events, plan=plan)
    else:
        early = state.get("posts_early") or []

    if stage == "posts_late" or (stage in {"scan", "usp", "plan", "posts"} and not one_stage):
        if stage == "posts_late" and len(early) < 2:
            raise RuntimeError("חסרים פוסטים לשבועות 1–2. יש לייצר את התוכנית מחדש.")
        late = _write_posts_for_weeks(business, usp, core, brand, [3, 4], prior=prior)
        items = attach_tracking(early + late, business, year, month)
        if len(items) < 4:
            raise RuntimeError("Gemini החזיר פחות מדי פוסטים לחודש. יש לייצר שוב את התוכנית.")
        mark("done", posts=items)
        return pack(complete=True, core=core, items=items, usp=usp, competitors=competitor_profiles, events=events, plan=plan)

    if stage == "done" and state.get("posts"):
        items = state["posts"]
        return pack(complete=True, core=core, items=items, usp=usp, competitors=competitor_profiles, events=events, plan=plan)

    raise RuntimeError(f"מצב יצירה לא מוכר: {stage}")
