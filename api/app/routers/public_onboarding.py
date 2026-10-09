"""Onboarding v2's anonymous endpoints: the conversation at /start, before signup.

Same stance as `routers/public.py` (the landing-page preview), which this reuses rather
than re-implements — `ratelimit` for budgets and client identity, `netguard` for the
SSRF guard, the preview scan and its cache for the brand:

- No auth and no database session: nothing here can write a row.
- Cost: every endpoint that spends Gemini has a per-IP budget and a global hourly
  ceiling, and only *new* work is charged: a cached or already-running answer is free.
  Invalid bodies are rejected (422) before any budget is touched.
- Concurrency: model calls and site scans each run in a small bounded pool; beyond it
  the visitor is asked to retry (503) instead of queueing work nobody may wait for.
- Time: each request waits a bounded time; a slow answer keeps going in the background
  and lands in the cache for the retry.
- Size: the draft is validated field by field (`onboarding_draft.OnboardingDraft`), and
  the prompts are capped.
- Only `/public/brand` ever fetches a URL, through the preview scan (every hop checked by
  netguard). Audiences and the plan read the brand from the cache only.
- CSRF/origin: the global `csrf_origin_check` middleware in main.py applies to these
  POSTs exactly as to `/public/preview`.

Limits (per hour):

| endpoint              | per IP | global | wait  |
|-----------------------|--------|--------|-------|
| POST /public/brand    | 8      | 150    | 60 s  |
| POST /public/audiences| 30     | 600    | 20 s  |
| POST /public/plan-preview | 10 | 200    | 100 s |
| POST /public/quarter-plan | 24 | 400    | 110 s |
| GET /public/success-options | — | —     | static |
| POST /public/target-suggestion | 240 | — | no model, no network (revision 6) |
| POST /public/strategy | 24     | 400    | 100 s | (revision 4, superseded, unused by the web)
| POST /public/sample-posts | 10 | 200    | 90 s  |
| (sample posts prefetch)   | 12 | —      | background, after each strategy |
| POST /public/links    | 120    | —      | no model, no network |
| GET /public/style-presets | —  | —      | static |

When the model provider cannot serve at all (402 depleted credits, quota, missing key)
the answer is immediate: 503 "השירות לא זמין כרגע, נסו שוב מאוחר יותר." (for /brand, a
`failed` status with that reason). gemini._is_retryable does not retry a 402.
"""

from __future__ import annotations

import threading
from concurrent.futures import Future, ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from datetime import date
from typing import Any, Callable, Literal

from fastapi import APIRouter, Body, HTTPException, Request
from pydantic import BaseModel, Field, ValidationError, field_validator

from app.services import goal_numbers
from app.services import onboarding_draft as drafts
from app.services import preview as preview_service
from app.services import ratelimit
from app.services import strategy_reveal as reveal
from app.services.gemini import is_provider_unavailable
from app.services.netguard import UnsafeUrlError, assert_public_url

router = APIRouter(prefix="/public", tags=["public-onboarding"])

WINDOW_SECONDS = 60 * 60

BRAND_PER_IP = 8
BRAND_GLOBAL = 150
BRAND_REQUEST_SECONDS = 60.0
BRAND_CONCURRENCY = 3

AUDIENCES_PER_IP = 30
AUDIENCES_GLOBAL = 600
AUDIENCES_REQUEST_SECONDS = 20.0

PLAN_PER_IP = 10
PLAN_GLOBAL = 200
PLAN_REQUEST_SECONDS = 100.0

LINKS_PER_IP = 120
# Revision 6: the target is recomputed as the owner types numbers (debounced). No model.
TARGET_PER_IP = 240

# Revision 4. The strategy is re-run on every change the owner makes (debounced on the
# client), so its per-IP budget is higher than the plan's; a cached re-run is free.
STRATEGY_PER_IP = 24
STRATEGY_GLOBAL = 400
STRATEGY_REQUEST_SECONDS = 100.0

QUARTER_PER_IP = 24
QUARTER_GLOBAL = 400
QUARTER_REQUEST_SECONDS = 110.0

SAMPLES_PER_IP = 10
SAMPLES_GLOBAL = 200
SAMPLES_REQUEST_SECONDS = 90.0
SAMPLES_PREFETCH_PER_IP = 12

MODEL_CONCURRENCY = 6
ANSWER_TTL_SECONDS = 30 * 60

BUSY = "יש עומס כרגע. נסו שוב בעוד דקה."
TOO_MANY = "כבר ביקשתם מכאן הרבה בשעה האחרונה. נסו שוב מאוחר יותר, או הירשמו והמשיכו משם."
GLOBAL_CAP = "יש עומס כרגע. נסו שוב בעוד כמה דקות."
PLAN_FAILED = "לא הצלחנו לבנות את ההצעה כרגע. נסו שוב בעוד דקה."
PLAN_SLOW = "זה לוקח יותר זמן מהרגיל. נסו שוב בעוד דקה, ומה שכבר כתבנו יישמר."
AUDIENCES_FAILED = "לא הצלחנו להציע קהלים כרגע. אפשר לכתוב אותם בעצמכם, או לנסות שוב."
BRAND_FAILED = "לא הצלחנו לקרוא את האתר. אפשר לבחור סגנון ולהמשיך."
# The provider cannot serve us at all (billing, quota, key). Said plainly, and at once:
# gemini._is_retryable does not retry a 402, so this answers in about a second.
UNAVAILABLE = "השירות לא זמין כרגע, נסו שוב מאוחר יותר."
BRAND_SLOW = "האתר נטען לאט. נמשיך בלעדיו בינתיים, ואם נצליח לקרוא אותו נעדכן."

STRATEGY_FAILED = "לא הצלחנו לבנות את האסטרטגיה כרגע. נסו שוב בעוד דקה."
QUARTER_FAILED = "לא הצלחנו לבנות את התוכנית כרגע. נסו שוב בעוד דקה."
SAMPLES_FAILED = "לא הצלחנו לכתוב את הפוסטים לדוגמה כרגע. נסו שוב בעוד דקה."

answers = drafts.TTLCache(ANSWER_TTL_SECONDS)
# The strategy last shown per (draft, direction): a re-run with new inputs revises it.
latest = drafts.TTLCache(ANSWER_TTL_SECONDS)


class _Gate:
    """A bounded pool plus in-flight de-duplication, keyed by the work's identity."""

    def __init__(self, size: int, name: str):
        self.pool = ThreadPoolExecutor(max_workers=size, thread_name_prefix=name)
        self.slots = threading.BoundedSemaphore(size)
        self.inflight: dict[str, Future] = {}
        self.lock = threading.Lock()

    def running(self, key: str) -> Future | None:
        with self.lock:
            return self.inflight.get(key)

    def start(self, key: str, fn: Callable[[], object]) -> Future:
        """Start `fn` unless the same key is already running. Raises 503 when full."""
        if not self.slots.acquire(blocking=False):
            raise HTTPException(status_code=503, detail=BUSY)

        def run():
            try:
                return fn()
            finally:
                self.slots.release()
                with self.lock:
                    self.inflight.pop(key, None)

        with self.lock:
            future = self.inflight.get(key)
            if future is not None:
                self.slots.release()
                return future
            future = self.pool.submit(run)
            self.inflight[key] = future
            return future


_models = _Gate(MODEL_CONCURRENCY, "onboarding-model")
_scans = _Gate(BRAND_CONCURRENCY, "onboarding-brand")


def _raise_unavailable(exc: BaseException) -> None:
    if is_provider_unavailable(exc):
        raise HTTPException(status_code=503, detail=UNAVAILABLE) from exc


def _charge(request: Request, name: str, per_ip: int, global_cap: int | None) -> None:
    ip = ratelimit._client_ip(request)
    if not ratelimit.allow(f"{name}:ip:{ip}", per_ip, WINDOW_SECONDS):
        raise HTTPException(status_code=429, detail=TOO_MANY)
    if global_cap is not None and not ratelimit.allow(f"{name}:global", global_cap, WINDOW_SECONDS):
        raise HTTPException(status_code=429, detail=GLOBAL_CAP)


def _cached_or_start(
    request: Request,
    *,
    gate: _Gate,
    key: str,
    name: str,
    per_ip: int,
    global_cap: int,
    work: Callable[[], object],
) -> tuple[object | None, Future | None]:
    """(cached answer, None) or (None, future). Only new work is charged."""
    hit = answers.get(key)
    if hit is not None:
        return hit, None
    future = gate.running(key)
    if future is None:
        _charge(request, name, per_ip, global_cap)

        def job():
            result = work()
            answers.put(key, result)
            return result

        future = gate.start(key, job)
    return None, future


# --- brand ------------------------------------------------------------------------------


def _clip(value, limit: int) -> str:
    return str(value or "").strip()[:limit]


def brand_view(source: dict | None) -> dict | None:
    """The public brand shape, from whatever the preview module hands back.

    Accepts the preview payload (`build_preview`), a scan (`cached_scan`), or a
    `build_brand_preview` result that is either flat or nests the brand under "brand" /
    "brand_language" — so this keeps working whichever way that function lands.
    Model-derived fields only; page text never leaves.
    """
    if not isinstance(source, dict):
        return None
    nested = source.get("brand") if isinstance(source.get("brand"), dict) else {}
    language = source.get("brand_language") if isinstance(source.get("brand_language"), dict) else {}
    extracted = source.get("extracted") if isinstance(source.get("extracted"), dict) else {}

    def pick(*keys):
        for container in (nested, source, language):
            for key in keys:
                value = container.get(key)
                if value:
                    return value
        return None

    palette = []
    for swatch in pick("palette") or []:
        if isinstance(swatch, dict) and isinstance(swatch.get("hex"), str):
            palette.append(
                {
                    "hex": _clip(swatch.get("hex"), 9),
                    "role": _clip(swatch.get("role"), 20) or "secondary",
                    "name": _clip(swatch.get("name"), 40),
                }
            )
    offerings = pick("offerings", "offers_seen") or extracted.get("offers") or []
    logo = _clip(pick("logo_url"), 500)
    if not logo.startswith(("https://", "http://")):
        logo = ""
    name = _clip(pick("business_name") or extracted.get("business_name"), 160)
    if not name and not palette:
        return None
    return {
        "business_name": name,
        "palette": palette[:8],
        "voice": _clip(pick("voice"), 400),
        "logo_url": logo,
        "offerings": [_clip(item, 80) for item in offerings if _clip(item, 80)][:6]
        if isinstance(offerings, list)
        else [],
    }


def cached_brand(url: str) -> dict | None:
    """The brand for a site scanned in the last half hour, from the shared preview cache."""
    if not url:
        return None
    return brand_view(preview_service.cached_scan(url)) or brand_view(preview_service.cached_preview(url))


def _scan_brand(url: str, include_products: bool = False) -> dict | None:
    # Brand only (no sample post), sharing the public preview's scan cache.
    return brand_view(preview_service.build_brand_preview(url, include_products=True) if include_products else preview_service.build_brand_preview(url))


class BrandIn(BaseModel):
    url: str = Field(min_length=4, max_length=300)
    business_model: Literal["products", "services", "both", "saas"] | None = None
    research: bool = False


@router.post("/brand")
def public_brand(body: BrandIn, request: Request) -> dict:
    """Brand colours, voice, logo and offerings for the site typed at step 3.

    Always 200 with `status` — the web calls this in the background and only needs to
    know whether to paint the card — except for 429 (budget) and 503 (busy).
    """
    include_pages = body.research or body.business_model == "saas"
    try:
        url = drafts.normalize_website(body.url)
        key = f"brand:{preview_service.cache_key(url)}" + (":research" if include_pages else "")
    except (drafts.LinkError, ValueError) as exc:
        return {"status": "failed", "brand": None, "reason_he": str(exc)}

    hit = cached_brand(url)
    if hit and (not include_pages or ((preview_service.cached_scan(url) or {}).get("raw") or {}).get("product_research")):
        return {"status": "ready", "brand": hit, "cached": True}

    if _scans.running(key) is None:
        # Refuse internal targets before they cost anyone budget. The scraper checks
        # again on every hop; this is the fast path, not the guard itself.
        try:
            assert_public_url(url)
        except UnsafeUrlError as exc:
            return {"status": "failed", "brand": None, "reason_he": str(exc)}
    _, future = _cached_or_start(
        request,
        gate=_scans,
        key=key,
        name="onboarding-brand",
        per_ip=BRAND_PER_IP,
        global_cap=BRAND_GLOBAL,
        work=lambda: _scan_brand(url, True) if include_pages else _scan_brand(url),
    )
    if future is None:  # cached between the two looks
        return {"status": "ready", "brand": answers.get(key), "cached": True}
    try:
        brand = future.result(timeout=BRAND_REQUEST_SECONDS)
    except FutureTimeout:
        return {"status": "failed", "brand": None, "reason_he": BRAND_SLOW}
    except Exception as exc:
        if is_provider_unavailable(exc):
            return {"status": "failed", "brand": None, "reason_he": UNAVAILABLE}
        if isinstance(exc, preview_service.PreviewError):
            return {"status": "failed", "brand": None, "reason_he": str(exc)}
        # A provider error message is not for an anonymous visitor.
        return {"status": "failed", "brand": None, "reason_he": BRAND_FAILED}
    if not brand:
        return {"status": "failed", "brand": None, "reason_he": BRAND_FAILED}
    return {"status": "ready", "brand": brand, "cached": False}


# --- links (no model, no network) -------------------------------------------------------


class LinksIn(BaseModel):
    links: dict[str, str] = Field(default_factory=dict, max_length=8)


@router.post("/links")
def public_links(body: LinksIn, request: Request) -> dict:
    """Canonical URL + handle for each link typed at step 3, and a Hebrew error per field."""
    _charge(request, "onboarding-links", LINKS_PER_IP, None)
    raw = {key: str(value)[:300] for key, value in body.links.items() if key in {"website", *drafts.SOCIAL_NETWORKS}}
    links, errors = drafts.normalize_links(raw)
    return {"links": links, "errors": errors}


# --- style presets ----------------------------------------------------------------------


@router.get("/style-presets")
def style_presets() -> dict:
    return {"presets": drafts.public_presets()}


# --- revision 5: the goal and the budget (static) ------------------------------------------


@router.get("/success-options")
def success_options(model: str = "products", grow_where: str | None = None) -> dict:
    """The "מה ייחשב הצלחה" choices for a business model and where it wants to grow,
    plus the budget chips. No model, no network."""
    model = model if model in {"products", "services", "both", "saas"} else "products"
    return {
        "options": drafts.success_options(model, grow_where),
        "grow_where": [{"key": k, "name_he": v} for k, v in drafts.GROW_WHERE_HE.items()] if model not in {"services", "saas"} else [],
        "budgets": [{"key": k, "label_he": v["label_he"]} for k, v in drafts.BUDGET_RANGES.items()],
    }


# --- revision 6: the calculated 3-month target (no model) ---------------------------------


@router.post("/target-suggestion")
def public_target_suggestion(request: Request, body: Any = Body(...)) -> dict:
    """"היעד ל-3 חודשים": the baseline said back, the lever the numbers point to, and a
    calculated target with its math, unit economics and sources (services/goal_numbers).

    Deterministic and fast: no model, no network, nothing written. The body is validated
    here so a 422 says what is wrong in Hebrew; an invalid body costs no budget.
    """
    if not isinstance(body, dict) or not isinstance(body.get("draft"), dict):
        raise HTTPException(status_code=422, detail="חסרות התשובות. רעננו את העמוד ונסו שוב.")
    try:
        draft = drafts.OnboardingDraft.model_validate(body["draft"])
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=goal_numbers.errors_he(exc.errors())) from exc
    _charge(request, "onboarding-target", TARGET_PER_IP, None)
    return goal_numbers.suggest(draft)


# --- audiences --------------------------------------------------------------------------


class DraftIn(BaseModel):
    locale: Literal["he", "en", "ar", "ru"] = "he"
    draft: drafts.OnboardingDraft


@router.post("/discovery")
def public_discovery(body: DraftIn, request: Request) -> dict:
    from app.services.discovery_interview import research_questions, evidence_revision
    hit, future = _cached_or_start(request, gate=_models, key=body.draft.fingerprint("discovery:" + body.locale + ":" + evidence_revision(body.draft)),
        name="onboarding-discovery", per_ip=10, global_cap=200,
        work=lambda: research_questions(body.draft, locale=body.locale))
    if hit is not None:
        return hit
    try:
        return future.result(timeout=30)
    except FutureTimeout as exc:
        raise HTTPException(status_code=504, detail="הקריאה נמשכת. אפשר להמשיך בלי להמתין ולבדוק בהמשך.") from exc


@router.post("/audiences")
def public_audiences(body: DraftIn, request: Request) -> dict:
    """Three audience suggestions for step 4. Lite model."""
    draft = body.draft
    key = draft.fingerprint("audiences")
    hit, future = _cached_or_start(
        request,
        gate=_models,
        key=key,
        name="onboarding-audiences",
        per_ip=AUDIENCES_PER_IP,
        global_cap=AUDIENCES_GLOBAL,
        work=lambda: {"audiences": drafts.suggest_audiences(draft)},
    )
    if hit is not None:
        return hit
    try:
        return future.result(timeout=AUDIENCES_REQUEST_SECONDS)
    except FutureTimeout as exc:
        raise HTTPException(status_code=504, detail=AUDIENCES_FAILED) from exc
    except Exception as exc:
        _raise_unavailable(exc)
        raise HTTPException(status_code=502, detail=AUDIENCES_FAILED) from exc


# --- the plan preview -------------------------------------------------------------------


class PlanPreviewIn(DraftIn):
    # "משהו אחר? ספרו לנו": the owner's words about the two directions. The answer then
    # carries two revised directions (and their ideas), cached apart from the first plan.
    feedback: str = Field(default="", max_length=600)

    @field_validator("feedback")
    @classmethod
    def _feedback(cls, value: str) -> str:
        text = drafts.clean_text(value, 400)
        return drafts._readable(text, "מה לשנות") if text else ""


@router.post("/plan-preview")
def public_plan_preview(body: PlanPreviewIn, request: Request) -> dict:
    """Step 6, "מה למדנו ואיך מתקדמים": insights → 2 directions → 3 ideas per direction."""
    draft = body.draft
    today = date.today()
    # The calendar is part of the answer, so a new day is a new answer.
    first_key = draft.fingerprint(f"plan:{today.isoformat()}")
    key = first_key if not body.feedback else draft.fingerprint(f"plan:{today.isoformat()}:revise:{body.feedback}")

    def work() -> dict:
        previous = answers.get(first_key) if body.feedback else None
        result = drafts.build_plan_preview(draft, today=today, feedback=body.feedback, previous=previous)
        return {**result, "brand": cached_brand(draft.links.website)}

    hit, future = _cached_or_start(
        request,
        gate=_models,
        key=key,
        name="onboarding-plan",
        per_ip=PLAN_PER_IP,
        global_cap=PLAN_GLOBAL,
        work=work,
    )
    if hit is not None:
        return {**hit, "cached": True}
    try:
        result = future.result(timeout=PLAN_REQUEST_SECONDS)
    except FutureTimeout as exc:
        raise HTTPException(status_code=504, detail=PLAN_SLOW) from exc
    except Exception as exc:
        _raise_unavailable(exc)
        raise HTTPException(status_code=502, detail=PLAN_FAILED) from exc
    return {**result, "cached": False}


# --- the strategy (revision 4) ------------------------------------------------------------


class StrategyRequest(BaseModel):
    draft: drafts.OnboardingDraft
    direction: drafts.DirectionIn
    # All the owner's current inputs, every time.
    inputs: reveal.StrategyInputs | None = None
    # Which of the inputs this request changes; `changed_he` describes exactly those.
    changed: list[Literal["target", "cadence", "primary_audience", "pillars_removed", "feedback"]] | None = Field(
        default=None, max_length=5
    )
    # The insights the owner saw (the web sends them back). `from_insight` indexes this
    # list; without it, the plan preview's own cached answer is used.
    insights: list[reveal.InsightIn] | None = Field(default=None, max_length=4)


def _plan_insights(draft: drafts.OnboardingDraft, today: date, sent: list | None) -> list[dict]:
    if sent:
        return [item.model_dump() for item in sent]
    plan = answers.get(draft.fingerprint(f"plan:{today.isoformat()}"))
    return list((plan or {}).get("insights") or [])


def _samples_key(draft: drafts.OnboardingDraft, direction: dict, strategy: dict, today: date) -> str:
    return draft.fingerprint(f"samples:{today.isoformat()}:{reveal.signature([direction, strategy])}")


def _prefetch_samples(ip: str, draft: drafts.OnboardingDraft, direction: dict, strategy: dict, today: date) -> None:
    """Start writing the week-1 posts for a strategy as soon as it exists.

    The owner reads (and maybe adjusts) the strategy before the next screen, and the
    post writer (Muse) needs about a minute, so by the time `/public/sample-posts`
    is called the answer is usually cached or in flight (joined, not charged again).
    Its own small budget; when that is spent, or the pool is full, nothing starts and
    the explicit call works as before.
    """
    try:
        stored = reveal.StrategyIn(**strategy).stored()
    except Exception:
        return
    key = _samples_key(draft, direction, stored, today)
    if answers.get(key) is not None or _models.running(key) is not None:
        return
    if not ratelimit.allow(f"onboarding-samples-prefetch:ip:{ip}", SAMPLES_PREFETCH_PER_IP, WINDOW_SECONDS):
        return

    def job():
        result = reveal.build_sample_posts(draft, direction, stored, today=today)
        answers.put(key, result)
        return result

    try:
        _models.start(key, job)
    except HTTPException:
        pass


@router.post("/strategy")
def public_strategy(body: StrategyRequest, request: Request) -> dict:
    """Revision 4, "האסטרטגיה": the one-page strategy for the chosen direction.

    With `inputs` it is a revision of the strategy last shown for this draft and
    direction, with `changed_he`. Cached by (draft, direction, inputs, changed, day).
    """
    draft = body.draft
    today = date.today()
    ip = ratelimit._client_ip(request)
    direction = body.direction.model_dump()
    inputs = body.inputs.normalized() if body.inputs else {}
    changed = list(dict.fromkeys(body.changed)) if body.changed is not None else None
    base_key = draft.fingerprint(f"strategy-base:{reveal.signature(direction)}")
    key = draft.fingerprint(f"strategy:{today.isoformat()}:{reveal.signature([direction, inputs, changed])}")
    insights = _plan_insights(draft, today, body.insights)

    def work() -> dict:
        # The photo check for the sample posts runs beside the strategy, so the next
        # screen finds it cached (cache reads only: the site was read by /public/brand).
        if draft.links.website:
            reveal.background.submit(reveal.site_photos, draft)
        last = latest.get(base_key) if (inputs or changed) else None
        previous = last["strategy"] if last and (last["inputs"] != inputs or changed) else None
        result = reveal.build_strategy(
            draft, direction, inputs=inputs, insights=insights, today=today,
            previous=previous, previous_inputs=last["inputs"] if previous else None, changed=changed,
        )
        _prefetch_samples(ip, draft, direction, result, today)
        return result

    hit, future = _cached_or_start(
        request,
        gate=_models,
        key=key,
        name="onboarding-strategy",
        per_ip=STRATEGY_PER_IP,
        global_cap=STRATEGY_GLOBAL,
        work=work,
    )
    if hit is not None:
        latest.put(base_key, {"inputs": inputs, "strategy": hit})
        _prefetch_samples(ip, draft, direction, hit, today)
        return {**hit, "cached": True}
    try:
        result = future.result(timeout=STRATEGY_REQUEST_SECONDS)
    except FutureTimeout as exc:
        raise HTTPException(status_code=504, detail=PLAN_SLOW) from exc
    except Exception as exc:
        _raise_unavailable(exc)
        raise HTTPException(status_code=502, detail=STRATEGY_FAILED) from exc
    latest.put(base_key, {"inputs": inputs, "strategy": result})
    return {**result, "cached": False}


class SamplePostsRequest(BaseModel):
    draft: drafts.OnboardingDraft
    direction: drafts.DirectionIn
    strategy: reveal.StrategyIn


@router.post("/sample-posts")
def public_sample_posts(body: SamplePostsRequest, request: Request) -> dict:
    """Revision 4, "ככה זה ייראה": three week-1 posts by the product's post writer.

    Usually already written (or being written) since the strategy was shown; see
    `_prefetch_samples`. Send the strategy back as `/public/strategy` returned it.
    """
    draft = body.draft
    today = date.today()
    direction = body.direction.model_dump()
    strategy = body.strategy.stored()
    key = _samples_key(draft, direction, strategy, today)
    hit, future = _cached_or_start(
        request,
        gate=_models,
        key=key,
        name="onboarding-samples",
        per_ip=SAMPLES_PER_IP,
        global_cap=SAMPLES_GLOBAL,
        work=lambda: reveal.build_sample_posts(draft, direction, strategy, today=today),
    )
    if hit is not None:
        return {**hit, "cached": True}
    try:
        result = future.result(timeout=SAMPLES_REQUEST_SECONDS)
    except FutureTimeout as exc:
        raise HTTPException(status_code=504, detail=PLAN_SLOW) from exc
    except Exception as exc:
        _raise_unavailable(exc)
        raise HTTPException(status_code=502, detail=SAMPLES_FAILED) from exc
    return {**result, "cached": False}


# --- revision 5: the 3-month plan ---------------------------------------------------------


class QuarterInputs(reveal.StrategyInputs):
    changed: list[Literal["target", "cadence", "primary_audience", "feedback"]] | None = Field(
        default=None, max_length=4
    )


class QuarterPlanRequest(BaseModel):
    draft: drafts.OnboardingDraft
    direction: drafts.DirectionIn
    # All the owner's current inputs every time, with `changed` naming what this request
    # changes (`changed_he` describes exactly those).
    inputs: QuarterInputs | None = None
    insights: list[reveal.InsightIn] | None = Field(default=None, max_length=4)


@router.post("/quarter-plan")
def public_quarter_plan(body: QuarterPlanRequest, request: Request) -> dict:
    """Revision 5: "התוכנית שלכם ל-3 החודשים הקרובים" (services/quarter_plan.py).

    With inputs it revises the plan last shown for this draft and direction. Cached by
    (draft, direction, inputs, changed, day); only new work is charged.
    """
    from app.services import quarter_plan as quarter

    draft = body.draft
    today = date.today()
    direction = body.direction.model_dump()
    raw = body.inputs.model_dump(mode="json") if body.inputs else {}
    changed = list(dict.fromkeys(raw.pop("changed", None) or [])) if raw.get("changed") is not None else None
    raw.pop("changed", None)
    raw.pop("pillars_removed", None)
    inputs = {k: v for k, v in raw.items() if v not in ("", None, [])}
    base_key = draft.fingerprint(f"quarter-base:{reveal.signature(direction)}")
    key = draft.fingerprint(f"quarter:{today.isoformat()}:{reveal.signature([direction, inputs, changed])}")
    insights = _plan_insights(draft, today, body.insights)

    def work() -> dict:
        last = latest.get(base_key) if (inputs or changed) else None
        previous = last["plan"] if last and (last["inputs"] != inputs or changed) else None
        return quarter.build_quarter_plan(
            draft, direction, inputs=inputs, insights=insights, today=today,
            previous=previous, previous_inputs=last["inputs"] if previous else None, changed=changed,
        )

    hit, future = _cached_or_start(
        request,
        gate=_models,
        key=key,
        name="onboarding-quarter",
        per_ip=QUARTER_PER_IP,
        global_cap=QUARTER_GLOBAL,
        work=work,
    )
    if hit is not None:
        latest.put(base_key, {"inputs": inputs, "plan": hit})
        return {**hit, "cached": True}
    try:
        result = future.result(timeout=QUARTER_REQUEST_SECONDS)
    except FutureTimeout as exc:
        raise HTTPException(status_code=504, detail=PLAN_SLOW) from exc
    except Exception as exc:
        _raise_unavailable(exc)
        raise HTTPException(status_code=502, detail=QUARTER_FAILED) from exc
    latest.put(base_key, {"inputs": inputs, "plan": result})
    return {**result, "cached": False}
