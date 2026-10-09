"""Selected Page post observations, independent of Instagram and advertising.

Meta's Page Insights guide and deprecated-metrics reference checked 9 Oct 2026.
Only lifetime scalar values are accepted: unique media viewers are people, media
views are plays/displays. Neither is a click, purchase, save or Instagram result.
"""
from datetime import datetime, timezone
from urllib.parse import urlsplit, parse_qs

from app.services import meta, meta_marketing

SCOPES = frozenset({"pages_read_engagement", "read_insights"})
METRICS = ("post_total_media_view_unique", "post_media_view")


def read(user_token: str, page_token: str, page_id: str) -> dict:
    # Verify current tasks, rather than treating a saved asset list as current access.
    pages = meta_marketing.collection("me/accounts", {"fields": "id,tasks"}, user_token)
    page = next((p for p in pages if str(p.get("id")) == page_id), None)
    if not page or "ANALYZE" not in (page.get("tasks") or []):
        raise meta.GraphError("Page analyze access missing", kind="permission")
    stamp = datetime.now(timezone.utc).isoformat()
    posts, seen, cursor = [], set(), None
    for _ in range(4):
        query = {"fields": "id,message,created_time,permalink_url", "limit": 25}
        if cursor:
            query["after"] = cursor
        try:
            payload = meta.graph_get(f"{page_id}/published_posts", query, page_token)
            if not isinstance(payload.get("data"), list):
                raise meta.GraphError("Invalid Page response", kind="unavailable")
            for post in payload["data"]:
                if not isinstance(post, dict):
                    continue
                post_id = str(post.get("id") or "")
                # Do not let a mixed/invalid provider row lead to another Page read.
                if not post_id.startswith(page_id + "_") or not post_id[len(page_id) + 1:].isdigit() or post_id in seen:
                    continue
                seen.add(post_id)
                values, observations = {}, {}
                posts.append({"id": post_id, "page_id": page_id, "caption": str(post.get("message") or "")[:300],
                    "timestamp": post.get("created_time"), "permalink": post.get("permalink_url") or "",
                    "insights": values, "observations": observations})
                for name in METRICS:
                    try:
                        response = meta.graph_get(f"{post_id}/insights", {"metric": name, "period": "lifetime"}, page_token)
                    except meta.GraphError as exc:
                        if exc.kind in {"token", "permission", "rate_limited", "unavailable"}:
                            raise
                        continue  # Unsupported metric stays absent, never a made-up zero.
                    for metric in response.get("data") or []:
                        if not isinstance(metric, dict) or metric.get("name") != name or metric.get("period") != "lifetime":
                            continue
                        rows = metric.get("values") or []
                        # Lifetime is one aggregate, not daily bins to sum or take the first of.
                        raw = rows[0].get("value") if len(rows) == 1 and isinstance(rows[0], dict) else None
                        if isinstance(raw, int) and not isinstance(raw, bool) and raw >= 0:
                            values[name] = raw
                            observations[name] = {"source": "facebook", "scope": "cumulative", "period": "lifetime",
                                "account_id": page_id, "media_id": post_id, "provider_metric": name,
                                "permalink": post.get("permalink_url") or "",
                                "read_at": datetime.now(timezone.utc).isoformat()}
            paging = payload.get("paging") or {}
            limited = bool(paging.get("next"))
            after = (paging.get("cursors") or {}).get("after")
            if not limited:
                return {"page_id": page_id, "posts": posts, "read_at": stamp, "status": "ready" if posts else "empty", "limited": False}
            if not isinstance(after, str) or not after or after == cursor:
                break
            cursor = after
        except meta.GraphError as exc:
            return {"page_id": page_id, "posts": posts, "read_at": stamp, "status": "partial" if posts else exc.kind,
                    "failure": exc.kind, "limited": True}
    return {"page_id": page_id, "posts": posts, "read_at": stamp, "status": "partial", "limited": True}


def merge(current: dict, previous: dict) -> dict:
    """Retain successful per-post counts and dates only for the same selected Page."""
    if not current.get("page_id") or current.get("page_id") != previous.get("page_id"):
        return current
    posts = {p["id"]: p for p in previous.get("posts") or [] if isinstance(p, dict) and p.get("page_id") == current["page_id"] and p.get("id")}
    for post in current.get("posts") or []:
        if not isinstance(post, dict) or post.get("page_id") != current["page_id"] or not post.get("id"):
            continue
        prior = posts.get(post["id"]) or {}
        values, stamps = dict(prior.get("insights") or {}), dict(prior.get("observations") or {})
        for name, value in (post.get("insights") or {}).items():
            observed = (post.get("observations") or {}).get(name) or {}
            try:
                older = datetime.fromisoformat(observed["read_at"]) < datetime.fromisoformat(stamps[name]["read_at"])
            except (KeyError, TypeError, ValueError):
                older = False
            if not older:
                values[name], stamps[name] = value, observed
        posts[post["id"]] = {**prior, **post, "insights": values, "observations": stamps}
    current_ids = [p.get("id") for p in current.get("posts") or [] if isinstance(p, dict)]
    ordered = [posts[k] for k in dict.fromkeys(current_ids) if k in posts]
    ordered.extend(p for k, p in posts.items() if k not in current_ids)
    return {**current, "posts": ordered[:200]}


def post_id(url: str, page_id: str) -> str:
    """Known numeric Facebook links only. Opaque permalinks must match exactly."""
    try:
        parsed = urlsplit(str(url or ""))
        if parsed.scheme not in {"http", "https"} or parsed.hostname not in {"facebook.com", "www.facebook.com", "m.facebook.com"}:
            return ""
        parts = parsed.path.strip("/").split("/")
        query = parse_qs(parsed.query)
        if parsed.path in {"/permalink.php", "/story.php"} and query.get("id") == [page_id]:
            identity = (query.get("story_fbid") or [""])[0]
        elif len(parts) == 3 and parts[0] == page_id and parts[1] == "posts":
            identity = parts[2]
        else:
            return ""
        return f"{page_id}_{identity}" if identity.isdigit() else ""
    except ValueError:
        return ""


def permalink_key(url: str) -> str:
    try:
        parsed = urlsplit(str(url or ""))
        if (parsed.scheme in {"http", "https"} and parsed.hostname in {"facebook.com", "www.facebook.com", "m.facebook.com"}
                and parsed.path not in {"/permalink.php", "/story.php"}):
            return parsed.path.rstrip("/")  # Opaque pfbid paths are case-sensitive.
    except ValueError:
        pass
    return ""
