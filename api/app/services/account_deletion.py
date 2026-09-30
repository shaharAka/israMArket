"""Delete an account and everything the product stored for it.

The landing page and /security promise "אפשר למחוק את החשבון וכל המידע בכל רגע". That is
only true if nothing survives, so this does not keep a hand-written list of tables that
the next migration would silently outgrow. It walks `Base.metadata`:

* every table with a `business_id` column loses the rows of the user's businesses,
* every table with a `user_id` column loses the user's rows,
* `webhook_deliveries` (keyed by `endpoint_id`) goes before its endpoints,
* then the businesses, then the user.

`tests/test_account_deletion.py` fails if a table ever references anything other than
users, businesses or webhook endpoints, because such a table would need its own step here.

Files: every card, uploaded photo and scan capture lives in `media_root()/{business_id}/`
(see services/images.py and services/assets.py), so that folder is removed whole, after
the database commit — a failed commit must not leave rows pointing at deleted files.
"""

from __future__ import annotations

import shutil

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.db import Base
from app.models import Business, User, WebhookDelivery, WebhookEndpoint
from app.services import images

# The only foreign-key targets this module knows how to cascade from.
HANDLED_PARENTS = {"users", "businesses", "webhook_endpoints"}


def delete_account(db: Session, user: User) -> dict:
    """Delete `user`, their businesses, every dependent row and their media folders.

    Returns counts per table, which the tests read; the route does not expose them.
    """
    business_ids = [row[0] for row in db.query(Business.id).filter(Business.user_id == user.id).all()]
    counts: dict[str, int] = {}

    if business_ids:
        endpoint_ids = [
            row[0] for row in db.query(WebhookEndpoint.id).filter(WebhookEndpoint.business_id.in_(business_ids)).all()
        ]
        if endpoint_ids:
            result = db.execute(delete(WebhookDelivery).where(WebhookDelivery.endpoint_id.in_(endpoint_ids)))
            counts["webhook_deliveries"] = result.rowcount or 0

        # Children before parents: reversed dependency order, businesses themselves last.
        for table in reversed(Base.metadata.sorted_tables):
            if table.name == "businesses" or "business_id" not in table.c:
                continue
            result = db.execute(delete(table).where(table.c.business_id.in_(business_ids)))
            counts[table.name] = result.rowcount or 0

    for table in reversed(Base.metadata.sorted_tables):
        # `businesses` is one of these: it goes here, after all of its children.
        if table.name == "users" or "user_id" not in table.c:
            continue
        result = db.execute(delete(table).where(table.c.user_id == user.id))
        counts[table.name] = counts.get(table.name, 0) + (result.rowcount or 0)

    result = db.execute(delete(User).where(User.id == user.id))
    counts["users"] = result.rowcount or 0
    db.commit()
    db.expunge_all()

    root = images.media_root().resolve()
    for business_id in business_ids:
        folder = (root / str(business_id)).resolve()
        # Never follow a path out of the media root, whatever the id looks like.
        if folder.parent == root and folder.is_dir():
            shutil.rmtree(folder, ignore_errors=True)

    # In-memory caches keyed by business id (the Google keyword payload).
    try:
        from app.routers import promotion

        for business_id in business_ids:
            promotion.cache_clear(business_id)
    except Exception:  # pragma: no cover - a cache must never block a deletion
        pass

    return counts
