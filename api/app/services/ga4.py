from datetime import datetime, timedelta, timezone
from time import monotonic
from urllib.parse import urlencode

import httpx
from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import DateRange, Dimension, Metric, OrderBy, RunReportRequest
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request

from app.config import get_settings

GA4_SCOPES = [
    "https://www.googleapis.com/auth/analytics.readonly",
    # Search Console is what lets the promotion endpoints show the queries the site
    # already ranks for, with real clicks and impressions. `include_granted_scopes` in
    # authorization_url means an existing connection re-consents incrementally instead
    # of losing the Analytics grant it already has.
    "https://www.googleapis.com/auth/webmasters.readonly",
    "openid",
    "email",
]


class Ga4AccessError(RuntimeError):
    def __init__(self, status: str):
        super().__init__("Google Analytics access unavailable")
        self.readiness_status = status


def ga4_configured() -> bool:
    settings = get_settings()
    return bool(settings.google_client_id and settings.google_client_secret)


def redirect_uri() -> str:
    """On the public web origin, through the /backend proxy: in the documented deployment
    the API itself is not reachable from the internet (config.oauth_redirect_base)."""
    return f"{get_settings().oauth_callback_base()}/integrations/ga4/callback"


def authorization_url(state: str, login_hint: str = "") -> str:
    """Google's consent screen for Analytics + Search Console.

    Incremental authorization on top of "להמשיך עם Google": `login_hint` (the linked Google
    account id, or the account email) pre-selects the account the owner signed in with,
    and `include_granted_scopes` folds the new scopes into the grant that account already
    gave. The owner can still pick another account; the callback notices and says so.
    """
    settings = get_settings()
    if not ga4_configured():
        raise RuntimeError("חסרים GOOGLE_CLIENT_ID ו-GOOGLE_CLIENT_SECRET לחיבור GA4.")
    redirect = redirect_uri()
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": redirect,
        "response_type": "code",
        "scope": " ".join(GA4_SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": state,
    }
    if login_hint:
        params["login_hint"] = login_hint
    query = urlencode(params)
    return f"https://accounts.google.com/o/oauth2/v2/auth?{query}"


def exchange_code(code: str) -> dict:
    settings = get_settings()
    redirect = redirect_uri()
    response = httpx.post(
        "https://oauth2.googleapis.com/token",
        data={
            "code": code,
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uri": redirect,
            "grant_type": "authorization_code",
        },
        timeout=20.0,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"לא הצלחנו להשלים את החיבור לגוגל: {response.text}")
    payload = response.json()
    if "refresh_token" not in payload:
        raise RuntimeError("גוגל לא נתן לנו הרשאה קבועה. חברו את גוגל מחדש ואשרו את כל ההרשאות.")
    expires = datetime.now(timezone.utc) + timedelta(seconds=int(payload.get("expires_in", 3600)))
    return {
        "access_token": payload["access_token"],
        "refresh_token": payload["refresh_token"],
        "expires_at": expires,
        # What Google actually granted, which is not always what was asked for. Stored so
        # Search Console can be reported as "not granted" instead of failing silently.
        "scopes": [scope for scope in (payload.get("scope") or "").split(" ") if scope],
        # `openid email` is in the scopes, so Google says which account granted this. Used
        # only to compare with the account the owner signs in with; never stored raw.
        "id_token": payload.get("id_token") or "",
    }


def _credentials(access_token: str, refresh_token: str, expires_at: datetime | None) -> Credentials:
    settings = get_settings()
    creds = Credentials(
        token=access_token,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        scopes=GA4_SCOPES,
        expiry=expires_at.replace(tzinfo=None) if expires_at else None,
    )
    if not creds.valid:
        creds.refresh(Request())
    return creds


def fresh_access_token(access_token: str, refresh_token: str, expires_at: datetime | None) -> str:
    """A currently valid access token, for any Google API this connection was granted.

    Refreshes only when the stored token has expired, so the Search Console calls in
    `keywords.py` can reuse the same stored connection as the GA4 reports.
    """
    return _credentials(access_token, refresh_token, expires_at).token


def list_properties(access_token: str, refresh_token: str, expires_at: datetime | None) -> list[dict]:
    creds = _credentials(access_token, refresh_token, expires_at)
    properties = []
    page_token = ""
    seen = set()
    while True:
        response = httpx.get(
            "https://analyticsadmin.googleapis.com/v1beta/accountSummaries",
            headers={"Authorization": f"Bearer {creds.token}"},
            params={"pageToken": page_token} if page_token else {}, timeout=20.0,
        )
        if response.status_code >= 400:
            status = "reconnect" if response.status_code in (401, 403) else "unavailable"
            if "SERVICE_DISABLED" in response.text:
                status = "unavailable"
            raise Ga4AccessError(status)
        payload = response.json()
        for account in payload.get("accountSummaries", []):
            for prop in account.get("propertySummaries", []):
                properties.append({"property_id": prop.get("property", "").split("/")[-1],
                                   "display_name": prop.get("displayName", ""),
                                   "account": account.get("displayName", "")})
        page_token = payload.get("nextPageToken") or ""
        if not page_token:
            break
        if page_token in seen or len(seen) >= 100:
            raise Ga4AccessError("unavailable")
        seen.add(page_token)
    return properties


def fetch_report(
    access_token: str,
    refresh_token: str,
    expires_at: datetime | None,
    property_id: str,
    start: str,
    end: str,
    *,
    overview_only: bool = False,
) -> dict:
    creds = _credentials(access_token, refresh_token, expires_at)
    client = BetaAnalyticsDataClient(credentials=creds)
    property_name = property_id if property_id.startswith("properties/") else f"properties/{property_id}"

    def _rows(report) -> list[dict]:
        metric_names = [h.name for h in report.metric_headers]
        dimension_names = [h.name for h in report.dimension_headers]
        rows = []
        for row in report.rows:
            item = {name: row.dimension_values[i].value for i, name in enumerate(dimension_names)}
            item.update({name: row.metric_values[i].value for i, name in enumerate(metric_names)})
            rows.append(item)
        return rows

    # Keep the stored `conversions` key for existing consumers; Google now calls
    # this metric keyEvents. It is not a count of confirmed customers or orders.
    def read(dimensions, metrics, limit=0, order="", timeout=15):
        request = RunReportRequest(
            property=property_name,
            date_ranges=[DateRange(start_date=start, end_date=end)],
            dimensions=[Dimension(name=name) for name in dimensions],
            metrics=[Metric(name=name) for name in metrics],
            limit=limit,
            order_bys=[OrderBy(metric=OrderBy.MetricOrderBy(metric_name=order), desc=True)] if order else [],
        )
        rows = _rows(client.run_report(request, timeout=timeout, retry=None))
        for row in rows:
            if "keyEvents" in row:
                row["conversions"] = row.pop("keyEvents")
        return rows

    deadline = monotonic() + 25
    overview = read([], ["sessions", "engagedSessions", "bounceRate", "keyEvents",
                         "screenPageViews", "averageSessionDuration"])
    result = {"property_id": property_id, "period": {"start": start, "end": end},
              "overview": overview[0] if overview else {}, "report_scope": "overview"}
    if overview_only:
        return result
    # A failed optional breakdown must not discard a successful overview. Bound the
    # entire read, including the first connection, and label unavailable/truncated
    # reports explicitly so the analysis cannot mistake missing rows for no activity.
    sections = {
        "channels": (["sessionDefaultChannelGroup", "sessionSourceMedium"],
                     ["sessions", "engagedSessions", "keyEvents"], 30, "sessions"),
        "landing_pages": (["landingPagePlusQueryString", "sessionDefaultChannelGroup"],
                          ["sessions", "keyEvents", "bounceRate", "engagedSessions"], 15, "sessions"),
        "campaigns": (["sessionCampaignName", "sessionSource", "sessionManualAdContent"],
                      ["sessions", "keyEvents", "engagedSessions"], 30, "sessions"),
        "events": (["eventName"], ["eventCount", "keyEvents"], 30, "eventCount"),
    }
    result["report_reads"] = {}
    for name, (dimensions, metrics, limit, order) in sections.items():
        remaining = deadline - monotonic()
        try:
            if remaining <= 0:
                raise TimeoutError("read budget reached")
            rows = read(dimensions, metrics, limit, order, timeout=min(6, remaining))
            result[name] = rows
            result["report_reads"][name] = {"status": "available" if rows else "empty",
                                          "limit": limit, "limited": len(rows) >= limit}
        except Exception:
            result["report_reads"][name] = {"status": "unavailable"}
    result["report_scope"] = "detailed" if all(
        row["status"] != "unavailable" for row in result["report_reads"].values()) else "partial"
    return result
