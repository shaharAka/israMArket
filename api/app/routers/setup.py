"""The setup checklist: what is still missing, and which single thing to do next.

The wizard ends and the owner lands in an app that may be mostly empty — no audiences,
no media, no connected accounts — with nothing telling them what is missing. This
endpoint computes that from state we already store, so the UI can guide them.

Two rules govern everything here:

* **Never guess.** Every `done` is read from a real row or a real stored field. An empty
  table, a missing key or a blank string is *not* done. Reporting progress the owner does
  not have is worse than reporting none: it hides the work instead of guiding it.
* **No business is not an error.** A caller who has not finished the wizard has no
  business row yet. That request gets the full checklist with everything incomplete —
  the unfinished wizard is itself the first thing to fix — instead of a 404.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import Business, User
from app.services import ga4, journey, meta, plan_connections

router = APIRouter(prefix="/setup", tags=["setup"])

SETUP = "setup"
RUNNING = "running"
SETUP_TITLE = "פעם אחת, בהתחלה"
RUNNING_TITLE = "כל חודש"

# The order `next` walks when several items are still open. Ranked by what the owner
# actually gets out of doing it now, and defined separately from `groups` so the two are
# free to diverge — as it stands the ranking happens to coincide with the reading order,
# but the ranking is what governs `next`, not the listing:
#
#   1. scan -> diagnostics -> priorities -> quarter
#      The wizard's chain, and a real prerequisite chain: generation refuses to build
#      anything without the site reading, the diagnostics and the ranked targets are the
#      input to the quarter, and the quarter is the context the month is written against.
#      An owner who abandoned the wizard halfway should be sent back to the first missing
#      step, not to a side quest.
#   2. audiences -> media
#      The cheapest real improvement to the output: every post is addressed to a segment
#      and styled from the owner's own photos. Neither needs an external account, an
#      OAuth round-trip or a third party's permission, so the value lands immediately.
#   3. google -> instagram
#      Worth more in the long run (measurement, publishing) but they cost the owner a trip
#      outside the app and a login at another provider — more effort, so they rank below
#      the zero-friction wins rather than above them.
#   4. plan -> approve -> publish
#      Generation keeps its actual prerequisites. When a post already exists, its review
#      or publication takes priority over the unfinished setup above, as in /trial.
NEXT_ORDER = (
    "scan",
    "diagnostics",
    "priorities",
    "quarter",
    "audiences",
    "media",
    "google",
    "instagram",
    "whatsapp",
    "plan",
    "approve",
    "publish",
)
_RANK = {key: index for index, key in enumerate(NEXT_ORDER)}


def newest_business(db: Session, user: User) -> Business | None:
    """The business the rest of the app is scoped to: the caller's newest one."""
    return (
        db.query(Business).filter(Business.user_id == user.id).order_by(Business.id.desc()).first()
    )


def _item(key: str, title: str, why: str, action_href: str, action_label: str, done: bool) -> dict:
    return {
        "key": key,
        "title": title,
        "why": why,
        "done": bool(done),
        "action_href": action_href,
        "action_label": action_label,
    }


def _setup_items(facts: journey.Facts) -> list[dict]:
    items = [
        _item(
            "scan",
            title="קריאת האתר",
            why="מהאתר אנחנו לומדים את הצבעים, התמונות והסגנון שלכם. בלי זה הפוסטים ייצאו כלליים.",
            action_href="/decisions",
            action_label="לקרוא את האתר",
            done=facts.brand_scanned,
        ),
        _item(
            "diagnostics",
            title="כמה שאלות על העסק",
            why="לפי התשובות נבחר יעדים ופוסטים שמתאימים לעסק שלכם.",
            action_href="/decisions",
            action_label="לענות על השאלות",
            done=facts.diagnostics,
        ),
        _item(
            "priorities",
            title="היעדים שלכם",
            why="התוכנית של כל חודש נבנית סביב היעדים שבחרתם.",
            action_href="/decisions",
            action_label="לבחור יעדים",
            done=bool(facts.targets),
        ),
        _item(
            "quarter",
            title="הכיוון של התוכנית",
            why="הכיוון שמנחה את צעדי העבודה, ומשתנה לפי מה שלומדים.",
            action_href="/plan",
            action_label="לבנות את התוכנית",
            done=facts.long_horizon or bool(facts.quarter_plan),
        ),
        _item(
            "audiences",
            title="למי אתם פונים",
            why="כל פוסט ייכתב לקהל מסוים, ותראו את התוצאות לפי קהל.",
            action_href="/decisions#audiences",
            action_label="לבחור קהלים",
            done=facts.audiences,
        ),
        _item(
            "media",
            title="התמונות שלי",
            why="התמונות שלכם ישמשו בכל עיצוב, במקום תמונות מלאי גנריות.",
            action_href="/assets",
            action_label="להעלות תמונות",
            done=facts.asset_count > 0,
        ),
        _item(
            "google",
            title="חיבור נתוני האתר",
            why="רק כך רואים אילו פוסטים באמת הביאו אנשים לאתר, ומה הם עשו שם.",
            action_href="/integrations",
            action_label="לחבר את נתוני האתר",
            done="ga4" in facts.connected,
        ),
        _item(
            "instagram",
            title="חיבור אינסטגרם",
            why="כך נמדוד את הפוסטים, ובהמשך גם נפרסם אותם בלי שתעתיקו ידנית.",
            action_href="/integrations",
            action_label="לחבר את אינסטגרם",
            done="meta" in facts.connected,
        ),
    ]

    result = []
    for item in items:
        # /start already saved the first meeting and its proposed direction. These
        # legacy questions are a different form, not unfinished work for that owner.
        # Omit them rather than falsely claiming those exact fields were answered.
        if facts.from_start and item["key"] in {"diagnostics", "priorities"}:
            continue
        provider = {"google": "ga4", "instagram": "meta"}.get(item["key"])
        if provider:
            if not plan_connections.needed(facts, provider):
                continue
            available = ga4.ga4_configured() if provider == "ga4" else meta.meta_configured()
            connection = plan_connections.state(facts, provider, available=available)
            item.update(title=connection["title"], why=connection["why"],
                        action_label=connection["action"], done=connection["status"] == "done")
            if connection["status"] == "soon":
                item["status"] = "soon"
        result.append(item)
    if "whatsapp_link" in (plan_connections.keys(facts) or set()):
        result.append(_item("whatsapp", "קישור לוואטסאפ",
                            "נוכל למדוד לחיצות לפנייה אליכם. לחיצה אינה הודעה או לקוח.",
                            "/integrations", "להכין את הקישור",
                            bool(facts.business and facts.business.whatsapp_number_e164)))
    return result


def _running_items(facts: journey.Facts) -> list[dict]:
    posts = facts.posts
    return [
        _item(
            "plan",
            title="תוכנית החודש",
            why="כאן התוכנית הופכת לפוסטים של החודש, מוכנים לאישור.",
            action_href="/strategy",
            action_label="לבנות את החודש",
            done=bool(posts),
        ),
        _item(
            "approve",
            title="אישור הפוסטים",
            why="רק פוסטים מאושרים נכנסים לפרסום ולמדידה.",
            action_href="/posts",
            action_label="לאשר את הפוסטים",
            done=facts.all_approved,
        ),
        _item(
            "publish",
            title="סימון מה פורסם",
            why="כשאתם מסמנים את הקישור לפוסט שפורסם, אנחנו יכולים לקשר אותו לתוצאות.",
            action_href="/posts",
            action_label="לסמן מה פורסם",
            done=bool(facts.published_posts),
        ),
    ]


def groups_for(facts: journey.Facts) -> list[dict]:
    """The checklist, from the same facts the free month's journey reads (`/trial`)."""
    return [
        {"key": SETUP, "title": SETUP_TITLE, "items": _setup_items(facts)},
        {"key": RUNNING, "title": RUNNING_TITLE, "items": _running_items(facts)},
    ]


@router.get("")
def setup_checklist(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """What is done, what is missing, and the one thing to do now.

    `next` leads with existing first content, otherwise walks the setup ranking.
    Sources that cannot yet be connected are visible but excluded from the actionable
    count and next step. When nothing actionable is left, `next` is null.
    """
    business = newest_business(db, user)
    facts = journey.load(db, business)
    groups = groups_for(facts)
    items = [item for group in groups for item in group["items"] if item.get("status") != "soon"]
    pending = sorted(items, key=lambda item: _RANK.get(item["key"], len(NEXT_ORDER)))
    nxt = next((item for item in pending if not item["done"]), None)
    # The same first-content priority as /trial: unfinished connections do not prevent
    # reviewing or publishing a post that already exists. Never publish automatically.
    if facts.posts and not facts.published_posts:
        first = "publish" if facts.approved_posts else "approve"
        nxt = next((item for item in items if item["key"] == first and not item["done"]), nxt)
    return {
        "completed": sum(1 for item in items if item["done"]),
        "total": len(items),
        "next": (
            None
            if nxt is None
            else {
                field: nxt[field] for field in ("key", "title", "action_href", "action_label")
            }
        ),
        "groups": groups,
    }
