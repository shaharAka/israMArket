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
from app.services import journey

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
    return [
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
            title="התוכנית של הרבעון",
            why="כך כל חודש הוא צעד לקראת יעד גדול, ולא רק רשימת פוסטים.",
            action_href="/plan",
            action_label="לבנות את התוכנית",
            done=facts.long_horizon,
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

    `next` is the first incomplete item in `NEXT_ORDER` — a ranking by value to the owner,
    kept separate from how `groups` is listed — so the UI can show one clear instruction
    instead of a wall of checkboxes. When nothing is left, `next` is null.
    """
    business = newest_business(db, user)
    groups = groups_for(journey.load(db, business))
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
