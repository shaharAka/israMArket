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

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import Asset, Audience, Business, Integration, User
from app.routers.strategy import _active_strategy
from app.services.jsonutil import loads

router = APIRouter(prefix="/setup", tags=["setup"])

# The only status that means "this account is wired up". `pending`, `select_property`
# and `select_page` are all mid-OAuth states where nothing can be read or published yet.
CONNECTED = "connected"

SETUP = "setup"
RUNNING = "running"
SETUP_TITLE = "הגדרה חד-פעמית"
RUNNING_TITLE = "הרצה שוטפת"

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
#      The recurring loop. It only becomes the right thing to do once the one-time setup
#      that shapes the output exists, and it must be walked in this order: a month has to
#      be generated before it can be approved, and approved before it is published.
NEXT_ORDER = (
    "scan",
    "diagnostics",
    "priorities",
    "quarter",
    "audiences",
    "media",
    "google",
    "instagram",
    "plan",
    "approve",
    "publish",
)
_RANK = {key: index for index, key in enumerate(NEXT_ORDER)}


def _newest_business(db: Session, user: User) -> Business | None:
    """The business the rest of the app is scoped to: the caller's newest one."""
    return (
        db.query(Business).filter(Business.user_id == user.id).order_by(Business.id.desc()).first()
    )


def _filled(value) -> bool:
    """Whether a stored value actually carries something.

    Blank strings and empty containers do not count. The wizard saves models as-is, so an
    untouched field arrives as `None`, `""` or `[]` — treating any of those as an answer
    would mark the item done for a business that answered nothing.
    """
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    return bool(value)


def _stored(business: Business | None) -> dict:
    stored = loads(business.scraped_profile_json, {}) if business else {}
    return stored if isinstance(stored, dict) else {}


def _has_rows(db: Session, model, business_id: int | None) -> bool:
    """Whether this business owns at least one row of `model`."""
    if business_id is None:
        return False
    return db.query(model.id).filter(model.business_id == business_id).first() is not None


def _connected_providers(db: Session, business: Business | None) -> set[str]:
    if business is None:
        return set()
    rows = (
        db.query(Integration.provider)
        .filter(Integration.business_id == business.id, Integration.status == CONNECTED)
        .all()
    )
    return {row[0] for row in rows}


def _posts(db: Session, business: Business | None) -> list[dict]:
    """The posts of the strategy the rest of the app treats as current.

    Resolved through the same `_active_strategy` helper `/posts` and `/performance` use,
    so the checklist can never point at a page that disagrees with it. "No strategy yet"
    is simply no posts, never an error.
    """
    if business is None:
        return []
    try:
        strategy = _active_strategy(db, business)
    except HTTPException:
        return []
    extra = loads(strategy.roadmap_json, {})
    if not isinstance(extra, dict):
        return []
    roadmap = extra.get("roadmap")
    raw = roadmap.get("posts") if isinstance(roadmap, dict) else None
    if not isinstance(raw, list):
        return []
    # Only well-formed post objects count. A malformed entry must not be able to make the
    # strategy look approved or published.
    return [item for item in raw if isinstance(item, dict)]


def _has_answers(diagnostics) -> bool:
    """At least one diagnostic field that was actually answered."""
    if not isinstance(diagnostics, dict):
        return False
    return any(_filled(value) for value in diagnostics.values())


def _ranked_targets(value) -> list[str]:
    """The ranked growth targets, blank entries dropped."""
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def _all_approved(posts: list[dict]) -> bool:
    """Every post approved — and there has to be at least one post to approve.

    An empty strategy is not "all approved", and a post without `approval_status` was
    never approved either: the approval endpoint is the only thing that writes that value.
    """
    return bool(posts) and all(item.get("approval_status") == "approved" for item in posts)


def _item(key: str, title: str, why: str, action_href: str, action_label: str, done: bool) -> dict:
    return {
        "key": key,
        "title": title,
        "why": why,
        "done": bool(done),
        "action_href": action_href,
        "action_label": action_label,
    }


def _setup_items(db: Session, business: Business | None, stored: dict) -> list[dict]:
    business_id = business.id if business else None
    connected = _connected_providers(db, business)
    return [
        _item(
            "scan",
            title="קריאת האתר",
            why="בלעדיה אין זהות מותג, צבעים ותמונות — והתוכן נוצר בלי החומרים שלכם.",
            action_href="/decisions",
            action_label="לסריקת האתר",
            done=_filled(stored.get("brand_language")),
        ),
        _item(
            "diagnostics",
            title="אבחון העסק",
            why="התשובות קובעות אילו יעדים ופוסטים מתאימים לעסק שלכם.",
            action_href="/decisions",
            action_label="למילוי האבחון",
            done=_has_answers(stored.get("diagnostics")),
        ),
        _item(
            "priorities",
            title="יעדי צמיחה",
            why="היעדים שבחרתם הם מה שהתוכנית החודשית מכוונת אליו.",
            action_href="/decisions",
            action_label="לבחירת יעדים",
            done=bool(_ranked_targets(stored.get("growth_targets"))),
        ),
        _item(
            "quarter",
            title="תוכנית רבעונית",
            why="התוכנית נותנת לחודש הקרוב הקשר של יעד גדול, לא רק רשימת פוסטים.",
            action_href="/plan",
            action_label="לבניית התוכנית",
            done=_filled(stored.get("long_horizon_plan")),
        ),
        _item(
            "audiences",
            title="קהלי יעד",
            why="כל פוסט ידע למי הוא מדבר, והתוצאות יוצגו לפי קהל.",
            action_href="/decisions#audiences",
            action_label="להגדרת קהלים",
            done=_has_rows(db, Audience, business_id),
        ),
        _item(
            "media",
            title="ספריית מדיה",
            why="התמונות שלכם ישמשו בכל עיצוב, במקום תמונות מלאי גנריות.",
            action_href="/assets",
            action_label="להעלאת תמונות",
            done=_has_rows(db, Asset, business_id),
        ),
        _item(
            "google",
            title="חיבור Google Analytics",
            why="רק כך רואים אילו פוסטים וערוצים באמת הביאו תנועה והמרות.",
            action_href="/integrations",
            action_label="לחיבור GA4",
            done="ga4" in connected,
        ),
        _item(
            "instagram",
            title="חיבור אינסטגרם",
            why="מאפשר לפרסם ולמדוד את הפוסטים בלי להעתיק אותם ידנית.",
            action_href="/integrations",
            action_label="לחיבור אינסטגרם",
            done="meta" in connected,
        ),
    ]


def _running_items(posts: list[dict]) -> list[dict]:
    return [
        _item(
            "plan",
            title="תוכנית החודש",
            why="התוכנית היא מה שהופך את האסטרטגיה לפוסטים מוכנים לעבודה.",
            action_href="/strategy",
            action_label="ליצירת התוכנית",
            done=bool(posts),
        ),
        _item(
            "approve",
            title="אישור הפוסטים",
            why="רק פוסטים מאושרים נכנסים לפרסום ולמדידה.",
            action_href="/posts",
            action_label="לאישור הפוסטים",
            done=_all_approved(posts),
        ),
        _item(
            "publish",
            title="פרסום וסימון קישור",
            why="סימון הקישור שפורסם הוא מה שמחבר בין הפוסט לתוצאות שלו.",
            action_href="/posts",
            action_label="לסימון פרסום",
            done=any(_filled(item.get("published_url")) for item in posts),
        ),
    ]


def _groups(db: Session, business: Business | None) -> list[dict]:
    stored = _stored(business)
    posts = _posts(db, business)
    return [
        {"key": SETUP, "title": SETUP_TITLE, "items": _setup_items(db, business, stored)},
        {"key": RUNNING, "title": RUNNING_TITLE, "items": _running_items(posts)},
    ]


@router.get("")
def setup_checklist(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """What is done, what is missing, and the one thing to do now.

    `next` is the first incomplete item in `NEXT_ORDER` — a ranking by value to the owner,
    kept separate from how `groups` is listed — so the UI can show one clear instruction
    instead of a wall of checkboxes. When nothing is left, `next` is null.
    """
    business = _newest_business(db, user)
    groups = _groups(db, business)
    items = [item for group in groups for item in group["items"]]
    pending = sorted(items, key=lambda item: _RANK.get(item["key"], len(NEXT_ORDER)))
    nxt = next((item for item in pending if not item["done"]), None)
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
