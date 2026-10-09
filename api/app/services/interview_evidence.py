"""Copy already-authorized business evidence into a bounded interview context.

No provider requests, tokens, personal visitor data or shared DB session enter the worker.
A saved social URL alone is never a source read. Event counts are not unique customers.
"""
from datetime import datetime, timezone
from math import isfinite
from urllib.parse import urlparse

from app.models import InstagramPost, Integration, PerformanceSnapshot
from app.services.jsonutil import loads

EVENT_STAGES = {
    "online_shop": ("view_item", "add_to_cart", "begin_checkout", "purchase"),
    "physical_shop": ("click_directions", "click_to_call", "purchase"),
    "services": ("generate_lead", "appointment_booked", "purchase"),
    "software": ("sign_up", "demo_requested", "activation", "purchase"),
    "fundraising": ("donation", "purchase", "recurring_donation"),
}
ROUTE_RULES = {
    "online_shop": "Completed paid orders are the outcome. Product views, cart additions and checkout starts are diagnostic events. Event counts cannot yield a customer conversion rate or abandoned-cart rate without a consistent user/cart cohort and period. An advertised price is not average order value.",
    "physical_shop": "Directions, calls and website activity indicate interest, not completed store sales. Ask how the owner records actual store sales; do not infer sales from map clicks.",
    "services": "Distinguish interest, qualified inquiries, booked appointments and completed paid work. Ask what makes an inquiry suitable for this specific service. A lead event alone does not prove qualification or a booked job.",
    "software": "Understand the named product, commercial offer, buyer and purchase decision. Separate trial, demo, activation and paid account. A signup is not a paying customer. A purchase event may describe a payment, not an active subscription.",
    "fundraising": "Distinguish donation intent, completed gifts and recurring donors. Ask how a supporter can donate and what verified impact the organization can explain. Do not invent impact, tax eligibility or beneficiaries. A generic purchase event is not a verified donation.",
}


def _same_site(left, right):
    try:
        a, b = urlparse(left), urlparse(right)
        return bool(a.hostname and b.hostname and a.hostname.lower().removeprefix("www.") == b.hostname.lower().removeprefix("www."))
    except ValueError:
        return False


def _object(value):
    return value if isinstance(value, dict) else {}


def _age(read_at):
    try:
        stamp = datetime.fromisoformat(str(read_at).replace("Z", "+00:00"))
        if stamp.tzinfo is None:
            stamp = stamp.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - stamp).total_seconds() > 7 * 86400
    except (TypeError, ValueError):
        return True


def snapshot(db, business, draft):
    if not business:
        return {}
    stored = _object(loads(business.scraped_profile_json, {}))
    raw = _object(stored.get("raw"))
    # An edited draft for a different business must not inherit the previous site's facts.
    site_matches = _same_site(draft.links.website, raw.get("url") or business.website_url)
    same_business = site_matches or (not draft.links.website and draft.business_name == business.name)
    if not same_business:
        return {}
    # Story captures are measurement evidence, not the established feed examples
    # used to personalize this interview. Tagged feed rows belong to the selection.
    meta_item = db.query(Integration).filter_by(business_id=business.id, provider="meta").first()
    from app.services.meta_readiness import selection
    account = selection(meta_item)["instagram_id"] if meta_item else ""
    posts = db.query(InstagramPost).filter(InstagramPost.business_id == business.id,
        InstagramPost.media_product_type != "STORY",
        (InstagramPost.instagram_id == "") | (InstagramPost.instagram_id == account)).order_by(
        InstagramPost.synced_at.desc(), InstagramPost.id.desc()).limit(6).all()
    social = [{"kind": "instagram", "url": p.permalink, "text": p.caption[:1800],
               "read_at": p.synced_at.isoformat(), "published_at": p.posted_at}
              for p in posts if p.caption and p.permalink]
    record = db.query(PerformanceSnapshot).filter(PerformanceSnapshot.business_id == business.id).order_by(
        PerformanceSnapshot.created_at.desc(), PerformanceSnapshot.id.desc()).first()
    analytics = {}
    selected = db.query(Integration).filter(Integration.business_id == business.id,
        Integration.provider == "ga4").first()
    data = _object(loads(record.ga4_json, {})) if record else {}
    # A previous property's report must never personalize the newly selected site.
    if record and selected and selected.external_id and data.get("property_id") == selected.external_id:
        period = data.get("period") or {"start": record.period_start, "end": record.period_end}
        rows = data.get("events") if isinstance(data.get("events"), list) else []
        counts = {}
        for row in rows[:30]:
            if not isinstance(row, dict):
                continue
            try:
                if isinstance(row.get("eventCount"), bool):
                    continue
                value = float(row.get("eventCount"))
            except (TypeError, ValueError):
                continue
            if isfinite(value) and value >= 0:
                counts[str(row.get("eventName") or "")] = value
        segment = draft.research_journey.segment if draft.research_journey else "services"
        read_at = data.get("read_at") or record.created_at.isoformat()
        reads = _object(data.get("report_reads"))
        events_read = _object(reads.get("events"))
        analytics = {"provider": "ga4", "period": period, "read_at": read_at,
                     "stale": _age(read_at), "events_read": events_read.get("status", "unknown"),
                     "source_error": _object(data.get("source_error")).get("status"),
                     "access_active": selected.status == "connected",
                     "rows_limited": events_read.get("limited", False),
                     "stages": [{"event": event, "count": counts.get(event),
                                 "status": "observed" if event in counts else "unknown"}
                                for event in EVENT_STAGES[segment]],
                     "count_unit": "event occurrences, not unique people, orders, carts or customers",
                     "missing_event_rule": "An omitted event is unknown. It may be outside a capped report or not firing; do not claim installation was verified."}
    return {"site_scan": {"raw": raw} if site_matches and raw else None,
            "social_excerpts": social, "analytics": analytics}
