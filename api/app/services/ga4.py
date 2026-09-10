from datetime import datetime, timedelta, timezone

import httpx
from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import DateRange, Dimension, Metric, RunReportRequest
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request

from app.config import get_settings

GA4_SCOPES = [
    "https://www.googleapis.com/auth/analytics.readonly",
    "openid",
    "email",
]


def ga4_configured() -> bool:
    settings = get_settings()
    return bool(settings.google_client_id and settings.google_client_secret)


def authorization_url(state: str) -> str:
    settings = get_settings()
    if not ga4_configured():
        raise RuntimeError("חסרים GOOGLE_CLIENT_ID ו-GOOGLE_CLIENT_SECRET לחיבור GA4.")
    redirect = f"{settings.api_origin}/integrations/ga4/callback"
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
    query = "&".join(f"{key}={httpx.QueryParams({key: value})[key]}" for key, value in params.items())
    return f"https://accounts.google.com/o/oauth2/v2/auth?{query}"


def exchange_code(code: str) -> dict:
    settings = get_settings()
    redirect = f"{settings.api_origin}/integrations/ga4/callback"
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
        raise RuntimeError(f"החלפת קוד Google נכשלה: {response.text}")
    payload = response.json()
    if "refresh_token" not in payload:
        raise RuntimeError("Google לא החזיר refresh_token. יש להתחבר מחדש עם prompt=consent.")
    expires = datetime.now(timezone.utc) + timedelta(seconds=int(payload.get("expires_in", 3600)))
    return {
        "access_token": payload["access_token"],
        "refresh_token": payload["refresh_token"],
        "expires_at": expires,
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


def list_properties(access_token: str, refresh_token: str, expires_at: datetime | None) -> list[dict]:
    creds = _credentials(access_token, refresh_token, expires_at)
    response = httpx.get(
        "https://analyticsadmin.googleapis.com/v1beta/accountSummaries",
        headers={"Authorization": f"Bearer {creds.token}"},
        timeout=20.0,
    )
    if response.status_code >= 400:
        raise RuntimeError(
            "לא הצלחנו למנות את נכסי GA4. ודאו ש-Google Analytics Admin API מופעל ושלחשבון יש גישה. "
            f"תשובת Google: {response.text}"
        )
    properties = []
    for account in response.json().get("accountSummaries", []):
        for prop in account.get("propertySummaries", []):
            properties.append(
                {
                    "property_id": prop.get("property", "").split("/")[-1],
                    "display_name": prop.get("displayName", ""),
                    "account": account.get("displayName", ""),
                }
            )
    if not properties:
        raise RuntimeError("לא נמצאו נכסי GA4 בחשבון שחובר.")
    return properties


def fetch_report(
    access_token: str,
    refresh_token: str,
    expires_at: datetime | None,
    property_id: str,
    start: str,
    end: str,
) -> dict:
    creds = _credentials(access_token, refresh_token, expires_at)
    client = BetaAnalyticsDataClient(credentials=creds)
    property_name = property_id if property_id.startswith("properties/") else f"properties/{property_id}"

    overview = client.run_report(
        RunReportRequest(
            property=property_name,
            date_ranges=[DateRange(start_date=start, end_date=end)],
            metrics=[
                Metric(name="sessions"),
                Metric(name="engagedSessions"),
                Metric(name="bounceRate"),
                Metric(name="conversions"),
                Metric(name="screenPageViews"),
                Metric(name="averageSessionDuration"),
            ],
        )
    )
    landing = client.run_report(
        RunReportRequest(
            property=property_name,
            date_ranges=[DateRange(start_date=start, end_date=end)],
            dimensions=[Dimension(name="landingPagePlusQueryString"), Dimension(name="sessionDefaultChannelGroup")],
            metrics=[
                Metric(name="sessions"),
                Metric(name="conversions"),
                Metric(name="bounceRate"),
                Metric(name="engagedSessions"),
            ],
            limit=15,
        )
    )
    campaigns = client.run_report(
        RunReportRequest(
            property=property_name,
            date_ranges=[DateRange(start_date=start, end_date=end)],
            dimensions=[
                Dimension(name="sessionCampaignName"),
                Dimension(name="sessionSource"),
                Dimension(name="sessionManualAdContent"),
            ],
            metrics=[
                Metric(name="sessions"),
                Metric(name="conversions"),
                Metric(name="engagedSessions"),
            ],
            limit=30,
        )
    )

    def _rows(report) -> list[dict]:
        metric_names = [h.name for h in report.metric_headers]
        dimension_names = [h.name for h in report.dimension_headers]
        rows = []
        for row in report.rows:
            item = {name: row.dimension_values[i].value for i, name in enumerate(dimension_names)}
            item.update({name: row.metric_values[i].value for i, name in enumerate(metric_names)})
            rows.append(item)
        return rows

    overview_rows = _rows(overview)
    return {
        "property_id": property_id,
        "period": {"start": start, "end": end},
        "overview": overview_rows[0] if overview_rows else {},
        "landing_pages": _rows(landing),
        "campaigns": _rows(campaigns),
    }
