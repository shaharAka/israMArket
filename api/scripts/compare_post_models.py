#!/usr/bin/env python
"""Blind side-by-side: the app's post-writing prompt, through Gemini and Muse Spark.

    cd api && .venv/bin/python scripts/compare_post_models.py --business-id 1

What it does:
1. Copies the SQLite DB (default: api/data/isramarket.db) into the run folder with the
   sqlite backup API and points the app at the *copy*. The original is opened read-only
   and never written.
2. Loads the business, its latest month plan (USP, month core, brand language) and its
   audiences — the same inputs `strategy._write_posts_for_weeks` gets in the app.
3. Calls that very function once per model, with `strategy.strategy_json` swapped (in
   memory only) for `post_model_router.write_posts_with(model, ...)`. So the prompt is
   byte-for-byte the one the app builds today, including whatever Stream D changes.
4. Writes `report.html` (posts shuffled, sides labelled A/B, no model names) and
   `key.json` (which side is which, prompts, raw output, timings) into
   .runtime/model-compare/<timestamp>/. Open the report, rate, and only then open the key.

Muse Spark runs first so a billing/key problem fails in seconds, before Gemini is paid for.
"""

from __future__ import annotations

import argparse
import copy
import html
import json
import os
import random
import re
import sqlite3
import sys
import time
from collections import Counter
from datetime import datetime
from pathlib import Path

API_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = API_DIR.parent
DEFAULT_DB = API_DIR / "data" / "isramarket.db"
DEFAULT_OUT = REPO_ROOT / ".runtime" / "model-compare"

# ---------------------------------------------------------------------------------
# Genericness checks. Pure functions (no app imports) so they are cheap to test.
# ---------------------------------------------------------------------------------

# Phrases that make a post sound like every other small-business post in the feed.
# Matched as substrings, so "בואו ל" also catches "בואו לטעום" / "בואו לבקר".
CLICHES = (
    "מחכים לכם",
    "מחכות לכם",
    "מחכה לכם",
    "בואו ל",
    "בואי ל",
    "אל תפספסו",
    "אל תפספסי",
    "אסור לפספס",
    "מהרו",
    "מהרי",
    "לזמן מוגבל",
    "עד גמר המלאי",
    "רק אצלנו",
    "במיוחד בשבילך",
    "במיוחד בשבילכם",
    "הזמן המושלם",
    "המתנה המושלמת",
    "פנקו את עצמכם",
    "פנקי את עצמך",
    "מגיע לך",
    "איכות ללא פשרות",
    "שירות אדיב",
    "חוויה בלתי נשכחת",
    "הכי שווה",
    "תייגו",
    "לינק בביו",
    "הקישור בביו",
    "מה אתם אומרים",
    "ספרו לנו בתגובות",
    "הצטרפו למשפחה",
)

# Openers that are a template rather than a hook.
TEMPLATE_OPENERS = (
    "מתי בפעם האחרונה",
    "מי לא אוהב",
    "מי לא אוהבת",
    "מחפשים",
    "מחפשת",
    "האם גם את",
    "האם גם אתם",
    "הגיע הזמן",
    "יש לנו חדשות",
)

HOOK_MAX_WORDS = 14
HOOK_MIN_WORDS = 3

_WORD = re.compile(r"[\w֐-׿'\"׳״%₪.-]+", re.UNICODE)
_NUMBER = re.compile(r"\d+(?:[.,]\d+)?")
_SPLIT_FACTS = re.compile(r"[,\n;•|/·]+|\s-\s|\sכמו\s")
_LATIN = re.compile(r"[A-Za-z]{3,}")
# Tokens too common in this domain to count as a concrete fact on their own.
_FACT_STOP = {
    "הנחה", "מבצע", "מוצרים", "שירות", "שירותים", "איכות", "איכותי", "איכותיים",
    "מובילים", "חדש", "חדשה", "ועוד", "בארץ", "ובעולם", "העולם", "מותגים",
}


def words(text: str) -> list[str]:
    return _WORD.findall(text or "")


def _clean_word(word: str) -> str:
    return word.strip(".,!?:;\"'׳״-…").strip()


def post_text(post: dict) -> str:
    parts = [post.get(key) or "" for key in ("title", "hook", "caption", "cta", "overlay_text", "stat_highlight")]
    return "\n".join(str(part) for part in parts)


def opener(post: dict, n: int = 2) -> str:
    tokens = [_clean_word(word) for word in words(post.get("hook") or "")]
    tokens = [token for token in tokens if token]
    return " ".join(tokens[:n])


def business_facts(business: dict, profile: dict, brand: dict) -> list[str]:
    """Concrete, checkable things about this business a specific post could mention."""
    raw: list[str] = [business.get("name") or "", business.get("location") or ""]
    raw += _SPLIT_FACTS.split(business.get("offerings") or "")
    for key in ("offers", "proof_points"):
        value = profile.get(key)
        items = value if isinstance(value, list) else [value or ""]
        for item in items:
            raw += _SPLIT_FACTS.split(str(item))
    offers_seen = brand.get("offers_seen")
    for item in offers_seen if isinstance(offers_seen, list) else []:
        raw += _SPLIT_FACTS.split(str(item))
    facts, seen = [], set()
    for item in raw:
        fact = item.strip(" .:-\"'()[]")
        # "כמו Triumph" -> keep the brand names; strip a leading comparison word.
        fact = re.sub(r"^(כמו|למשל)\s+", "", fact)
        fact = re.sub(r"\s+ועוד$", "", fact)
        if 2 <= len(fact) <= 60 and fact not in seen:
            seen.add(fact)
            facts.append(fact)
    return facts


def is_specific_fact(fact: str, business_name: str = "") -> bool:
    """A number, a named brand, or the business's own name — not a category word.

    "תחתונים" is a fact about a lingerie shop, but every lingerie shop can say it. "4 ב-100",
    "Triumph" or the shop's name are what make a post impossible to paste onto a competitor.
    """
    return bool(_NUMBER.search(fact) or _LATIN.search(fact) or (business_name and fact == business_name))


def _fact_hit(fact: str, text: str) -> bool:
    if fact in text:
        return True
    # Hebrew glues prefixes (ב/ל/ה/ו/מ/ש) onto words, and a phrase is rarely quoted
    # whole, so fall back to any distinctive token of the fact appearing in the post.
    tokens = [_clean_word(token) for token in words(fact)]
    distinctive = [token for token in tokens if len(token) >= 4 and token not in _FACT_STOP]
    if any(token in text for token in distinctive):
        return True
    return any(_NUMBER.fullmatch(token) and token in text for token in tokens if len(token) >= 2)


def source_numbers(*sources: object) -> set[str]:
    text = "\n".join(json.dumps(source, ensure_ascii=False) for source in sources)
    return set(_NUMBER.findall(text))


def check_post(
    post: dict,
    facts: list[str],
    known_numbers: set[str],
    brand_phrases: tuple[str, ...] = (),
    business_name: str = "",
) -> dict:
    text = post_text(post)
    hook = post.get("hook") or ""
    hook_words = len(words(hook))
    # A phrase the brand itself uses (its `do_say`) is voice, not cliché.
    cliches = [phrase for phrase in CLICHES if phrase in text and not any(phrase in own for own in brand_phrases)]
    template_opener = next((phrase for phrase in TEMPLATE_OPENERS if hook.strip().startswith(phrase)), "")
    facts_found = [fact for fact in facts if _fact_hit(fact, text)]
    specific_found = [fact for fact in facts_found if is_specific_fact(fact, business_name)]
    numbers = sorted(set(_NUMBER.findall(text)))
    # A number in the post that appears nowhere in the inputs is either a date/week
    # reference or an invented claim. Single digits are too ambiguous to flag.
    unknown_numbers = [number for number in numbers if number not in known_numbers and len(number) > 1]
    flags = []
    if cliches:
        flags.append("cliche")
    if template_opener:
        flags.append("template_opener")
    if hook_words > HOOK_MAX_WORDS:
        flags.append("hook_too_long")
    if hook_words < HOOK_MIN_WORDS:
        flags.append("hook_too_short")
    if not facts_found:
        flags.append("no_business_facts")
    elif not specific_found:
        flags.append("no_specific_fact")
    if unknown_numbers:
        flags.append("unsourced_numbers")
    return {
        "format": post.get("format") or "",
        "opener": opener(post),
        "template_opener": template_opener,
        "hook_words": hook_words,
        "cliches": cliches,
        "facts_found": facts_found,
        "specific_facts_found": specific_found,
        "numbers": numbers,
        "unsourced_numbers": unknown_numbers,
        "repeated_opener": False,
        "flags": flags,
    }


def check_set(
    posts: list[dict],
    facts: list[str],
    known_numbers: set[str],
    brand_phrases: tuple[str, ...] = (),
    business_name: str = "",
) -> dict:
    checks = [check_post(post, facts, known_numbers, brand_phrases, business_name) for post in posts]
    opener_counts = Counter(check["opener"] for check in checks if check["opener"])
    for check in checks:
        if check["opener"] and opener_counts[check["opener"]] > 1:
            check["repeated_opener"] = True
            check["flags"].append("repeated_opener")
    formats = Counter(check["format"] for check in checks)
    total = len(checks) or 1
    summary = {
        "posts": len(checks),
        "formats": dict(formats),
        "format_variety": round(len(formats) / total, 2) if checks else 0,
        "repeated_openers": sum(1 for check in checks if check["repeated_opener"]),
        "template_openers": sum(1 for check in checks if check["template_opener"]),
        "cliche_hits": sum(len(check["cliches"]) for check in checks),
        "posts_with_cliche": sum(1 for check in checks if check["cliches"]),
        "avg_hook_words": round(sum(check["hook_words"] for check in checks) / total, 1) if checks else 0,
        "hooks_too_long": sum(1 for check in checks if "hook_too_long" in check["flags"]),
        "posts_with_facts": sum(1 for check in checks if check["facts_found"]),
        "posts_with_specific_facts": sum(1 for check in checks if check["specific_facts_found"]),
        "unsourced_numbers": sum(len(check["unsourced_numbers"]) for check in checks),
    }
    return {"checks": checks, "summary": summary}


# ---------------------------------------------------------------------------------
# DB copy and app bootstrap
# ---------------------------------------------------------------------------------


def copy_db(source: Path, target: Path) -> Path:
    source = source.resolve()
    target = target.resolve()
    if source == target:
        raise SystemExit("Refusing to use the original DB as the working copy.")
    if not source.exists():
        raise SystemExit(f"DB not found: {source}. Pass --db /path/to/isramarket.db")
    target.parent.mkdir(parents=True, exist_ok=True)
    src = sqlite3.connect(f"file:{source}?mode=ro", uri=True)
    dst = sqlite3.connect(target)
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()
    return target


def bootstrap_app(db_copy: Path) -> None:
    """Point the app at the copy. Must run before anything under `app` is imported."""
    if "app" in sys.modules or any(name.startswith("app.") for name in sys.modules):
        raise RuntimeError("bootstrap_app must run before importing the app")
    os.environ["DATABASE_URL"] = f"sqlite:///{db_copy}"
    os.chdir(API_DIR)  # config.py reads ".env" / "../.env" relative to the cwd
    if str(API_DIR) not in sys.path:
        sys.path.insert(0, str(API_DIR))


def load_inputs(business_id: int | None, year: int | None, month: int | None) -> dict:
    from app.db import SessionLocal
    from app.models import Business, Strategy
    from app.services.audiences import catalogue_for
    from app.services.jsonutil import loads

    db = SessionLocal()
    try:
        query = db.query(Business)
        business = query.filter(Business.id == business_id).first() if business_id else query.order_by(Business.id).first()
        if not business:
            raise SystemExit(f"No business with id {business_id} in the DB copy.")
        strategies = db.query(Strategy).filter(Strategy.business_id == business.id)
        if year and month:
            strategies = strategies.filter(Strategy.year == year, Strategy.month == month)
        strategy_row = strategies.order_by(Strategy.year.desc(), Strategy.month.desc()).first()
        if not strategy_row:
            raise SystemExit(f"Business {business.id} has no saved month plan to write posts against.")

        stored = loads(business.scraped_profile_json, {}) or {}
        extra = loads(strategy_row.roadmap_json, {}) or {}
        roadmap = extra.get("roadmap") or {}
        # Same payload shape as routers/onboarding.py builds for generate_monthly_strategy.
        payload = {
            "name": business.name,
            "website_url": business.website_url,
            "business_type": business.business_type,
            "offerings": business.offerings,
            "location": business.location,
            "presence_type": business.presence_type,
            "social_links": loads(business.social_links_json, {}),
            "monthly_budget_ils": business.monthly_budget_ils,
            "competitors": loads(business.competitors_json, []),
            "primary_goal": business.primary_goal,
            "business_model": business.business_model or "products",
            "growth_hypothesis": stored.get("growth_hypothesis", ""),
            "growth_targets": stored.get("growth_targets", []),
            "diagnostics": stored.get("diagnostics") or {},
            "long_horizon_plan": stored.get("long_horizon_plan") or None,
            "audiences": catalogue_for(db, business),
        }
        return {
            "business_id": business.id,
            "year": strategy_row.year,
            "month": strategy_row.month,
            "business": payload,
            "usp": loads(strategy_row.usp_json, {}) or {},
            "core": {key: value for key, value in roadmap.items() if key != "posts"},
            "brand": stored.get("brand_language") or extra.get("brand_language") or {},
            "profile": stored.get("extracted") or {},
            "stored_posts": roadmap.get("posts") or [],
        }
    finally:
        db.close()


def run_model(model_name: str, inputs: dict, week_groups: list[list[int]]) -> dict:
    """Run the app's own post writer with its model call routed to `model_name`."""
    from unittest import mock

    from app.services import meta_model, strategy
    from app.services.post_model_router import write_posts_with

    prompts: list[str] = []
    posts: list[dict] = []
    errors: list[str] = []

    def routed(prompt: str, schema: dict) -> str:
        prompts.append(prompt)
        return write_posts_with(model_name, prompt, schema)

    started = time.monotonic()
    with mock.patch.object(strategy, "strategy_json", routed):
        for weeks in week_groups:
            try:
                posts += strategy._write_posts_for_weeks(
                    copy.deepcopy(inputs["business"]),
                    inputs["usp"],
                    inputs["core"],
                    inputs["brand"],
                    weeks,
                    prior=None,
                )
            except (meta_model.BillingNotConfigured, meta_model.MissingApiKey, meta_model.ContributorModelRefused):
                raise
            except Exception as exc:  # one failed week-pair should not sink the run
                errors.append(f"weeks {weeks}: {type(exc).__name__}: {exc}")
    return {"posts": posts, "prompts": prompts, "errors": errors, "seconds": round(time.monotonic() - started, 1)}


def model_label(model_name: str) -> str:
    from app.config import get_settings

    settings = get_settings()
    if model_name == "gemini":
        return f"gemini ({settings.gemini_strategy_model})"
    if model_name == "muse-spark":
        return f"muse-spark ({settings.meta_post_model})"
    return model_name


# ---------------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------------

_FLAG_HE = {
    "cliche": "קלישאה",
    "template_opener": "פתיח תבניתי",
    "hook_too_long": "הוק ארוך",
    "hook_too_short": "הוק קצר מדי",
    "no_business_facts": "לא מוזכר שום דבר מהעסק",
    "no_specific_fact": "רק מילים כלליות — אין מספר, מותג או שם העסק",
    "unsourced_numbers": "מספר שלא מופיע בחומר המקור",
    "repeated_opener": "פתיח חוזר",
}


def _e(value: object) -> str:
    return html.escape(str(value or ""))


def _post_card(post: dict, check: dict, side: str, index: int) -> str:
    outlets = post.get("outlet_captions") or {}
    outlet_html = "".join(
        f"<p><b>{_e(name)}</b><br>{_e(text)}</p>" for name, text in outlets.items() if text
    )
    chips = "".join(f'<span class="chip warn">{_e(_FLAG_HE.get(flag, flag))}</span>' for flag in check["flags"])
    detail_rows = [
        ("פתיח", check["opener"]),
        ("מילים בהוק", check["hook_words"]),
        ("קלישאות", ", ".join(check["cliches"]) or "—"),
        ("פרטי עסק שהוזכרו", ", ".join(check["facts_found"]) or "—"),
        ("מתוכם ספציפיים", ", ".join(check["specific_facts_found"]) or "—"),
        ("מספרים", ", ".join(check["numbers"]) or "—"),
        ("מספרים בלי מקור", ", ".join(check["unsourced_numbers"]) or "—"),
    ]
    details = "".join(f"<tr><th>{_e(k)}</th><td>{_e(v)}</td></tr>" for k, v in detail_rows)
    post_id = f"{side}{index + 1}"
    return f"""
<article class="post" id="{post_id}">
  <header><span class="id">{post_id}</span><span class="chip">{_e(post.get("format"))}</span>
    <span class="chip muted">שבוע {_e(post.get("week"))}</span></header>
  <h3>{_e(post.get("title"))}</h3>
  <p class="hook">{_e(post.get("hook"))}</p>
  <p class="caption">{_e(post.get("caption"))}</p>
  <p class="meta"><b>CTA:</b> {_e(post.get("cta"))} · <b>על התמונה:</b> {_e(post.get("overlay_text"))}
    {"· <b>מספר:</b> " + _e(post.get("stat_highlight")) if post.get("stat_highlight") else ""}</p>
  <p class="meta"><b>למה עכשיו:</b> {_e(post.get("why_now"))}</p>
  <details><summary>גרסאות לערוצים</summary>{outlet_html or "<p>—</p>"}</details>
  <details class="checks"><summary>בדיקות גנריות (אחרי הדירוג)</summary><div>{chips}</div><table>{details}</table></details>
  <label class="rate">הייתי מפרסם/ת:
    <select data-post="{post_id}">
      <option value="">—</option><option value="as_is">כמו שזה</option>
      <option value="small_edit">עם תיקון קטן</option><option value="rewrite">צריך שכתוב</option>
      <option value="no">לא</option>
    </select>
  </label>
</article>"""


def _summary_table(sides: dict) -> str:
    rows = [
        ("פוסטים", "posts"),
        ("גיוון פורמטים (סוגים/פוסטים)", "format_variety"),
        ("פורמטים", "formats"),
        ("פתיחים חוזרים", "repeated_openers"),
        ("פתיחים תבניתיים", "template_openers"),
        ("פוסטים עם קלישאה", "posts_with_cliche"),
        ("סך קלישאות", "cliche_hits"),
        ("ממוצע מילים בהוק", "avg_hook_words"),
        (f"הוקים מעל {HOOK_MAX_WORDS} מילים", "hooks_too_long"),
        ("פוסטים שמזכירים משהו מהעסק", "posts_with_facts"),
        ("פוסטים עם פרט ספציפי (מספר/מותג/שם)", "posts_with_specific_facts"),
        ("מספרים בלי מקור", "unsourced_numbers"),
    ]
    head = "".join(f"<th>{label}</th>" for label in sides)
    body = ""
    for title, key in rows:
        cells = ""
        for label in sides:
            value = sides[label]["summary"].get(key, "")
            if isinstance(value, dict):
                value = ", ".join(f"{k}×{v}" for k, v in value.items())
            cells += f"<td>{_e(value)}</td>"
        body += f"<tr><th>{_e(title)}</th>{cells}</tr>"
    return f"<table class='summary'><tr><th></th>{head}</tr>{body}</table>"


def render_report(run_id: str, business_name: str, sides: dict) -> str:
    columns = ""
    for label, side in sides.items():
        cards = "".join(_post_card(post, check, label, i) for i, (post, check) in enumerate(side["items"]))
        failed = (
            f"<p class='warn'>צד {label}: חלק מהקריאות נכשלו ({len(side['errors'])}). הפרטים בקובץ המפתח.</p>"
            if side["errors"]
            else ""
        )
        columns += f"<section class='col'><h2>צד {label}</h2>{failed}{cards or '<p>אין פוסטים.</p>'}</section>"
    return f"""<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>השוואה עיוורת {run_id}</title>
<style>
:root {{ --bg:#f6f5f2; --card:#fff; --ink:#1d1d1f; --muted:#6b6b70; --line:#e2e0da; --warn:#b3261e; --chip:#eeece6; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg:#141416; --card:#1e1e22; --ink:#ecebe8; --muted:#a09fa6; --line:#33333a; --warn:#ff8a80; --chip:#2a2a30; }} }}
* {{ box-sizing:border-box; }}
body {{ margin:0; padding:24px 16px 64px; background:var(--bg); color:var(--ink); font:16px/1.55 system-ui,-apple-system,"Segoe UI",Arial,sans-serif; }}
main {{ max-width:1280px; margin:0 auto; }}
h1 {{ font-size:22px; margin:0 0 4px; }} .lede {{ color:var(--muted); margin:0 0 20px; }}
.grid {{ display:grid; grid-template-columns:1fr 1fr; gap:20px; }}
@media (max-width:820px) {{ .grid {{ grid-template-columns:1fr; }} }}
.col h2 {{ font-size:18px; position:sticky; top:0; background:var(--bg); padding:8px 0; margin:0; z-index:1; }}
.post {{ background:var(--card); border:1px solid var(--line); border-radius:12px; padding:16px; margin:12px 0; }}
.post header {{ display:flex; gap:8px; align-items:center; }} .id {{ font-weight:700; }}
.post h3 {{ margin:8px 0 4px; font-size:17px; }} .hook {{ font-weight:600; margin:4px 0; }}
.caption {{ white-space:pre-wrap; margin:4px 0 8px; }} .meta {{ color:var(--muted); font-size:14px; margin:4px 0; }}
.chip {{ display:inline-block; background:var(--chip); border-radius:999px; padding:1px 10px; font-size:13px; margin:2px; }}
.chip.warn, .warn {{ color:var(--warn); }} .chip.muted {{ color:var(--muted); }}
details {{ margin:8px 0; font-size:14px; }} summary {{ cursor:pointer; color:var(--muted); }}
table {{ border-collapse:collapse; width:100%; font-size:14px; }} th, td {{ text-align:start; padding:4px 6px; border-bottom:1px solid var(--line); vertical-align:top; }}
.summary {{ max-width:640px; }} .rate {{ display:block; margin-top:8px; font-size:14px; }}
select, textarea, button {{ font:inherit; color:inherit; background:var(--card); border:1px solid var(--line); border-radius:8px; padding:4px 8px; }}
.verdict {{ background:var(--card); border:1px solid var(--line); border-radius:12px; padding:16px; margin:24px 0; }}
textarea {{ width:100%; min-height:80px; }}
</style></head><body><main>
<h1>השוואה עיוורת: אותו פרומפט, שני מודלים</h1>
<p class="lede">{_e(business_name)} · ריצה {run_id}. הצדדים ממוינים אקראית. אל תפתחו את key.json לפני שסיימתם לדרג.</p>
<div class="grid">{columns}</div>
<section class="verdict">
  <h2>הכרעה</h2>
  <p>איזה צד פחות גנרי ויותר "נשמע כמו העסק"?
    <label><input type="radio" name="pref" value="A"> A</label>
    <label><input type="radio" name="pref" value="B"> B</label>
    <label><input type="radio" name="pref" value="same"> אין הבדל</label></p>
  <textarea id="notes" placeholder="הערות חופשיות"></textarea>
  <p><button id="copy">העתקת הדירוג (JSON)</button> <span id="copied" class="meta"></span></p>
</section>
<details><summary>סיכום הבדיקות האוטומטיות (אחרי הדירוג)</summary>{_summary_table(sides)}</details>
</main>
<script>
const KEY = "model-compare-{run_id}";
function state() {{
  const ratings = {{}};
  document.querySelectorAll("select[data-post]").forEach(s => {{ if (s.value) ratings[s.dataset.post] = s.value; }});
  const pref = document.querySelector("input[name=pref]:checked");
  return {{ run: "{run_id}", ratings, preference: pref ? pref.value : "", notes: document.getElementById("notes").value }};
}}
function save() {{ try {{ localStorage.setItem(KEY, JSON.stringify(state())); }} catch (e) {{}} }}
try {{
  const saved = JSON.parse(localStorage.getItem(KEY) || "null");
  if (saved) {{
    Object.entries(saved.ratings || {{}}).forEach(([id, v]) => {{ const s = document.querySelector(`select[data-post="${{id}}"]`); if (s) s.value = v; }});
    if (saved.preference) {{ const r = document.querySelector(`input[name=pref][value="${{saved.preference}}"]`); if (r) r.checked = true; }}
    document.getElementById("notes").value = saved.notes || "";
  }}
}} catch (e) {{}}
document.addEventListener("change", save); document.getElementById("notes").addEventListener("input", save);
document.getElementById("copy").addEventListener("click", async () => {{
  const text = JSON.stringify(state(), null, 2);
  try {{ await navigator.clipboard.writeText(text); document.getElementById("copied").textContent = "הועתק"; }}
  catch (e) {{ window.prompt("העתיקו:", text); }}
}});
</script></body></html>"""


# ---------------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------------


def _parse_weeks(raw: str) -> list[list[int]]:
    groups = []
    for chunk in raw.split(";"):
        weeks = [int(part) for part in chunk.split(",") if part.strip()]
        if weeks:
            groups.append(weeks)
    return groups


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--business-id", type=int, default=None, help="default: the first business in the DB")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB, help=f"source DB, never written (default {DEFAULT_DB})")
    parser.add_argument("--year", type=int, default=None)
    parser.add_argument("--month", type=int, default=None, help="with --year: which saved month plan to use")
    parser.add_argument("--weeks", default="1,2;3,4", help='week pairs, as the app writes them (default "1,2;3,4")')
    parser.add_argument("--muse-model", default=None, help="override META_POST_MODEL, e.g. muse-spark-1.2")
    parser.add_argument(
        "--gemini-source",
        choices=("live", "stored"),
        default="live",
        help="live: call Gemini now. stored: use the posts already saved in the DB for this month",
    )
    parser.add_argument("--seed", type=int, default=None, help="shuffle seed (default: random)")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--dry-run", action="store_true", help="print the prompt the app would send, call nothing")
    parser.add_argument("--keep-db-copy", action="store_true", help="keep the DB copy in the run folder afterwards")
    args = parser.parse_args(argv)

    run_id = datetime.now().strftime("%Y%m%d-%H%M%S")
    run_dir = args.out / run_id
    db_copy = copy_db(args.db, run_dir / "db-copy.sqlite")
    if args.muse_model:
        os.environ["META_POST_MODEL"] = args.muse_model
    bootstrap_app(db_copy)
    try:
        return _compare(args, run_id, run_dir)
    finally:
        # The copy holds every user's data (password hashes included); it is only
        # needed while the run reads it, so it does not pile up in .runtime/.
        if not args.keep_db_copy:
            db_copy.unlink(missing_ok=True)
            try:
                run_dir.rmdir()  # only succeeds when nothing else was written
            except OSError:
                pass


def _compare(args: argparse.Namespace, run_id: str, run_dir: Path) -> int:
    from app.services import meta_model

    inputs = load_inputs(args.business_id, args.year, args.month)
    week_groups = _parse_weeks(args.weeks)
    print(f"business {inputs['business_id']} ({inputs['business'].get('name')}), plan {inputs['year']}-{inputs['month']:02d}")

    if args.dry_run:
        captured = run_model_dry(inputs, week_groups)
        for prompt in captured:
            print("=" * 80)
            print(prompt)
        return 0

    results: dict[str, dict] = {}
    try:
        # Muse first: a billing or key problem surfaces before any Gemini spend.
        print("running muse-spark ...", flush=True)
        results["muse-spark"] = run_model("muse-spark", inputs, week_groups)
    except meta_model.BillingNotConfigured as exc:
        print(f"\n{exc}\n", file=sys.stderr)
        return 2
    except (meta_model.MissingApiKey, meta_model.ContributorModelRefused) as exc:
        print(f"\n{exc}\n", file=sys.stderr)
        return 2

    if args.gemini_source == "stored":
        wanted = {week for group in week_groups for week in group}
        stored = [post for post in inputs["stored_posts"] if int(post.get("week") or 0) in wanted]
        results["gemini"] = {"posts": stored, "prompts": [], "errors": [], "seconds": 0, "source": "stored"}
    else:
        print("running gemini ...", flush=True)
        results["gemini"] = run_model("gemini", inputs, week_groups)

    facts = business_facts(inputs["business"], inputs["profile"], inputs["brand"])
    known = source_numbers(
        {key: value for key, value in inputs["business"].items() if key != "audiences"},
        inputs["business"].get("audiences"),
        inputs["usp"],
        inputs["core"],
        inputs["brand"],
        inputs["profile"],
    )

    do_say = inputs["brand"].get("do_say")
    brand_phrases = tuple(str(item) for item in do_say) if isinstance(do_say, list) else ()

    rng = random.Random(args.seed)
    models = list(results)
    rng.shuffle(models)
    sides, key = {}, {"run": run_id, "seed": args.seed, "sides": {}, "facts_checked": facts}
    for label, model_name in zip(("A", "B"), models):
        result = results[model_name]
        checked = check_set(result["posts"], facts, known, brand_phrases, inputs["business"].get("name") or "")
        items = list(zip(result["posts"], checked["checks"]))
        rng.shuffle(items)
        sides[label] = {"items": items, "summary": checked["summary"], "errors": result["errors"]}
        key["sides"][label] = {
            "model": model_label(model_name),
            "source": result.get("source", "live"),
            "seconds": result["seconds"],
            "errors": result["errors"],
            "summary": checked["summary"],
            "order_in_report": [post.get("title") for post, _ in items],
            "prompts": result["prompts"],
            "raw_posts": result["posts"],
        }
        print(f"side {label}: {len(result['posts'])} posts, {len(result['errors'])} errors")

    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "report.html").write_text(render_report(run_id, inputs["business"].get("name") or "", sides), encoding="utf-8")
    (run_dir / "key.json").write_text(json.dumps(key, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nreport: {run_dir / 'report.html'}\nkey (open after rating): {run_dir / 'key.json'}")
    return 0


def run_model_dry(inputs: dict, week_groups: list[list[int]]) -> list[str]:
    """Capture the prompts without calling any model."""
    from unittest import mock

    from app.services import strategy

    prompts: list[str] = []

    def capture(prompt: str, schema: dict) -> str:
        prompts.append(prompt)
        return json.dumps({"posts": [{"title": "dry-run"}, {"title": "dry-run"}]})

    with mock.patch.object(strategy, "strategy_json", capture):
        for weeks in week_groups:
            strategy._write_posts_for_weeks(
                copy.deepcopy(inputs["business"]), inputs["usp"], inputs["core"], inputs["brand"], weeks, prior=None
            )
    return prompts


if __name__ == "__main__":
    sys.exit(main())
