from datetime import datetime, timedelta, timezone
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
    "pages_read_user_content",
    "instagram_basic",
    "instagram_manage_insights",
    "business_management",
]


def meta_configured() -> bool:
    settings = get_settings()
    return bool(settings.meta_app_id and settings.meta_app_secret)


def authorization_url(state: str) -> str:
    settings = get_settings()
    if not meta_configured():
        raise RuntimeError("חסרים META_APP_ID ו-META_APP_SECRET לחיבור מטא.")
    redirect = f"{settings.api_origin}/integrations/meta/callback"
    query = urlencode(
        {
            "client_id": settings.meta_app_id,
            "redirect_uri": redirect,
            "state": state,
            "scope": ",".join(META_SCOPES),
            "response_type": "code",
        }
    )
    return f"https://www.facebook.com/{GRAPH_VERSION}/dialog/oauth?{query}"


def exchange_code(code: str) -> dict:
    settings = get_settings()
    redirect = f"{settings.api_origin}/integrations/meta/callback"
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
        raise RuntimeError(f"החלפת קוד מטא נכשלה: {short.text}")
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
        raise RuntimeError(f"הארכת טוקן מטא נכשלה: {long_lived.text}")
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
    response = httpx.get(
        f"{GRAPH}/me/accounts",
        params={"fields": "id,name,access_token,instagram_business_account", "access_token": access_token},
        timeout=20.0,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"שליפת דפי מטא נכשלה: {response.text}")
    pages = []
    for page in response.json().get("data", []):
        ig = (page.get("instagram_business_account") or {}).get("id", "")
        pages.append(
            {
                "page_id": page["id"],
                "display_name": page.get("name", ""),
                "page_access_token": page.get("access_token", ""),
                "instagram_id": ig,
            }
        )
    if not pages:
        raise RuntimeError("לא נמצאו דפי פייסבוק בחשבון שחובר.")
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
        raise GraphError(f"אין תקשורת עם מטא ({exc.__class__.__name__})", kind="unavailable") from exc
    if response.status_code >= 400:
        raise graph_error(response)
    try:
        payload = response.json()
    except ValueError as exc:
        raise GraphError("מטא החזירה תשובה שאינה JSON", status=response.status_code) from exc
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
MISSING_METRIC_HE = "מטא לא החזירה את המדד"


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
        raise RuntimeError("לדף שנבחר אין חשבון Instagram Business מחובר. חברו IG עסקי בדף ואז סנכרנו שוב.")

    try:
        media = _list_media(instagram_id, page_access_token, 20)
    except GraphError as exc:
        raise RuntimeError(f"שליפת מדיה מאינסטגרם נכשלה: {exc}") from exc

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

    page = httpx.get(
        f"{GRAPH}/{page_id}",
        params={"fields": "name,fan_count", "access_token": page_access_token},
        timeout=20.0,
    )
    if page.status_code >= 400:
        raise RuntimeError(f"שליפת נתוני דף נכשלה: {page.text}")

    return {
        "page": page.json(),
        "instagram_id": instagram_id,
        "posts": posts,
        "graph_version": GRAPH_VERSION,
        "metrics_requested": list(INSIGHT_METRICS),
        # {"views": 3} = three posts came back without views. Said out loud so a missing
        # number reads as "not measured" and never as zero.
        "metric_failures": failed_metrics,
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
        raise GraphError("מטא לא החזירה פרופיל", kind="not_found")
    return found


HASHTAG_MEDIA_FIELDS = "id,caption,media_type,like_count,comments_count,timestamp,permalink"


def hashtag_id(instagram_id: str, access_token: str, tag: str) -> str:
    payload = graph_get("ig_hashtag_search", {"user_id": instagram_id, "q": tag}, access_token)
    data = payload.get("data") or []
    if not data or not isinstance(data[0], dict) or not data[0].get("id"):
        raise GraphError(f"לא נמצא האשטאג #{tag}", kind="not_found")
    return str(data[0]["id"])


def hashtag_top_media(instagram_id: str, access_token: str, tag_id: str, limit: int = 12) -> list[dict]:
    payload = graph_get(
        f"{tag_id}/top_media",
        {"user_id": instagram_id, "fields": HASHTAG_MEDIA_FIELDS, "limit": limit},
        access_token,
    )
    return [item for item in payload.get("data") or [] if isinstance(item, dict)]
