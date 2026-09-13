from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx

from app.config import get_settings

GRAPH = "https://graph.facebook.com/v21.0"
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
    return f"https://www.facebook.com/v21.0/dialog/oauth?{query}"


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


def fetch_insights(page_access_token: str, instagram_id: str, page_id: str) -> dict:
    if not instagram_id:
        raise RuntimeError("לדף שנבחר אין חשבון Instagram Business מחובר. חברו IG עסקי בדף ואז סנכרנו שוב.")

    media = httpx.get(
        f"{GRAPH}/{instagram_id}/media",
        params={
            "fields": "id,caption,timestamp,media_type,permalink,like_count,comments_count,insights.metric(impressions,reach,saved,shares)",
            "limit": 20,
            "access_token": page_access_token,
        },
        timeout=30.0,
    )
    if media.status_code >= 400:
        raise RuntimeError(f"שליפת מדיה מאינסטגרם נכשלה: {media.text}")

    posts = []
    for item in media.json().get("data", []):
        insights = {}
        for metric in (item.get("insights") or {}).get("data", []):
            values = metric.get("values") or []
            insights[metric.get("name")] = values[0].get("value") if values else None
        posts.append(
            {
                "id": item.get("id"),
                "caption": (item.get("caption") or "")[:280],
                "timestamp": item.get("timestamp"),
                "media_type": item.get("media_type"),
                "permalink": item.get("permalink"),
                "like_count": item.get("like_count"),
                "comments_count": item.get("comments_count"),
                "insights": insights,
            }
        )

    page = httpx.get(
        f"{GRAPH}/{page_id}",
        params={"fields": "name,fan_count", "access_token": page_access_token},
        timeout=20.0,
    )
    if page.status_code >= 400:
        raise RuntimeError(f"שליפת נתוני דף נכשלה: {page.text}")

    return {"page": page.json(), "instagram_id": instagram_id, "posts": posts}
