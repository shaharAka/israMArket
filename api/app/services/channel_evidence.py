"""Validated channel economics evidence, without fetching or generating numbers.

Account observations, official forecasts and publisher benchmarks have different
meanings. This contract keeps them separate when supplied to research/planning.
"""
from __future__ import annotations

import json
from datetime import date
from typing import Literal
from urllib.parse import parse_qs, urlparse

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, ValidationError, field_validator, model_validator

_MONEY = {"cpc", "cpm", "cpa", "cpl", "spend", "revenue"}
_RATES = {"ctr", "conversion_rate"}
_COUNTS = {"clicks", "impressions", "conversions", "reach"}
_RESULTS = {"cpa", "cpl", "conversion_rate", "conversions", "revenue", "roas"}
MAX_RECORDS = 30


class ChannelEvidence(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    kind: Literal["account_result", "provider_forecast", "published_benchmark"]
    channel: Literal["google_search", "microsoft_search", "search_mixed", "meta", "facebook", "instagram"]
    metric: Literal["cpc", "cpm", "cpa", "cpl", "ctr", "conversion_rate", "spend", "clicks", "impressions", "conversions", "reach", "revenue", "roas"]
    # Account totals can span objectives/geographies that the provider omits.
    # Preserve that absence instead of guessing a campaign configuration.
    objective: str = Field(default="unknown", min_length=1, max_length=100)
    location: str = Field(default="unknown", min_length=1, max_length=150)
    unit: Literal["money", "count", "percent", "fraction", "ratio"]
    currency: str | None = None
    statistic: Literal["aggregate", "point", "mean", "median", "range"]
    value: float | None = Field(default=None, ge=0, le=1_000_000_000)
    lower: float | None = Field(default=None, ge=0, le=1_000_000_000)
    upper: float | None = Field(default=None, ge=0, le=1_000_000_000)
    source_url: HttpUrl
    source_date: date
    period_start: date
    period_end: date
    sample_size: int | None = Field(default=None, ge=1, le=1_000_000_000, strict=True)
    methodology: str | None = Field(default=None, min_length=10, max_length=1000)
    result_definition: str | None = Field(default=None, min_length=3, max_length=400)
    assumptions: list[str] = Field(default_factory=list, max_length=8)

    @field_validator("objective", "location", "methodology", "result_definition")
    @classmethod
    def meaningful_text(cls, value):
        if value is not None:
            value = value.strip()
            if not value:
                raise ValueError("Evidence labels cannot be blank")
        return value

    @field_validator("assumptions")
    @classmethod
    def bounded_assumptions(cls, values):
        if any(not value.strip() or len(value) > 400 for value in values):
            raise ValueError("Assumptions must be nonblank and bounded")
        return values

    @field_validator("value", "lower", "upper", mode="before")
    @classmethod
    def numbers_are_not_flags(cls, value):
        if isinstance(value, bool):
            raise ValueError("A boolean is not a measured number")
        return value

    @field_validator("source_url")
    @classmethod
    def source_has_no_credentials(cls, value):
        parsed = urlparse(str(value))
        secret_keys = {"access_token", "token", "api_key", "client_secret", "password"}
        if parsed.username or parsed.password or secret_keys.intersection(key.lower() for key in parse_qs(parsed.query)):
            raise ValueError("Use a source link without credentials")
        return value

    @model_validator(mode="after")
    def evidence_contract(self):
        if self.source_date > date.today():
            raise ValueError("A publication/read source date cannot be in the future")
        if self.kind != "account_result" and any(value.lower() in {"unknown", "mixed"} for value in (self.objective, self.location)):
            raise ValueError("Forecasts and benchmarks need their actual objective and location")
        if self.statistic == "range":
            if self.value is not None or self.lower is None or self.upper is None or self.upper < self.lower:
                raise ValueError("A sourced range needs ordered bounds and no point value")
            values = (self.lower, self.upper)
        else:
            if self.value is None or self.lower is not None or self.upper is not None:
                raise ValueError("A point, mean or median needs one value and no invented bounds")
            values = (self.value,)
        if self.metric in _MONEY:
            if self.unit != "money" or not self.currency or len(self.currency) != 3 or not self.currency.isascii() or not self.currency.isalpha() or not self.currency.isupper():
                raise ValueError("Money metrics require a three-letter currency and money unit")
        elif self.currency is not None:
            raise ValueError("Non-money metrics cannot carry a currency")
        if self.metric in _COUNTS and (self.unit != "count" or any(value != int(value) for value in values)):
            raise ValueError("Counts must be whole numbers with count units")
        if self.metric in _RATES and (self.unit not in {"percent", "fraction"} or any(value > (100 if self.unit == "percent" else 1) for value in values)):
            raise ValueError("Rate units and bounds must be explicit")
        if self.metric == "roas" and self.unit != "ratio":
            raise ValueError("ROAS requires a ratio unit")
        if self.metric in _RESULTS and not self.result_definition:
            raise ValueError("Results require their actual event/revenue and denominator definition")
        if self.period_end < self.period_start:
            raise ValueError("Evidence dates must be ordered")
        if self.kind == "provider_forecast":
            if self.statistic not in {"point", "range"} or self.period_start < self.source_date:
                raise ValueError("A provider forecast needs its supplied prediction and forecast horizon")
        elif self.period_end > self.source_date:
            raise ValueError("Observed data cannot end after its source date")
        if self.kind == "account_result" and self.statistic not in {"aggregate", "mean", "median", "range"}:
            raise ValueError("Account results must describe an observed statistic")
        if self.kind == "published_benchmark":
            if self.statistic not in {"mean", "median", "range"} or self.sample_size is None or not self.methodology:
                raise ValueError("Benchmarks require a published statistic, sample and methodology")
        return self


def validate_records(records: list[dict]) -> tuple[list[dict], list[dict]]:
    """Return accepted JSON records and rejected indexes/reasons; never infer values."""
    accepted, rejected = [], []
    for index, record in enumerate(records[:MAX_RECORDS]):
        try:
            accepted.append(ChannelEvidence.model_validate(record).model_dump(mode="json", exclude_none=True))
        except ValidationError as error:
            rejected.append({"index": index, "reasons": [str(item["msg"]) for item in error.errors(include_input=False)]})
    if len(records) > MAX_RECORDS:
        rejected.append({"index": MAX_RECORDS, "reasons": [
            f"Record limit of {MAX_RECORDS} reached; {len(records) - MAX_RECORDS} additional record(s) excluded"
        ]})
    return accepted, rejected


def planning_prompt(records: list[dict], *, missing: list[str] | None = None) -> str:
    """Supply validated evidence to an authenticated planning/research caller.

    The caller controls signup/access. Missing inputs are descriptive labels, not
    numerical defaults. No provider access or forecast generation occurs here.
    """
    accepted, rejected = validate_records(records)
    grouped = {kind: [item for item in accepted if item["kind"] == kind]
               for kind in ("account_result", "provider_forecast", "published_benchmark")}
    missing_evidence = [kind for kind, items in grouped.items() if not items]
    lines = ["Channel evidence (supplied source records, not generated estimates):",
             json.dumps(grouped, ensure_ascii=False),
             "Account results describe past observations. Provider forecasts describe their stated future configuration. Published benchmarks describe their sampled population; they are not this business's measured results or forecast.",
             "An account result may have unknown or mixed objective/location because those dimensions were not supplied. Do not infer them or present account totals as location-specific campaign results.",
             "Keep a median a median and a sourced range a range. Do not invent confidence bounds, conversion rates, currency conversions or country adjustments. Do not mix campaign objectives, conversion definitions or reporting periods.",
             "CPA/CPL and attributed ROAS do not establish incremental profit. No record supplies a performance guarantee."]
    if missing_evidence:
        lines.append("Missing evidence: " + ", ".join(missing_evidence) + ". Unknown is not zero; no numerical estimate is available from these missing sources.")
    if missing:
        lines.append("Additional evidence needed: " + "; ".join(str(item)[:200] for item in missing[:12]))
    if rejected:
        lines.append(f"{len(records) - len(accepted)} supplied record(s) were invalid or exceeded the evidence limit and were excluded.")
    return "\n".join(lines)
