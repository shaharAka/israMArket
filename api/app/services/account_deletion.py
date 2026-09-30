"""Delete an account and everything the product stored for it.

The landing page and /security promise "אפשר למחוק את החשבון וכל המידע בכל רגע". That is
only true if nothing survives, so this does not keep a hand-written list of tables that
the next migration would silently outgrow. It walks `Base.metadata`:

* every table with a `business_id` column loses the rows of the user's businesses,
* every table with a `user_id` column loses the user's rows,
* `webhook_deliveries` (keyed by `endpoint_id`) goes before its endpoints,
* `whatsapp_clicks` references `whatsapp_links` but also carries `business_id`, so the
  business walk (children first) removes the clicks before their links,
* `subscriptions` and `payments` are keyed by `user_id` too, so they go with the user;
  the PayPal subscription itself is cancelled first (best effort, `billing.cancel_for_deletion`),
* then the businesses, then the user,
* then anything whose owner is already gone (`purge_orphans`): a month a background build
  finished writing after its account was deleted, or rows from before this module. SQLite
  reuses ids, so such a row would otherwise be inherited by the next business or user with
  that id — a new business once opened on a deleted business's old strategy. models.py
  also clears a freshly inserted business's or user's id of any leftovers.

`tests/test_account_deletion.py` fails if a table ever references anything other than
users, businesses or webhook endpoints, because such a table would need its own step here.

Files: every card, uploaded photo and scan capture lives in `media_root()/{business_id}/`
(see services/images.py and services/assets.py), so that folder is removed whole, after
the database commit — a failed commit must not leave rows pointing at deleted files.
"""

from __future__ import annotations

import shutil

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import (
    Business,
    User,
    WebhookDelivery,
    WebhookEndpoint,
    business_scoped_tables,
    purge_business_rows,
    user_scoped_tables,
)
from app.services import billing, images

# The only foreign-key targets this module knows how to cascade from.
# `whatsapp_links` is safe because every table pointing at it also has `business_id`.
HANDLED_PARENTS = {"users", "businesses", "webhook_endpoints", "whatsapp_links"}


def purge_orphans(db: Session) -> dict[str, int]:
    """Delete rows whose owner no longer exists: businesses of a deleted user, rows keyed
    by a deleted business or user, deliveries of a deleted endpoint. Not committed.

    Such a row would otherwise be inherited by the next business or user that gets the
    same id (SQLite reuses them; models.py also clears a new row's id on insert).
    """
    counts: dict[str, int] = {}
    conn = db.connection()
    users = User.__table__
    businesses = Business.__table__
    endpoints = WebhookEndpoint.__table__
    deliveries = WebhookDelivery.__table__

    stale = [
        row[0]
        for row in conn.execute(select(businesses.c.id).where(businesses.c.user_id.not_in(select(users.c.id))))
    ]
    for table, count in purge_business_rows(conn, stale).items():
        counts[table] = counts.get(table, 0) + count
    if stale:
        result = conn.execute(delete(businesses).where(businesses.c.id.in_(stale)))
        counts["businesses"] = result.rowcount or 0

    live_businesses = select(businesses.c.id)
    result = conn.execute(
        delete(deliveries).where(
            deliveries.c.endpoint_id.in_(select(endpoints.c.id).where(endpoints.c.business_id.not_in(live_businesses)))
        )
    )
    counts["webhook_deliveries"] = counts.get("webhook_deliveries", 0) + (result.rowcount or 0)
    for table in business_scoped_tables():
        result = conn.execute(delete(table).where(table.c.business_id.not_in(live_businesses)))
        counts[table.name] = counts.get(table.name, 0) + (result.rowcount or 0)
    result = conn.execute(delete(deliveries).where(deliveries.c.endpoint_id.not_in(select(endpoints.c.id))))
    counts["webhook_deliveries"] += result.rowcount or 0
    for table in user_scoped_tables():
        if table.name == "businesses":
            continue  # handled above, with its children
        result = conn.execute(delete(table).where(table.c.user_id.not_in(select(users.c.id))))
        counts[table.name] = counts.get(table.name, 0) + (result.rowcount or 0)
    return {table: count for table, count in counts.items() if count}


def delete_account(db: Session, user: User) -> dict:
    """Delete `user`, their businesses, every dependent row and their media folders.

    Returns counts per table, which the tests read; the route does not expose them.
    """
    # First, before any row goes: stop PayPal charging an account that will not exist.
    # Best effort (services/billing.cancel_for_deletion logs a failure with the
    # subscription id so it can be cancelled by hand); the deletion itself always proceeds.
    billing.cancel_for_deletion(db, user)

    business_ids = [row[0] for row in db.query(Business.id).filter(Business.user_id == user.id).all()]
    counts: dict[str, int] = {}

    # Children before parents: deliveries, then every business-keyed table (strategies,
    # jobs, WhatsApp clicks before their links…), businesses themselves last.
    counts.update(purge_business_rows(db.connection(), business_ids))

    for table in user_scoped_tables():
        # `businesses` is one of these: it goes here, after all of its children.
        result = db.execute(delete(table).where(table.c.user_id == user.id))
        counts[table.name] = counts.get(table.name, 0) + (result.rowcount or 0)

    result = db.execute(delete(User).where(User.id == user.id))
    counts["users"] = result.rowcount or 0
    # Rows of accounts already gone (a month a background build finished writing after its
    # account was deleted, or rows from before this module existed): swept on every deletion.
    counts["orphans"] = sum(purge_orphans(db).values())
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
