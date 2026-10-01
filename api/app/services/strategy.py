from concurrent.futures import ThreadPoolExecutor
from datetime import date
from urllib.parse import urlencode, urlparse, urlunparse, parse_qsl

from app.services.brand import extract_brand_language, public_scan
from app.services.audiences import (
    attach_audiences,
    post_audience_rule,
    prompt_block as audience_prompt_block,
)
from app.services.business_fields import field_label
from app.services.business_model import model_framing
from app.services.calendar_il import israeli_events_for_month, posting_plan
from app.services.gemini import extract_json, lite_json, strategy_json
from app.config import get_settings
from app.services.post_model_router import post_json
from app.services import google_cost
from app.services.hebrew_style import HEBREW_STYLE
from app.services.jsonutil import loads
from app.services.schemas_llm import (
    COMPETITOR_EXTRACT_SCHEMA,
    HYPOTHESES_SCHEMA,
    LONG_HORIZON_PLAN_SCHEMA,
    MONTHLY_POSTS_SCHEMA,
    PLAN_CORE_SCHEMA,
    POST_REWRITE_SCHEMA,
    SITE_EXTRACT_SCHEMA,
    TARGETS_SCHEMA,
    USP_SCHEMA,
)
from app.services.cost_model import plan_from_budget, prompt_block
from app.services import connected_posts, post_rewrite
from app.services.instagram_signal import attach_inspiration, prompt_block as instagram_prompt_block
from app.services.month_loop import prior_prompt_block
from app.services.scraper import _normalize_url, scrape_site
from app.services.screenshot import attach_screenshot, capture_site


def _business_brief(business: dict) -> dict:
    """The business dict without the audience catalogue.

    Audiences are injected as their own compact Hebrew block (see services/audiences.py),
    and so is the Instagram signal (services/instagram_signal.py). Leaving them inside the
    raw dict as well would print the same information twice and quietly grow every prompt.
    """
    own_blocks = {"audiences", "instagram_signal", "owner_context", "first_month_seed", "featured_items", "what_worked"}
    if not any(key in business for key in own_blocks):
        return business
    return {key: value for key, value in business.items() if key not in own_blocks}


def _owner_block(business: dict, include_idea: bool = False) -> str:
    """What the owner told us at /start, and the direction (and idea) they chose.

    Both keys are optional and additive: a business that never went through the v2
    onboarding has neither, and then this is an empty string and the prompt is unchanged.
    `first_month_seed` is only put in the payload by /onboarding/generate, so the chosen
    direction steers the first month and nothing after it.
    """
    if not business.get("owner_context") and not business.get("first_month_seed"):
        return ""
    from app.services.onboarding_draft import owner_context_block  # avoids an import cycle

    return owner_context_block(
        business.get("owner_context"), business.get("first_month_seed"), include_idea=include_idea
    )


def _featured_list(value) -> list | None:
    """A list of picks from either stored shape: the list itself, or what the picks
    screen saves (`PUT /business/featured-items`): {"items": [...], "saved_at": ...}."""
    if isinstance(value, dict):
        value = value.get("items")
    return value if isinstance(value, list) else None


def _featured_item(item):
    """A string stays a string; a dict gets its id and a Hebrew "why" (the reason key the
    picks screen stores, e.g. "best_seller", becomes "הכי נמכר", plus the owner's note)."""
    if isinstance(item, str):
        return item.strip() or None
    if not isinstance(item, dict):
        return None
    name = connected_posts.featured_name(item)
    if not name:
        return None
    raw_reason = str(item.get("reason") or "").strip()
    reason = connected_posts.FEATURED_REASONS_HE.get(raw_reason, raw_reason)
    why = str(item.get("why") or "").strip() or ", ".join(
        part for part in (reason, str(item.get("note") or "").strip()) if part
    )
    return {"id": connected_posts.featured_item_id(name), "name": name, "why": why}


def featured_items_from(stored: dict | None) -> list:
    """The products/services the owner chose to feature (Revision 8, week 2), or [].

    Read from the stored profile (`featured_items`) or from the /start answers
    (`owner_context.featured_items`); whichever the picks screen writes. The picks
    screen stores {"items": [...], "saved_at": ...}; a plain list is accepted too. Each
    item is a string or a dict (name / why / reason / note); anything else is ignored.
    """
    stored = stored or {}
    items = _featured_list(stored.get("featured_items"))
    if not items:
        context = stored.get("owner_context") if isinstance(stored.get("owner_context"), dict) else {}
        items = _featured_list(context.get("featured_items"))
    if not items:
        return []
    cleaned = [_featured_item(item) for item in items]
    return [item for item in cleaned if item][:12]


def _featured_block(business: dict) -> str:
    """The owner's product picks for the posts; "" when there are none (prompt unchanged)."""
    items = business.get("featured_items") or []
    if not items:
        return ""
    lines = []
    for index, item in enumerate(items, start=1):
        if isinstance(item, str):
            lines.append(f"{index}. {item.strip()}")
            continue
        name = str(item.get("name") or item.get("title") or "").strip()
        if not name:
            continue
        why = str(item.get("why") or item.get("reason") or item.get("note") or "").strip()
        lines.append(f"{index}. {name}" + (f": {why}" if why else ""))
    if not lines:
        return ""
    listed = "\n".join(lines)
    return f"""
המוצרים והשירותים שבעל העסק בחר להבליט, לפי הסדר שלו:
{listed}
הפוסטים מבליטים אותם, בסדר הזה ומהסיבות שבעל העסק נתן. אל תמציא מוצר שלא ברשימה ואל תבליט מוצר אחר במקומם.
"""


def _audience_block(business: dict, note: str = "") -> str:
    """The audience block plus the one instruction that applies to this prompt."""
    block = audience_prompt_block(business.get("audiences") or [])
    if not block:
        return ""
    return f"{block}\n{note}" if note else block


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
    return loads(extract_json(prompt, SITE_EXTRACT_SCHEMA, thinking_level="LOW"), {})


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
    # The rendered screenshot (when Chrome is available) runs beside the scrape; it is
    # guarded on its own (see services/screenshot.py) and None when it cannot be taken.
    pool = ThreadPoolExecutor(max_workers=1)
    try:
        shot = pool.submit(capture_site, _normalize_url(url))
        own = scrape_site(url)
        attach_screenshot(own, shot.result())
    finally:
        # A failed scrape answers at once; a running Chrome ends on its own deadline.
        pool.shutdown(wait=False)
    profile = extract_site_profile(own)
    brand = extract_brand_language(own)
    if not profile.get("business_name") and brand.get("business_name"):
        profile["business_name"] = brand["business_name"]
    return public_scan(own, profile, brand)


def propose_hypotheses(
    business: dict,
    brand: dict,
    profile: dict,
    diagnostics: dict | None = None,
    long_horizon: dict | None = None,
) -> list[dict]:
    context_block = ""
    if long_horizon:
        context_block = f"""
התוכנית הרבעונית שכבר אושרה על ידי בעל העסק:
{long_horizon}

כל השערה חייבת להיות צעד אפשרי *בתוך* התוכנית הרבעונית הזו. אל תציע כיוונים שמתחרים בה.
"""
    prompt = f"""
{model_framing(business.get("business_model"))}

הצע בדיוק שלוש השערות צמיחה שונות לבעל עסק ישראלי קטן.
כל השערה חייבת להיות משפט אחד: אם נעשה X נשיג Y בתוך זמן Z.
אל תבקש מהעסק לכתוב אסטרטגיה. תן לו לבחור כיוון.
התחשב באבחון (קלאב לקוחות, לקוחות חוזרים, ערוץ מועדף, תקרת תפעול) — הוא מגביל מה ריאלי.
{context_block}
עסק: {business}
שפת מותג: {brand}
פרופיל מהאתר: {profile}
אבחון: {diagnostics or {}}

{HEBREW_STYLE}
"""
    parsed = loads(strategy_json(prompt, HYPOTHESES_SCHEMA), {})
    items = parsed.get("hypotheses") or []
    if len(items) != 3:
        raise RuntimeError("לא קיבלנו שלוש השערות לבחירה. נסו שוב.")
    return items


def propose_targets(
    business: dict,
    brand: dict,
    profile: dict,
    diagnostics: dict | None = None,
) -> list[dict]:
    prompt = f"""
{model_framing(business.get("business_model"))}

הצע 5 עד 8 יעדי צמיחה אפשריים לבעל עסק ישראלי קטן, כדי שהוא ידרג אותם בעצמו.
כל יעד חייב להיות מדיד: מספר וטווח זמן. אם אין נתון אמיתי — נסח יעד שאפשר למדוד, ואל תמציא מדד קיים.
האבחון של העסק (קלאב לקוחות, לקוחות חוזרים, ערוץ מועדף, תקרת תפעול) הוא הקשר מחייב:
אם אין קלאב לקוחות — מותר להציע יעד שמתחיל אחד כזה.

חשוב: רבעון מכיל שלוש עדיפויות בלבד. בחר בדיוק שלושה יעדים שאתה ממליץ עליהם
ביותר לעסק הזה מתוך כל מה שהצעת, ודרג אותם 1, 2, 3 ב-recommended_rank
(1 = ההמלצה הראשונה). כל שאר היעדים מקבלים 0. הסבר כל המלצה ב-why_this.

החזר יעדים מסוגים שונים (מכירות, קהל, נאמנות, תפעול, נוכחות דיגיטלית) כדי שתהיה בחירה אמיתית.
אל תדרג את השאר — הסדר הסופי ייקבע על ידי בעל העסק.

עסק: {business}
שפת מותג: {brand}
פרופיל מהאתר: {profile}
אבחון: {diagnostics or {}}

{HEBREW_STYLE}
"""
    parsed = loads(strategy_json(prompt, TARGETS_SCHEMA), {})
    items = parsed.get("targets") or []
    if len(items) < 5:
        raise RuntimeError("לא קיבלנו מספיק יעדים לבחירה. נסו שוב.")
    return items


def build_long_horizon_plan(
    business: dict,
    brand: dict,
    profile: dict,
    ranked_targets: list[str],
    diagnostics: dict | None = None,
) -> dict:
    prompt = f"""
בנה אסטרטגיה ותוכנית עבודה מתמשכת לעסק ישראלי קטן. זו התוכנית שמסבירה לאן הולכים ומה יקרה בכל חודש.
אבני הדרך הן נקודת פתיחה; בכל בדיקה בוחרים איך ממשיכים לפי מה שלמדנו. אל תציג מסלול שמסתיים אחרי שלושה חודשים.
זו אינה התוכנית החודשית ואין לכתוב פוסטים.

בעל העסק דירג את יעדי הצמיחה מהחשוב לפחות חשוב. התוכנית חייבת לכבד את הסדר הזה —
היעד הראשון הוא המרכזי, והשאר נתמכים או נדחים לשלבים הבאים:
{ranked_targets}

מותר להציע יעד שהעסק עוד לא הציב, אבל רק אם הוא נובע ישירות מהאבחון (למשל אין קלאב לקוחות).
אל תמציא נתוני ביצוע, תקציב או מתחרים שלא נמסרו.

עסק: {business}
שפת מותג: {brand}
פרופיל מהאתר: {profile}
אבחון: {diagnostics or {}}

החזר הורייזון (למשל "הצעדים הקרובים"), השערת צמיחה אחת,
2 עד 4 יעדים מדידים, ושלוש אבני דרך — אחת לכל חודש, כל אחת עם נקודת בקרה.

{HEBREW_STYLE}
"""
    plan = loads(strategy_json(prompt, LONG_HORIZON_PLAN_SCHEMA), {})
    if not plan.get("hypothesis") or not plan.get("milestones"):
        raise RuntimeError("לא קיבלנו תוכנית מלאה. נסו שוב.")
    return plan


def build_usp(profile: dict, competitors: list[dict], business: dict, brand: dict, prior: dict | None = None) -> dict:
    prompt = f"""
{model_framing(business.get("business_model"))}
{_audience_block(business, "הבידול, המסרים ונקודות ההוכחה צריכים לעבוד עבור הקהל הראשי, ולתת מענה גם לשאר — בלי מסר שמדבר לכולם ולכן לאף אחד.")}
{_owner_block(business)}

בנה אסטרטגיה עסקית, בידול (USP), השערת צמיחה ושיטות עבודה מוכחות (BKMs) לעסק ישראלי.
שפת המותג והמסרים חייבים לצאת מהאתר והנכסים האמיתיים של העסק, לא משפת סוכנות.

פרטי העסק מהאשף:
שם: {business.get("name")}
סוג: {field_label(business.get("business_type"))}
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

{HEBREW_STYLE}
"""
    return loads(strategy_json(prompt, USP_SCHEMA), {})


def attach_tracking(posts: list[dict], business: dict, year: int, month: int) -> list[dict]:
    """UTM, tracking link, WhatsApp source key and measure for each post.

    docs/posts-v2.md: the codes come from the post's stable `uid` (`utm_content` =
    "p-{uid}", WhatsApp source key "ig-post-{uid}"), and are stored on the post, so
    editing its title or moving it never breaks matching. A post that already has a UTM
    content (written before uids: "p3-<title slug>") keeps it.
    """
    website = (business.get("website_url") or "").strip()
    campaign = f"isramarket-{year}-{month:02d}"
    tagged = []
    for post in posts:
        item = connected_posts.tracking_fields(dict(post), website, campaign, _with_query)
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


def posts_prompt(
    business: dict,
    usp: dict,
    core: dict,
    brand: dict,
    weeks: list[int],
    prior: dict | None = None,
    *,
    count_line: str = "",
    extra: str = "",
) -> str:
    """The post writer's prompt. One definition for the month and for the onboarding's
    sample posts (services/strategy_reveal.py), so a sample is what the product writes.

    `count_line` replaces the default "3 to 4 posts" line and `extra` is appended; both
    empty means the prompt is exactly what it always was.
    """
    week_text = " ו".join(str(week) for week in weeks)
    audience_note = (
        "כל פוסט משרת קהל אחד מהרשימה שלמעלה, והבחירה חייבת להשפיע על הזווית, ההוק והכיתוב — "
        "לא רק על התיוג. אל תמציא קהל שלא מופיע ברשימה."
    )
    # What Instagram actually showed for this business: own top posts, the month's
    # pattern brief, or an explicit "no data, claim nothing". Built by the router.
    instagram = business.get("instagram_signal")
    if len(weeks) == 1:
        count_line = count_line or f"כתוב 1 עד 2 פוסטים מוכנים לפרסום לשבוע {weeks[0]} בלבד."
    count_line = count_line or f"כתוב 3 עד 4 פוסטים מוכנים לפרסום לשבועות {week_text} בלבד."
    # docs/posts-v2.md: one post per channel the plan chose, and what worked so far.
    channels_line = connected_posts.plan_channels_line(core, weeks)
    worked = connected_posts.what_worked_block(business.get("what_worked"))
    prompt = f"""
{model_framing(business.get("business_model"))}
{_audience_block(business, audience_note)}
{_owner_block(business, include_idea=1 in weeks)}
{_featured_block(business)}

{count_line}
אל תמציא כיוון חדש. כל פוסט חייב לשרת את נושא החודש ואת אחד השבועות האלה.

עסק: {_business_brief(business)}
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
{post_audience_rule(business.get("audiences") or [])}
- image_prompt באנגלית לפי שפת העיצוב של האתר. בלי טקסט עברי בתוך התמונה.
- overlay_text עד 6 מילים בעברית — לכיתוב מעל התמונה באפליקציה, לא בתוך הפיקסלים
- outlets, metrics_to_watch
- stat_highlight: מספר קונקרטי אחד שמופיע בחומר המקור (למשל "100 חלות כל שישי", "מהתנור ב-07:00") שיוצג גדול על הכרטיס. אם אין מספר אמיתי — החזר מחרוזת ריקה. אסור להמציא נתון.
{connected_posts.prompt_rules()}
- טון האתר: {brand.get("voice")}
- מילים לשימוש: {brand.get("do_say")}
- מילים שאסור: {brand.get("dont_say")}
- inspiration_refs ו-inspiration_note: לפי בלוק האינסטגרם שלמטה בלבד
{channels_line}
{prior_prompt_block(prior)}
אל תחזור על כותרות שכבר אושרו בחודש הקודם.
{worked}

{HEBREW_STYLE}

{instagram_prompt_block(instagram)}
"""
    if extra:
        prompt = f"{prompt}\n{extra.strip()}\n"
    return prompt


def _write_posts_for_weeks(
    business: dict,
    usp: dict,
    core: dict,
    brand: dict,
    weeks: list[int],
    prior: dict | None = None,
) -> list[dict]:
    week_text = " ו".join(str(week) for week in weeks)
    instagram = business.get("instagram_signal")
    # Onboarding v2, revision 4: a first month seeded with the strategy the owner built at
    # /start. The cadence decides how many posts, the pillars what they are about, and
    # the sample posts the owner chose are the month's first posts, as they were shown.
    # Without that seed `plan` is None and this is the unchanged path.
    from app.services import strategy_reveal  # avoids an import cycle

    plan = strategy_reveal.seeded_posts_plan(business.get("first_month_seed"), weeks)
    schema = MONTHLY_POSTS_SCHEMA
    count_line = extra = ""
    if plan is not None:
        if plan["to_write"] <= 0:
            fixed = attach_audiences(plan["fixed"], business.get("audiences") or [])
            return connected_posts.finish_written(fixed, business, core)
        count_line, extra = plan["count_line"], plan["extra"]
        schema = strategy_reveal.SEEDED_POSTS_SCHEMA
    prompt = posts_prompt(business, usp, core, brand, weeks, prior, count_line=count_line, extra=extra)
    # POST_MODEL=gemini (the default) keeps the direct call, so nothing changes unless the
    # Muse Spark experiment is switched on (see services/post_model_router.py).
    writer = strategy_json if (get_settings().post_model or "gemini") == "gemini" else post_json
    posts = loads(writer(prompt, schema), {})
    items = posts.get("posts") or []
    needed = (1 if len(weeks) == 1 else 2) if plan is None else max(1, min(2, plan["to_write"]))
    if len(items) < needed:
        raise RuntimeError(f"קיבלנו פחות מדי פוסטים לשבועות {week_text}. נסו שוב.")
    # Refs the model cited are resolved to real posts; an invented ref is dropped, and a
    # post with no real source carries `inspiration: None` rather than a made-up reason.
    items = attach_inspiration(items, instagram)
    if plan is not None:
        items = plan["fixed"] + strategy_reveal.finish_seeded_posts(items, plan)
    # The model names a segment; only real segments exist. An unknown (or missing) name
    # falls back to the primary audience here, so a stored post can never carry a dangling
    # audience id — and a business with no audiences gets an empty field, not an invention.
    items = attach_audiences(items, business.get("audiences") or [])
    # docs/posts-v2.md: the post's uid, its one channel, its place in the plan, and the
    # mix type / featured item / owner fact / applied learning the writer named, checked.
    return connected_posts.finish_written(items, business, core)


def build_roadmap(
    business: dict,
    usp: dict,
    events: list[dict],
    plan: dict,
    brand: dict,
    prior: dict | None = None,
    long_horizon: dict | None = None,
) -> dict:
    cost_block = prompt_block(
        plan_from_budget(int(business.get('monthly_budget_ils') or 0), business.get('primary_goal') or 'sales')
    )
    # Search is offered as a real option, with the published Google ranges and the same
    # refusal to invent numbers. It stays small: enough to let the month plan decide
    # whether search suits this business, not a second strategy document.
    google_block = google_cost.prompt_block(google_cost.plan_for_business(business))
    # --- research hook (services/research.py) -------------------------------------------
    # The latest "what we learned" insights, each with its source and what it should
    # change. "" when the business has no recent research (or the payload has no "id"),
    # so the prompt is unchanged for them. Never raises.
    from app.services.research import research_prompt_block

    research_block = research_prompt_block(business)
    # --- end research hook ----------------------------------------------------------------
    approved_block = ""
    if long_horizon:
        approved_block = f"""
התוכנית הרבעונית שכבר אושרה על ידי בעל העסק. אסור לשנות אותה או להציע לה תחליף:
{long_horizon}

כתוב את monthly_horizon_plan כצעד החודשי הראשון בתוך התוכנית הרבעונית הזו, לא כתוכנית נפרדת.
"""
    plan_prompt = f"""
{model_framing(business.get("business_model"))}
{_audience_block(business, "כיוון החודש, האירועים והפוסטים צריכים לשרת את הקהלים האלה, עם דגש על הקהל הראשי. אל תמציא קהלים חדשים.")}
{_owner_block(business)}

בנה את כיוון החודש לעסק ישראלי קטן. בלי לכתוב את הפוסטים עצמם.
החודש הוא חודש אזרחי רגיל. חגים יהודיים וימי קניות ישראליים מופיעים כאירועים בתוך אותו חודש אזרחי.

פרטי העסק והאסטרטגיה:
עסק: {_business_brief(business)}
USP והשערת צמיחה: {usp}
תמהיל פרסום: {plan}

{cost_block}

{google_block}

{research_block}

אירועי החודש בישראל: {events}

חובה לבנות במדויק לפי הסכימה:
1. relevant_events: זהה מתוך אירועי החודש את המועדים הרלוונטיים ספציפית למוצרי העסק, הסבר למה זה קריטי, ודרג critical/high/medium.
2. long_horizon_plan: השערת צמיחה לרבעון, יעדים, ואבני דרך חודשיות.
3. monthly_horizon_plan: השערת החודש, יעדים לחודש, ו-goal_he: המטרה של החודש בשתיים עד חמש מילים (למשל "הזמנות מראש לחנוכה").
4. management_and_checkpoints: איך המערכת מנהלת, ומתי צריך את בעל העסק.
5. weekly_breakdown לשבועות 1 עד 4: מיקוד, מה אנחנו עושים, מה צריך מהעסק, מה מודדים, ואיפה מפרסמים.
{approved_block}{prior_prompt_block(prior)}

{HEBREW_STYLE}
"""
    core = loads(strategy_json(plan_prompt, PLAN_CORE_SCHEMA), {})
    if not core.get("theme") or not core.get("weekly_breakdown"):
        raise RuntimeError("לא קיבלנו תוכנית חודשית מלאה. נסו שוב.")
    if long_horizon:
        # The quarter plan is what the user read and approved during onboarding. The
        # month plan is generated afterwards and must never silently rewrite it.
        core["long_horizon_plan"] = long_horizon
    # The strategy the owner built at /start (if any): its weeks, measures and target
    # are what they approved, so the month plan carries them as they were shown.
    from app.services import strategy_reveal  # avoids an import cycle

    return strategy_reveal.apply_strategy_to_core(core, business.get("first_month_seed"))


def build_monthly_posts(business: dict, usp: dict, core: dict, brand: dict, prior: dict | None = None) -> list[dict]:
    early = _write_posts_for_weeks(business, usp, core, brand, [1, 2], prior=prior)
    late = _write_posts_for_weeks(business, usp, core, brand, [3, 4], prior=prior)
    items = early + late
    if len(items) < 4:
        raise RuntimeError("קיבלנו פחות מדי פוסטים לחודש. בנו את התוכנית שוב.")
    return items


def write_week_posts(business: dict, usp: dict, core: dict, brand: dict, week: int, prior: dict | None = None) -> list[dict]:
    """The posts of one week of a month whose structure already exists (Revision 8: the
    first month is built without posts; they are written when the owner is ready)."""
    return _write_posts_for_weeks(business, usp, core, brand, [week], prior=prior)


def month_from_state(state: dict, scan: dict, posts: list[dict] | None = None) -> dict:
    """The month (the shape `generate_monthly_strategy` returns when complete) from a saved
    generation state whose plan stages are done — with `posts` (possibly none) as its posts.

    The first month is stored this way once its structure exists: the USP, the calendar,
    the posting plan and the weeks (`roadmap_core`), and the posts only later.
    """
    core = state.get("roadmap_core") or {}
    if not core.get("theme"):
        raise RuntimeError("לא מצאנו את התוכנית של החודש. בנו אותה מחדש.")
    return {
        "year": state.get("year"),
        "month": state.get("month"),
        "scraped_profile": scan,
        "brand_language": (scan or {}).get("brand_language") or {},
        "competitors": state.get("competitors") or [],
        "usp": state.get("usp") or {},
        "calendar": state.get("calendar") or [],
        "posting_plan": state.get("posting_plan"),
        "roadmap": {**core, "posts": list(posts or [])},
        "generate_state": state,
        "complete": True,
    }


def _rewrite_context_block(context: dict | None) -> str:
    """The plan card and results of the post being rewritten, and what worked so far."""
    if not context:
        return ""
    lines = []
    link = context.get("plan_link") or {}
    if link.get("goal"):
        lines.append(f"- המטרה של החודש: {link['goal']}.")
    if link.get("week") and link.get("week_focus"):
        lines.append(f"- שבוע {link['week']} בתוכנית: {link['week_focus']}.")
    if context.get("why_line"):
        lines.append(f"- למה הפוסט הזה: {context['why_line']}")
    mix = connected_posts.mix_name(context.get("mix_type") or "", context.get("business_model") or "products")
    if mix:
        lines.append(f"- סוג הפוסט בתמהיל: {mix}. השכתוב נשאר מהסוג הזה.")
    featured = context.get("featured") if isinstance(context.get("featured"), dict) else {}
    if featured.get("name"):
        why = f" ({featured['why']})" if featured.get("why") else ""
        lines.append(f"- המוצר שבעל העסק בחר להבליט בפוסט: {featured['name']}{why}.")
    channel = connected_posts.CHANNEL_HE.get(context.get("channel") or "")
    if channel:
        lines.append(f"- הערוץ של הפוסט: {channel}. caption נכתב לערוץ הזה.")
    measure = context.get("measure") or {}
    if measure.get("label_he"):
        lines.append(f"- איך נדע אם הצליח: {measure['label_he']}. הקריאה לפעולה צריכה לשרת את זה.")
    results = context.get("results") or {}
    if results.get("value") is not None and measure.get("metric"):
        lines.append(f"- מה כבר נמדד בפוסט הזה: {connected_posts.count_he(measure['metric'], results['value'])}.")
    worked = connected_posts.what_worked_block(context.get("what_worked"))
    head = ("הפוסט הזה הוא צעד בתוכנית של החודש:\n" + "\n".join(lines)) if lines else ""
    facts = str(context.get("facts") or "")
    facts = ("עובדות ומחירים:\n" + facts) if facts else ""
    return "\n".join(part for part in (head, facts, worked) if part)


def rewrite_post(
    post: dict,
    tone: str | None,
    brand: dict,
    instagram: dict | None = None,
    context: dict | None = None,
    instruction: str = "",
) -> dict:
    """Rewrite one post by one instruction, or in a tone. `instagram` is
    `instagram_signal.signal_for(...)`.

    `instruction` (docs/posts-v2.md, Phase C) is the owner's one instruction: a chip's
    words ("קצר יותר") or their own (at most 200 characters); `services/post_rewrite`
    turns it into the writer's line. Without it, `tone` decides, as before.

    `context` (optional) is the post's plan card: {plan_link, why_line, mix_type,
    featured, channel, measure, results, what_worked, facts}. The rewrite keeps the
    post's place in the plan and may follow what worked; the caller checks
    `applied_learning` with connected_posts.informed_note, and the money with
    post_rewrite.guard.

    The result carries `inspiration` (resolved sources, or None) instead of the raw refs.
    """
    tones_he = {
        "direct": "ישיר, חד, מכירתי, קורא לפעולה מיידית בוואטסאפ או באתר",
        "neighborhood": "שכונתי, חם, אישי, כאילו כתוב בפתק בכתב יד על הדלפק",
        "punchy": "קצרצר וקצבי, לא יותר מ-2 עד 3 משפטים חותכים",
        "holiday": "אווירת חג ישראלי, דחיפות סביב השולחן המשפחתי והכנות מוקדמות",
        "story": "סיפור קצר ואותנטי מאחורי הקלעים או מהעשייה היומית",
    }
    if instruction:
        head = f"שכתב את הפוסט הבא לפי בקשה אחת של בעל העסק. {post_rewrite.guidance(instruction)}"
        if tone:
            head += f"\nהסגנון: {tones_he.get(tone, tone)}."
        head += "\nכל השאר נשאר: המסר, הקריאה לפעולה, הערוץ והעובדות."
    else:
        head = f"שכתב את הפוסט הבא לסושיאל בסגנון: {tones_he.get(tone or 'direct', tone or 'direct')}."
    prompt = f"""
{head}
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
שמור על הפורמט המקורי ({post.get("format")}). inspiration_refs ו-inspiration_note לפי בלוק האינסטגרם בלבד.
owner_fact: פרט שרק בעל העסק יודע ושהפוסט תלוי בו (מחיר, תאריך, שעות), בקצרה מה לבדוק. אל תמציא אותו בטקסט. אם אין — ריק.
applied_learning: מזהה מבלוק "מה הצליח אצלכם" אם השכתוב ממשיך דפוס שלו. אחרת ריק.
{_rewrite_context_block(context)}

{HEBREW_STYLE}

{instagram_prompt_block(instagram, rewrite=True)}
"""
    rewritten = loads(lite_json(prompt, POST_REWRITE_SCHEMA, thinking_level="LOW"), {})
    if not isinstance(rewritten, dict):
        return {}
    return attach_inspiration([rewritten], instagram)[0]


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
        raise RuntimeError("עוד לא קראנו את האתר, ואין כתובת אתר. הזינו את כתובת האתר לפני שבונים את התוכנית.")

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
        plan = posting_plan(
            int(business["monthly_budget_ils"]),
            business["primary_goal"],
            business.get("business_model", "products"),
        )
        # A cadence the owner chose at /start replaces the budget-derived one.
        from app.services import strategy_reveal  # avoids an import cycle

        plan = strategy_reveal.apply_cadence_to_posting_plan(plan, business.get("first_month_seed"))
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
        plan = state.get("posting_plan") or posting_plan(
            int(business["monthly_budget_ils"]),
            business["primary_goal"],
            business.get("business_model", "products"),
        )

    if stage == "plan" or (stage in {"scan", "usp"} and not one_stage):
        core = build_roadmap(
            business,
            usp,
            events,
            plan,
            brand,
            prior=prior,
            long_horizon=business.get("long_horizon_plan") or None,
        )
        mark("posts", roadmap_core=core)
        if one_stage:
            return pack(complete=False, core=core, items=[], usp=usp, competitors=competitor_profiles, events=events, plan=plan)
    else:
        core = state.get("roadmap_core") or {}
        if stage not in {"scan", "usp"} and not core.get("theme"):
            raise RuntimeError("לא מצאנו את התוכנית של החודש. בנו אותה מחדש.")

    if stage == "posts" or (stage in {"scan", "usp", "plan"} and not one_stage):
        early = _write_posts_for_weeks(business, usp, core, brand, [1, 2], prior=prior)
        mark("posts_late", posts_early=early)
        if one_stage:
            return pack(complete=False, core=core, items=early, usp=usp, competitors=competitor_profiles, events=events, plan=plan)
    else:
        early = state.get("posts_early") or []

    if stage == "posts_late" or (stage in {"scan", "usp", "plan", "posts"} and not one_stage):
        if stage == "posts_late" and len(early) < 2:
            raise RuntimeError("חסרים הפוסטים של השבועיים הראשונים. בנו את התוכנית מחדש.")
        late = _write_posts_for_weeks(business, usp, core, brand, [3, 4], prior=prior)
        # Re-attached here as well as at write time: on a resumed run the early posts come
        # back from the saved generation state, and the audience list may have changed
        # since. Whatever ends up stored points at a segment that exists right now.
        items = attach_audiences(
            attach_tracking(early + late, business, year, month), business.get("audiences") or []
        )
        if len(items) < 4:
            raise RuntimeError("קיבלנו פחות מדי פוסטים לחודש. בנו את התוכנית שוב.")
        mark("done", posts=items)
        return pack(complete=True, core=core, items=items, usp=usp, competitors=competitor_profiles, events=events, plan=plan)

    if stage == "done" and state.get("posts"):
        items = attach_audiences(state["posts"], business.get("audiences") or [])
        return pack(complete=True, core=core, items=items, usp=usp, competitors=competitor_profiles, events=events, plan=plan)

    raise RuntimeError(f"מצב יצירה לא מוכר: {stage}")
