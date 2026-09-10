from datetime import date

from app.services.calendar_il import gregorian_month_meta


def next_civil_month(year: int, month: int) -> tuple[int, int]:
    if month < 1 or month > 12:
        raise ValueError("חודש חייב להיות בין 1 ל-12")
    if month == 12:
        return year + 1, 1
    return year, month + 1


def prior_month_review(
    strategy: dict,
    snapshot: dict | None = None,
    recommendation: dict | None = None,
) -> dict:
    """Facts only. No invented metrics."""
    posts = list(((strategy.get("roadmap") or {}).get("posts") or []))
    approved = [post for post in posts if post.get("approval_status") == "approved"]
    published = [post for post in posts if post.get("published_url")]
    attribution = ((snapshot or {}).get("ga4") or {}).get("post_attribution") or []
    usp = strategy.get("usp") or {}
    monthly = strategy.get("monthly_horizon_plan") or (strategy.get("roadmap") or {}).get("monthly_horizon_plan") or {}
    return {
        "year": strategy.get("year"),
        "month": strategy.get("month"),
        "month_name_he": strategy.get("month_name_he"),
        "theme": (strategy.get("roadmap") or {}).get("theme") or "",
        "usp": usp.get("usp") or "",
        "growth_hypothesis": usp.get("growth_hypothesis") or monthly.get("hypothesis") or "",
        "long_horizon": strategy.get("long_horizon_plan")
        or (strategy.get("roadmap") or {}).get("long_horizon_plan")
        or {},
        "posts_total": len(posts),
        "posts_approved": len(approved),
        "posts_published": len(published),
        "approved_titles": [post.get("title") or "" for post in approved],
        "published": [
            {"title": post.get("title") or "", "url": post.get("published_url"), "utm": post.get("utm") or {}}
            for post in published
        ],
        "formats_used": [post.get("format") or "" for post in posts],
        "has_performance": bool(snapshot),
        "attribution": attribution,
        "diagnostic": (snapshot or {}).get("diagnostic"),
        "weekly_recommendation": (recommendation or {}).get("suggestions"),
    }


def horizon_payload(source_year: int, source_month: int, *, next_exists: bool, next_stage: str | None) -> dict:
    year, month = next_civil_month(source_year, source_month)
    meta = gregorian_month_meta(year, month)
    in_progress = bool(next_stage) and next_stage != "done"
    return {
        "next_year": year,
        "next_month": month,
        "next_month_name_he": meta["month_name_he"],
        "next_exists": next_exists,
        "next_in_progress": in_progress,
        "next_stage": next_stage if in_progress else None,
        "source_is_civil": date.today().year == source_year and date.today().month == source_month,
    }


def prior_prompt_block(prior: dict | None) -> str:
    if not prior:
        return "אין חודש קודם שמור. זו התוכנית הראשונה."
    measured = (
        "יש נתוני ביצוע מצורפים. מותר להסיק רק מהם."
        if prior.get("has_performance")
        else "אין סנכרון GA4/מטא. אסור להמציא מדדים, אחוזים או 'מה עבד'. המשך לפי האופק ומה שאושר."
    )
    return f"""
סיכום החודש שכבר רץ — עובדות בלבד:
{prior}

{measured}
"""
