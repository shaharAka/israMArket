"""Carry the owner's business route and chosen outcome into analysis.

Interview baselines are owner-reported planning inputs, not provider observations.
The same context is used by the explicit and queued analysis paths.
"""
from app.services.interview_evidence import ROUTE_RULES
import hashlib
from app.services.jsonutil import dumps, loads


def context(business):
    stored = loads(getattr(business, "scraped_profile_json", ""), {})
    stored = stored if isinstance(stored, dict) else {}
    owner = stored.get("owner_context") or {}
    owner = owner if isinstance(owner, dict) else {}
    journey = owner.get("research_journey") or {}
    journey = journey if isinstance(journey, dict) else {}
    segment = journey.get("segment")
    if segment not in ROUTE_RULES:
        segment = "software" if getattr(business, "business_model", "products") == "saas" else "services" if getattr(business, "business_model", "products") in {"services", "both"} else "online_shop"
    answer = journey.get("answers") or {}
    answer = answer if isinstance(answer, dict) else {}
    return {"marketing_outcome": {
        "segment": segment, "selected_measure": journey.get("metric"),
        "interpretation": ROUTE_RULES[segment],
        "owner_reported_baseline": journey.get("observations") or [],
        "baseline_rule": "Owner-reported exact values, ranges and unknowns remain separate from provider events. No midpoint, top bound, revenue, trend or channel attribution is inferred.",
        "offer": answer.get("offerings") or getattr(business, "offerings", ""),
        "distinctive": answer.get("differentiator") or owner.get("differentiator"),
        "customers": answer.get("audiences") or [],
        "software_offer": owner.get("software") if segment == "software" else None,
    }}


def fingerprint(business):
    return hashlib.sha256(dumps(context(business)).encode()).hexdigest()
