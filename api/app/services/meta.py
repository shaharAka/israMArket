from datetime import date, datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx

from app.config import get_settings

# One version for every call, OAuth dialog included, set in config (`META_GRAPH_VERSION`).
# v21.0 was pinned here before; it expires in January 2027, and the sync still asked for
# the retired `impressions` media metric. https://developers.facebook.com/docs/graph-api/changelog
GRAPH_VERSION = get_settings().meta_graph_version or "v25.0"
GRAPH = f"https://graph.facebook.com/{GRAPH_VERSION}"
# Read-only permissions, and deliberately nothing more. Posting to an Instagram business
# account or to a Facebook Page needs `instagram_content_publish` and `pages_manage_posts`,
# and Meta only lets an app *ask* for those after it has reviewed and approved the app.
# Requesting an unapproved permission here fails the whole login, so it is not requested;
# the publishing screen reports what is missing and why instead
# (see `services.publish.PUBLISH_SCOPES`).
META_SCOPES = [
    "pages_show_list",
    "pages_read_engagement",
    "instagram_basic",
    "instagram_manage_insights",
]


def meta_configured() -> bool:
    settings = get_settings()
    return bool(settings.meta_app_id and settings.meta_app_secret)


def authorization_url(state: str, *, ads: bool = False) -> str:
    settings = get_settings()
    if not meta_configured():
        raise RuntimeError("חסרים META_APP_ID ו-META_APP_SECRET לחיבור מטא.")
    redirect = f"{settings.oauth_callback_base()}/integrations/meta/callback"
    query = urlencode(
        {
            "client_id": settings.meta_app_id,
            "redirect_uri": redirect,
            "state": state,
            "scope": ",".join(META_SCOPES + (["ads_read"] if ads else [])),
            "response_type": "code",
            "auth_type": "rerequest",
        }
    )
    return f"https://www.facebook.com/{GRAPH_VERSION}/dialog/oauth?{query}"


def exchange_code(code: str) -> dict:
    settings = get_settings()
    redirect = f"{settings.oauth_callback_base()}/integrations/meta/callback"
    short = httpx.get(
        f"{GRAPH}/oauth/access_token",
        params={
            "client_id": settings.meta_app_id,
            "client_secret": settings.meta_app_secret,
            "redirect_uri": redirect,
            "code": code,
        },
        timeout=20.0,
    )
    if short.status_code >= 400:
        raise RuntimeError(f"לא הצלחנו להשלים את החיבור לפייסבוק: {short.text}")
    short_token = short.json()["access_token"]

    long_lived = httpx.get(
        f"{GRAPH}/oauth/access_token",
        params={
            "grant_type": "fb_exchange_token",
            "client_id": settings.meta_app_id,
            "client_secret": settings.meta_app_secret,
            "fb_exchange_token": short_token,
        },
        timeout=20.0,
    )
    if long_lived.status_code >= 400:
        raise RuntimeError(f"לא הצלחנו להאריך את החיבור לפייסבוק: {long_lived.text}")
    payload = long_lived.json()
    expires = datetime.now(timezone.utc) + timedelta(seconds=int(payload.get("expires_in", 60 * 60 * 24 * 60)))
    return {
        "access_token": payload["access_token"],
        "refresh_token": payload["access_token"],
        "expires_at": expires,
        # What Meta actually granted, which is not always what was asked for. The
        # publishing capability is read from this and never from META_SCOPES.
        "scopes": granted_scopes(payload["access_token"]),
    }


def granted_scopes(access_token: str) -> list[str]:
    """The permissions Meta actually attached to this token.

    `META_SCOPES` is what we ask for; Meta decides what it hands back, and the two differ
    the moment a permission is declined or not yet approved for the app. Recording Meta's
    own answer is what lets the publishing screen report the truth instead of a wish list.

    Best effort on purpose: a failure to read permissions must never break connecting an
    account, and an empty list is the honest "we do not know of any grant".
    """
    try:
        response = httpx.get(
            f"{GRAPH}/me/permissions",
            params={"access_token": access_token},
            timeout=20.0,
        )
        if response.status_code >= 400:
            return []
        return [
            item["permission"]
            for item in response.json().get("data", [])
            if item.get("status") == "granted" and item.get("permission")
        ]
    except Exception:
        return []


def list_pages(access_token: str) -> list[dict]:
    from app.services.meta_marketing import collection

    rows = collection("me/accounts", {"fields": "id,name,access_token,instagram_business_account"}, access_token)
    pages = []
    for page in rows:
        ig = (page.get("instagram_business_account") or {}).get("id", "")
        pages.append(
            {
                "page_id": page["id"],
                "display_name": page.get("name", ""),
                "page_access_token": page.get("access_token", ""),
                "instagram_id": ig,
            }
        )
    return pages


# --- Graph errors ---------------------------------------------------------------------

# Codes Meta documents across the Graph and Instagram APIs, grouped by what the product
# should *say* to the owner rather than by Meta's own taxonomy.
_RATE_LIMIT_CODES = {4, 17, 32, 613, 80002}
_TOKEN_CODES = {102, 190, 463, 467}
_PERMISSION_CODES = {3, 10}
# Business Discovery answers "Cannot find User" (code 110, subcode 2207013) for a
# username that does not exist *and* for one that is private or a personal account:
# only Business and Creator accounts are discoverable, and Meta does not say which.
_NOT_FOUND_CODES = {110}
_NOT_FOUND_SUBCODES = {2207013}


class GraphError(RuntimeError):
    """One Graph API failure, classified into what the owner can do about it."""

    def __init__(self, message: str, *, status: int = 0, code: int = 0, subcode: int = 0, kind: str = "other"):
        super().__init__(message)
        self.status = status
        self.code = code
        self.subcode = subcode
        self.kind = kind


def _classify(code: int, subcode: int, status: int) -> str:
    if code in _NOT_FOUND_CODES or subcode in _NOT_FOUND_SUBCODES:
        return "not_found"
    if code in _RATE_LIMIT_CODES:
        return "rate_limited"
    if code in _TOKEN_CODES:
        return "token"
    if code in _PERMISSION_CODES or 200 <= code <= 299:
        return "permission"
    if code == 100:
        return "invalid"
    if status >= 500:
        return "unavailable"
    return "other"


def _int(value) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def graph_error(response: httpx.Response) -> GraphError:
    try:
        body = response.json()
    except ValueError:
        body = {}
    error = body.get("error") if isinstance(body, dict) else None
    error = error if isinstance(error, dict) else {}
    code = _int(error.get("code"))
    subcode = _int(error.get("error_subcode"))
    message = str(error.get("error_user_msg") or error.get("message") or response.text or "")[:300]
    return GraphError(
        message,
        status=response.status_code,
        code=code,
        subcode=subcode,
        kind=_classify(code, subcode, response.status_code),
    )


def graph_get(path: str, params: dict, access_token: str, timeout: float = 20.0) -> dict:
    """GET one Graph object. Raises `GraphError` for HTTP and transport failures alike."""
    try:
        response = httpx.get(
            f"{GRAPH}/{path.lstrip('/')}",
            params={**params, "access_token": access_token},
            timeout=timeout,
        )
    except httpx.HTTPError as exc:
        raise GraphError(f"לא הצלחנו להתחבר לאינסטגרם ולפייסבוק ({exc.__class__.__name__})", kind="unavailable") from exc
    if response.status_code >= 400:
        raise graph_error(response)
    try:
        payload = response.json()
    except ValueError as exc:
        raise GraphError("קיבלנו תשובה לא תקינה מאינסטגרם ופייסבוק", status=response.status_code) from exc
    return payload if isinstance(payload, dict) else {}


# --- Own media + insights -------------------------------------------------------------

# `media_product_type` (FEED / REELS / STORY / AD) is what separates a reel from a feed
# video — `media_type` says VIDEO for both. It exists only on the Facebook Login flavour
# of the API, so the basic list is the fallback if Meta refuses a field.
MEDIA_FIELDS = (
    "id,caption,timestamp,media_type,media_product_type,permalink,"
    "media_url,thumbnail_url,like_count,comments_count"
)
MEDIA_FIELDS_BASIC = "id,caption,timestamp,media_type,permalink,like_count,comments_count"

# `impressions` is deprecated for media created after July 2, 2024 and replaced by
# `views`. If the combined request fails, each metric is asked for alone, so a metric
# Meta will not serve for one post costs that one number — never the whole sync.
INSIGHT_METRICS = ("views", "reach", "saved", "shares")

# Instagram's own caption limit: the full text is kept for the post table.
CAPTION_MAX = 2200
# What the snapshot (and so the diagnostic prompt) keeps, unchanged from before.
CAPTION_SNAPSHOT = 280
MISSING_METRIC_HE = "אינסטגרם לא החזיר את המספר הזה"


def _metric_value(metric: dict):
    values = metric.get("values") or []
    if values and isinstance(values[0], dict):
        return values[0].get("value")
    total = metric.get("total_value")
    if isinstance(total, dict):
        return total.get("value")
    return None


def _parse_insights(payload: dict) -> dict:
    parsed = {}
    for metric in payload.get("data") or []:
        if isinstance(metric, dict) and metric.get("name"):
            value = _metric_value(metric)
            if value is not None:
                parsed[metric["name"]] = value
    return parsed


def media_insights(
    media_id: str, access_token: str, metrics: tuple[str, ...] = INSIGHT_METRICS
) -> tuple[dict, dict]:
    """(values, errors) for one media object. Never raises.

    One request for every metric first. Meta fails the whole request when any one metric
    is unsupported for that media, so on failure each metric is retried alone and the
    ones that still fail land in `errors` with Meta's message. A metric that is missing
    is absent from `values` — never a zero.
    """
    try:
        values = _parse_insights(
            graph_get(f"{media_id}/insights", {"metric": ",".join(metrics)}, access_token, timeout=15.0)
        )
        return values, {name: MISSING_METRIC_HE for name in metrics if name not in values}
    except GraphError as exc:
        if exc.kind in {"token", "rate_limited", "unavailable"}:
            # Retrying metric by metric would only spend more of the same budget.
            return {}, {name: str(exc) or MISSING_METRIC_HE for name in metrics}
    values: dict = {}
    errors: dict = {}
    for name in metrics:
        try:
            parsed = _parse_insights(
                graph_get(f"{media_id}/insights", {"metric": name}, access_token, timeout=15.0)
            )
        except GraphError as exc:
            errors[name] = str(exc) or MISSING_METRIC_HE
            continue
        if name in parsed:
            values[name] = parsed[name]
        else:
            errors[name] = MISSING_METRIC_HE
    return values, errors


def _list_media(instagram_id: str, access_token: str, limit: int) -> list[dict]:
    try:
        payload = graph_get(
            f"{instagram_id}/media", {"fields": MEDIA_FIELDS, "limit": limit}, access_token, timeout=30.0
        )
    except GraphError as exc:
        if exc.kind != "invalid":
            raise
        payload = graph_get(
            f"{instagram_id}/media", {"fields": MEDIA_FIELDS_BASIC, "limit": limit}, access_token, timeout=30.0
        )
    return [item for item in payload.get("data") or [] if isinstance(item, dict)]


def fetch_insights(page_access_token: str, instagram_id: str, page_id: str) -> dict:
    if not instagram_id:
        raise RuntimeError("לדף הפייסבוק שבחרתם לא מקושר חשבון אינסטגרם עסקי. קשרו חשבון עסקי לדף, ואז רעננו את הנתונים.")

    try:
        media = _list_media(instagram_id, page_access_token, 20)
    except GraphError as exc:
        raise RuntimeError(f"לא הצלחנו לקבל את הפוסטים מאינסטגרם: {exc}") from exc

    posts = []
    failed_metrics: dict[str, int] = {}
    for item in media:
        media_id = item.get("id")
        insights, errors = media_insights(media_id, page_access_token) if media_id else ({}, {})
        for name in errors:
            failed_metrics[name] = failed_metrics.get(name, 0) + 1
        caption = item.get("caption") or ""
        posts.append(
            {
                "id": media_id,
                "caption": caption[:CAPTION_SNAPSHOT],
                # Full text for the post table (hooks, caption length). `snapshot_view`
                # drops it from the stored snapshot so the diagnostic prompt does not grow.
                "caption_full": caption[:CAPTION_MAX],
                "caption_length": len(caption),
                "timestamp": item.get("timestamp"),
                "media_type": item.get("media_type"),
                "media_product_type": item.get("media_product_type") or "",
                "permalink": item.get("permalink"),
                "media_url": item.get("media_url") or "",
                "thumbnail_url": item.get("thumbnail_url") or "",
                "like_count": item.get("like_count"),
                "comments_count": item.get("comments_count"),
                "insights": insights,
                "insight_errors": errors,
            }
        )

    page = graph_get(page_id, {"fields": "name,fan_count"}, page_access_token)

    return {
        "page": page,
        "instagram_id": instagram_id,
        "posts": posts,
        "graph_version": GRAPH_VERSION,
        "metrics_requested": list(INSIGHT_METRICS),
        # {"views": 3} = three posts came back without views. Said out loud so a missing
        # number reads as "not measured" and never as zero.
        "metric_failures": failed_metrics,
    }


# --- Own account insights ---------------------------------------------------------------

# GET /{ig-user-id}/insights, checked on 30.9.2026 against
# https://developers.facebook.com/docs/instagram-platform/api-reference/instagram-user/insights
# and the Graph API changelog. Every metric here is `period=day` + `metric_type=total_value`:
# one number for the whole since–until window.
#
# Retired, so never asked for: `impressions` (v22.0, every version from 21.4.2025, replaced
# by `views`), and `profile_views`, `website_clicks`, `email_contacts`, `phone_call_clicks`,
# `text_message_clicks`, `get_directions_clicks` (v21.0, every version from 8.1.2025). The
# contact-button taps now come as one metric, `profile_links_taps`, broken down by
# `contact_button_type` — and it has no website button: Meta no longer reports taps on the
# link in the bio at all, nor visits to the profile. The screen says so instead of guessing.
ACCOUNT_TOTAL_METRICS = ("reach", "views", "accounts_engaged", "total_interactions")
# A breakdown applies to every metric in the request, so each of these is asked alone.
ACCOUNT_BREAKDOWN_METRICS = {"profile_links_taps": "contact_button_type", "follows_and_unfollows": "follow_type"}
ACCOUNT_METRICS = ACCOUNT_TOTAL_METRICS + tuple(ACCOUNT_BREAKDOWN_METRICS)
# Meta: `follows_and_unfollows` (and the legacy `follower_count`) are not served for an
# account with fewer than 100 followers.
MIN_FOLLOWERS = 100
FOLLOWER_GATED = {"follows_and_unfollows", "follower_count"}
# The windows the results screen compares: the last 7 / 28 days against the 7 / 28 before.
ACCOUNT_WINDOWS = (7, 28)
# Meta refuses a longer since–until range for account insights; `follower_count` also only
# goes back 30 days and never includes today.
ACCOUNT_WINDOW_MAX_DAYS = 30

FEW_FOLLOWERS_HE = "צריך לפחות 100 עוקבים כדי לראות את המספר הזה."
ACCOUNT_WINDOW_HE = "אינסטגרם נותן את המספרים של החשבון לכל היותר ל-30 ימים בכל פעם."
_ACCOUNT_ERROR_HE = {
    "token": "החיבור לאינסטגרם פג. חברו את אינסטגרם מחדש בעמוד החיבורים.",
    "rate_limited": "אינסטגרם ביקש מאיתנו להאט. ננסה שוב ברענון הבא.",
    "unavailable": "לא הצלחנו להתחבר לאינסטגרם. ננסה שוב ברענון הבא.",
    "permission": "אין לנו הרשאה לקרוא את המספר הזה. חברו את אינסטגרם מחדש ואשרו את כל ההרשאות.",
}
# Failures where asking again (metric by metric, or for the next window) only spends more
# of the same budget or hits the same dead token.
_STOP_KINDS = {"token", "rate_limited", "unavailable"}


def _account_error_he(exc: GraphError, metric: str, followers: int | None) -> str:
    if metric in FOLLOWER_GATED and followers is not None and followers < MIN_FOLLOWERS:
        return FEW_FOLLOWERS_HE
    return _ACCOUNT_ERROR_HE.get(exc.kind, MISSING_METRIC_HE)


def _count(value) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _ts(day: date) -> int:
    return int(datetime(day.year, day.month, day.day, tzinfo=timezone.utc).timestamp())


def _parse_account(payload: dict) -> tuple[dict, dict]:
    """({metric: number}, {metric: {dimension value: number}}) from an insights answer.

    A metric Meta left out is absent — its docs say an unavailable number comes back as an
    empty data set, not as 0 — so absent stays "not measured" all the way to the screen.
    """
    values: dict = {}
    breakdowns: dict = {}
    for metric in payload.get("data") or []:
        if not isinstance(metric, dict) or not metric.get("name"):
            continue
        name = metric["name"]
        total = metric.get("total_value")
        if isinstance(total, dict):
            value = _count(total.get("value"))
            if value is not None:
                values[name] = value
            parts: dict = {}
            for group in total.get("breakdowns") or []:
                rows = group.get("results") if isinstance(group, dict) else None
                for row in rows or []:
                    if not isinstance(row, dict):
                        continue
                    keys, part = row.get("dimension_values") or [], _count(row.get("value"))
                    if keys and part is not None:
                        # One dimension per request here, so the first key is the bucket.
                        parts[str(keys[0])] = parts.get(str(keys[0]), 0) + part
            if parts:
                breakdowns[name] = parts
                values.setdefault(name, sum(parts.values()))
            continue
        series = [_count(item.get("value")) for item in metric.get("values") or [] if isinstance(item, dict)]
        series = [value for value in series if value is not None]
        if series:
            values[name] = sum(series)
    return values, breakdowns


def account_insights(
    instagram_id: str,
    access_token: str,
    since: date,
    until: date,
    followers: int | None = None,
) -> dict:
    """The account's totals for the days `since` … `until - 1`. Never raises.

    `until` is exclusive, like Meta's own `until`. The plain totals are asked together;
    when Meta fails that request (one unsupported or retired metric fails all of them) each
    is asked alone, and what still fails is recorded in `errors` in Hebrew. The breakdown
    metrics are always asked alone. A token, rate-limit or network failure stops the rest
    and is reported in `stopped`. `followers` (when known) turns Meta's refusal for small
    accounts into the honest "needs 100 followers" instead of a generic error, and skips
    the request altogether below 100.
    """
    window = {
        "start": since.isoformat(),
        "end": (until - timedelta(days=1)).isoformat(),
        "days": (until - since).days,
        "values": {},
        "breakdowns": {},
        "errors": {},
        "stopped": "",
    }
    values, breakdowns, errors = window["values"], window["breakdowns"], window["errors"]
    if not 0 < window["days"] <= ACCOUNT_WINDOW_MAX_DAYS:
        window["errors"] = {name: ACCOUNT_WINDOW_HE for name in ACCOUNT_METRICS}
        return window

    base = {"period": "day", "metric_type": "total_value", "since": _ts(since), "until": _ts(until)}

    def ask(names: tuple[str, ...], breakdown: str = "") -> tuple[dict, dict]:
        params = {**base, "metric": ",".join(names)}
        if breakdown:
            params["breakdown"] = breakdown
        return _parse_account(graph_get(f"{instagram_id}/insights", params, access_token, timeout=20.0))

    def stop(exc: GraphError, pending) -> dict:
        window["stopped"] = exc.kind
        message = _ACCOUNT_ERROR_HE.get(exc.kind, MISSING_METRIC_HE)
        for name in pending:
            if name not in values:
                errors.setdefault(name, message)
        return window

    try:
        got, _ = ask(ACCOUNT_TOTAL_METRICS)
        values.update(got)
        for name in ACCOUNT_TOTAL_METRICS:
            if name not in got:
                errors[name] = MISSING_METRIC_HE
    except GraphError as exc:
        if exc.kind in _STOP_KINDS:
            return stop(exc, ACCOUNT_METRICS)
        for name in ACCOUNT_TOTAL_METRICS:
            try:
                got, _ = ask((name,))
            except GraphError as one:
                if one.kind in _STOP_KINDS:
                    return stop(one, ACCOUNT_METRICS)
                errors[name] = _account_error_he(one, name, followers)
                continue
            if name in got:
                values[name] = got[name]
            else:
                errors[name] = MISSING_METRIC_HE

    for name, dimension in ACCOUNT_BREAKDOWN_METRICS.items():
        if name in FOLLOWER_GATED and followers is not None and followers < MIN_FOLLOWERS:
            errors[name] = FEW_FOLLOWERS_HE
            continue
        got, parts = {}, {}
        try:
            got, parts = ask((name,), dimension)
        except GraphError as exc:
            if exc.kind in _STOP_KINDS:
                return stop(exc, [n for n in ACCOUNT_BREAKDOWN_METRICS if n not in errors])
            if exc.kind != "invalid":
                errors[name] = _account_error_he(exc, name, followers)
                continue
            # The breakdown itself may be what Meta refused; the total is still worth having.
            try:
                got, parts = ask((name,))
            except GraphError as plain:
                if plain.kind in _STOP_KINDS:
                    return stop(plain, [n for n in ACCOUNT_BREAKDOWN_METRICS if n not in errors])
                errors[name] = _account_error_he(plain, name, followers)
                continue
        if name in got:
            values[name] = got[name]
            if parts.get(name):
                breakdowns[name] = parts[name]
        else:
            errors[name] = MISSING_METRIC_HE

    # `follow_type`: FOLLOWER = accounts that followed, NON_FOLLOWER = accounts that
    # unfollowed or left Instagram (Meta's description of the metric). Net only when both
    # sides came back; a missing side is never read as zero.
    follow_parts = breakdowns.get("follows_and_unfollows") or {}
    follows, unfollows = _count(follow_parts.get("FOLLOWER")), _count(follow_parts.get("NON_FOLLOWER"))
    if follows is not None:
        values["follows"] = follows
    if unfollows is not None:
        values["unfollows"] = unfollows
    if follows is not None and unfollows is not None:
        values["net_followers"] = follows - unfollows
    return window


def _new_followers(instagram_id: str, access_token: str, end: date, followers: int | None) -> dict:
    """Legacy `follower_count`: new followers per day, as a sum per window. Never raises.

    No longer in Meta's metric table (only in its limitations: under 100 followers, 30 days
    back, today excluded), so it is a best-effort second source for growth next to
    `follows_and_unfollows`, and a refusal is recorded, not raised.
    """
    if followers is not None and followers < MIN_FOLLOWERS:
        return {"error": FEW_FOLLOWERS_HE}
    since = end - timedelta(days=max(ACCOUNT_WINDOWS))
    try:
        payload = graph_get(
            f"{instagram_id}/insights",
            {"metric": "follower_count", "period": "day", "since": _ts(since), "until": _ts(end)},
            access_token,
            timeout=20.0,
        )
    except GraphError as exc:
        return {"error": _account_error_he(exc, "follower_count", followers), "stopped": exc.kind if exc.kind in _STOP_KINDS else ""}
    daily: dict[str, int] = {}
    for metric in payload.get("data") or []:
        if not isinstance(metric, dict) or metric.get("name") != "follower_count":
            continue
        for item in metric.get("values") or []:
            value = _count(item.get("value")) if isinstance(item, dict) else None
            day = str(item.get("end_time") or "")[:10] if isinstance(item, dict) else ""
            if value is not None and day:
                daily[day] = value
    if not daily:
        return {"error": MISSING_METRIC_HE}
    out: dict = {}
    for days in ACCOUNT_WINDOWS:
        first = (end - timedelta(days=days)).isoformat()
        # `end_time` is the end of the day it counts, so a day's value is stamped the
        # following midnight: keep the stamps inside (first, end].
        picked = [value for day, value in daily.items() if first < day <= end.isoformat()]
        if picked:
            out[str(days)] = sum(picked)
    return out or {"error": MISSING_METRIC_HE}


def account_overview(access_token: str, instagram_id: str, today: date | None = None) -> dict:
    """The `account` block of the performance snapshot. Never raises.

    Followers now (the `followers_count` field), and for the last 7 and 28 days — up to
    yesterday, since today is not in yet — the account totals next to the same length of
    time just before, so the screen and the diagnosis can say "up" or "down" from Meta's
    own numbers. Everything missing is in an `errors` dict in Hebrew, never a zero.
    """
    today = today or date.today()
    end = today
    block: dict = {
        "as_of": today.isoformat(),
        "graph_version": GRAPH_VERSION,
        "metrics_requested": [*ACCOUNT_METRICS, "follower_count", "followers_count"],
        "followers_count": None,
        "new_followers": {},
        "windows": {},
        "errors": {},
        "stopped": "",
    }
    if not instagram_id:
        block["errors"]["account"] = "לדף הפייסבוק שבחרתם לא מקושר חשבון אינסטגרם עסקי."
        return block

    followers: int | None = None
    try:
        profile = graph_get(instagram_id, {"fields": "followers_count,media_count"}, access_token, timeout=20.0)
        followers = _count(profile.get("followers_count"))
        block["media_count"] = _count(profile.get("media_count"))
    except GraphError as exc:
        block["errors"]["followers_count"] = _account_error_he(exc, "followers_count", None)
        if exc.kind in _STOP_KINDS:
            block["stopped"] = exc.kind
            return block
    block["followers_count"] = followers
    if followers is None and "followers_count" not in block["errors"]:
        block["errors"]["followers_count"] = MISSING_METRIC_HE
    if followers is not None and followers < MIN_FOLLOWERS:
        block["few_followers"] = True

    for days in ACCOUNT_WINDOWS:
        current = account_insights(instagram_id, access_token, end - timedelta(days=days), end, followers)
        entry = {"current": current}
        if not current["stopped"]:
            entry["previous"] = account_insights(
                instagram_id, access_token, end - timedelta(days=2 * days), end - timedelta(days=days), followers
            )
        block["windows"][str(days)] = entry
        stopped = current["stopped"] or (entry.get("previous") or {}).get("stopped")
        if stopped:
            block["stopped"] = stopped
            return block

    growth = _new_followers(instagram_id, access_token, end, followers)
    if growth.get("error"):
        block["errors"]["follower_count"] = growth["error"]
        block["stopped"] = growth.get("stopped") or ""
    else:
        block["new_followers"] = growth
    return block


# Words for each account number, shared by the diagnosis facts and the research fact.
ACCOUNT_LABELS_HE = {
    "reach": "אנשים ראו את התוכן",
    "views": "צפיות",
    "accounts_engaged": "אנשים הגיבו לתוכן",
    "total_interactions": "לייקים, תגובות, שמירות ושיתופים",
    "profile_links_taps": "לחיצות על כפתורי הקשר בפרופיל",
    "net_followers": "שינוי במספר העוקבים",
}


def account_digest(block: dict | None, days: int = 28) -> dict | None:
    """One window of the account block, flat: for a prompt, the month review or a fact.

    None when there is no block or nothing in it was measured.
    """
    if not isinstance(block, dict):
        return None
    window = (block.get("windows") or {}).get(str(days)) or {}
    current = window.get("current") or {}
    previous = window.get("previous") or {}
    values = dict(current.get("values") or {})
    if not values and block.get("followers_count") is None:
        return None
    return {
        "days": days,
        "start": current.get("start") or "",
        "end": current.get("end") or "",
        "followers_count": block.get("followers_count"),
        "new_followers": (block.get("new_followers") or {}).get(str(days)),
        "values": values,
        "previous": dict(previous.get("values") or {}),
        "previous_start": previous.get("start") or "",
        "previous_end": previous.get("end") or "",
        "errors": {**(block.get("errors") or {}), **(current.get("errors") or {})},
    }


def snapshot_view(meta_data: dict) -> dict:
    """The sync payload as stored on the snapshot: everything but the full captions."""
    if not meta_data:
        return meta_data
    return {
        **meta_data,
        "posts": [
            {key: value for key, value in post.items() if key != "caption_full"}
            for post in meta_data.get("posts") or []
            if isinstance(post, dict)
        ],
    }


# --- Other accounts: Business Discovery and Hashtag Search ------------------------------

# Business Discovery returns public fields only: no reach, saves or shares for someone
# else's account — likes and comments are all there is, and `like_count` is omitted when
# the owner hides likes.
DISCOVERY_MEDIA_FIELDS = "id,caption,media_type,media_product_type,like_count,comments_count,timestamp,permalink"
DISCOVERY_MEDIA_FIELDS_BASIC = "id,caption,media_type,like_count,comments_count,timestamp,permalink"
DISCOVERY_PROFILE_FIELDS = "username,name,biography,followers_count,media_count"


def business_discovery(instagram_id: str, access_token: str, username: str, media_limit: int = 12) -> dict:
    """The raw `business_discovery` object for one other Business/Creator account.

    Raises `GraphError`. `kind == "not_found"` covers missing, private and personal
    accounts alike, because Meta answers all three the same way.
    """

    def ask(media_fields: str) -> dict:
        fields = (
            f"business_discovery.username({username})"
            f"{{{DISCOVERY_PROFILE_FIELDS},media.limit({media_limit}){{{media_fields}}}}}"
        )
        return graph_get(instagram_id, {"fields": fields}, access_token, timeout=20.0)

    try:
        payload = ask(DISCOVERY_MEDIA_FIELDS)
    except GraphError as exc:
        if exc.kind != "invalid":
            raise
        payload = ask(DISCOVERY_MEDIA_FIELDS_BASIC)
    found = payload.get("business_discovery")
    if not isinstance(found, dict):
        raise GraphError("אינסטגרם לא החזיר את הפרופיל", kind="not_found")
    return found


HASHTAG_MEDIA_FIELDS = "id,caption,media_type,like_count,comments_count,timestamp,permalink"


def hashtag_id(instagram_id: str, access_token: str, tag: str) -> str:
    payload = graph_get("ig_hashtag_search", {"user_id": instagram_id, "q": tag}, access_token)
    data = payload.get("data") or []
    if not data or not isinstance(data[0], dict) or not data[0].get("id"):
        raise GraphError(f"לא מצאנו את ההאשטאג #{tag}", kind="not_found")
    return str(data[0]["id"])


def hashtag_top_media(instagram_id: str, access_token: str, tag_id: str, limit: int = 12) -> list[dict]:
    payload = graph_get(
        f"{tag_id}/top_media",
        {"user_id": instagram_id, "fields": HASHTAG_MEDIA_FIELDS, "limit": limit},
        access_token,
    )
    return [item for item in payload.get("data") or [] if isinstance(item, dict)]
