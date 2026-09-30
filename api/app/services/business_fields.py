"""The business field ("תחום"): which industry the business is in.

Industries only. Where the business sells (a shop, a site, both) is a different question
and is already answered elsewhere: `links`, `grow_where`, `presence_type` and
`business_model`. The old list mixed the two ("חנות פיזית / קמעונאות", "חנות אונליין")
and owners rightly said a store is not a field.

One source of truth: `app/data/business_fields.json`, copied byte for byte to
`web/lib/businessFields.json` (a test fails if they differ). The database and the API
store the stable `key` ("food"); the Hebrew `label` is display text and can change
without a migration.

Every entry point accepts the old stored values too. `resolve_field` maps a key, a label
or an old label onto a key; `coerce_field` does the same for any text at all, inferring
from the owner's words and falling back to "other". Both are pure.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "business_fields.json"

OTHER = "other"
PRESENCE_TYPES = ("brick_and_mortar", "online_only", "hybrid")


@dataclass(frozen=True)
class Field:
    key: str
    label: str
    chip: str
    model: str
    preset: str
    cost_industry: str | None
    keywords: tuple[str, ...]


@dataclass(frozen=True)
class Resolved:
    key: str
    # What an old value said about where customers come ("חנות אונליין" → online_only).
    presence_type: str | None = None


def _fold(text: str) -> str:
    """Lowercase, one kind of quote, one space. Keywords and owner text go through the
    same fold, so "עו״ד", 'עו"ד' and "עו''ד" match the same keyword."""
    cleaned = (text or "").replace("״", '"').replace("׳", "'").replace("''", '"').replace("`", "'")
    cleaned = cleaned.replace("’", "'").replace("”", '"').replace("“", '"')
    return " ".join(cleaned.lower().split())


@lru_cache(maxsize=1)
def _data() -> dict:
    return json.loads(DATA_PATH.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def fields() -> tuple[Field, ...]:
    return tuple(
        Field(
            key=item["key"],
            label=item["label"],
            chip=item["chip"],
            model=item["model"],
            preset=item["preset"],
            cost_industry=item.get("cost_industry"),
            keywords=tuple(_fold(word) for word in item.get("keywords") or ()),
        )
        for item in _data()["fields"]
    )


@lru_cache(maxsize=1)
def by_key() -> dict[str, Field]:
    return {field.key: field for field in fields()}


FIELD_KEYS: tuple[str, ...] = tuple(field.key for field in fields())
MODEL_BY_FIELD: dict[str, str] = {field.key: field.model for field in fields()}
PRESET_BY_FIELD: dict[str, str] = {field.key: field.preset for field in fields()}


@lru_cache(maxsize=1)
def _by_text() -> dict[str, str]:
    """Folded key, label and chip → key."""
    out: dict[str, str] = {}
    for field in fields():
        for text in (field.key, field.label, field.chip):
            out.setdefault(_fold(text), field.key)
    return out


@lru_cache(maxsize=1)
def _legacy() -> dict[str, dict]:
    return {_fold(item["value"]): item for item in _data()["legacy"]}


def legacy_values() -> tuple[str, ...]:
    return tuple(item["value"] for item in _data()["legacy"])


def infer_field(text: str, among: tuple[str, ...] | list[str] | None = None) -> str | None:
    """The field whose keywords appear most often in `text`; ties go to the earlier field.

    None when nothing matches: the caller decides the fallback, so "we could not tell" is
    never silently the same as a real match.
    """
    haystack = _fold(text)
    if not haystack:
        return None
    allowed = set(among) if among else None
    best: tuple[int, str] | None = None
    for field in fields():
        if allowed is not None and field.key not in allowed:
            continue
        hits = sum(1 for word in field.keywords if word in haystack)
        if hits and (best is None or hits > best[0]):
            best = (hits, field.key)
    return best[1] if best else None


def resolve_field(value: str | None, offerings: str = "") -> Resolved | None:
    """A key, a label, a chip or an old stored label → the field. None for anything else.

    Old labels that named a sales channel ("חנות פיזית / קמעונאות", "חנות אונליין")
    are read from the offerings text, and carry where customers come as `presence_type`.
    """
    text = _fold(value or "")
    if not text:
        return None
    direct = _by_text().get(text)
    if direct:
        return Resolved(direct)
    item = _legacy().get(text)
    if item is None:
        return None
    presence = item.get("presence_type")
    if item.get("key"):
        return Resolved(item["key"], presence)
    among = item.get("among") or None
    key = infer_field(offerings, among) or item.get("fallback") or OTHER
    return Resolved(key, presence)


def coerce_field(value: str | None, offerings: str = "") -> Resolved:
    """Any stored text → a field. Free text the list never offered (an old client, a
    hand-typed "מאפייה שכונתית") is read together with the offerings; "other" last."""
    resolved = resolve_field(value, offerings)
    if resolved is not None:
        return resolved
    return Resolved(infer_field(f"{value or ''} {offerings or ''}") or OTHER)


def field_label(value: str | None) -> str:
    """The Hebrew label for a key. Anything that is not a key is returned as written:
    in a prompt, the owner's own words say more than a guessed label."""
    field = by_key().get((value or "").strip())
    return field.label if field else (value or "")


def default_model(value: str | None) -> str | None:
    field = by_key().get((value or "").strip())
    return field.model if field else None


def default_preset(value: str | None) -> str:
    field = by_key().get((value or "").strip())
    return field.preset if field else PRESET_BY_FIELD[OTHER]


def cost_industry(value: str | None) -> str | None:
    field = by_key().get((value or "").strip())
    return field.cost_industry if field else None


# --- stored rows ------------------------------------------------------------------------


def migrate_business_types(conn) -> list[dict]:
    """Rewrite `businesses.business_type` to field keys. Idempotent: a key stays a key.

    Runs on a raw SQLAlchemy connection at startup (see `app.db.migrate_db`). An old
    channel label also sets `presence_type`, but only over the column default: an owner
    who explicitly said "גם וגם" (hybrid) keeps it. Returns what changed.
    """
    rows = conn.exec_driver_sql(
        "SELECT id, business_type, offerings, presence_type FROM businesses"
    ).fetchall()
    changed: list[dict] = []
    for business_id, business_type, offerings, presence in rows:
        current = business_type or ""
        # Empty means "not answered yet" (an unfinished profile), not "other".
        if not current.strip() or current in FIELD_KEYS:
            continue
        resolved = coerce_field(current, offerings or "")
        new_presence = presence
        if resolved.presence_type and (presence or "brick_and_mortar") == "brick_and_mortar":
            new_presence = resolved.presence_type
        conn.exec_driver_sql(
            "UPDATE businesses SET business_type = ?, presence_type = ? WHERE id = ?",
            (resolved.key, new_presence, business_id),
        )
        changed.append(
            {
                "id": business_id,
                "before": current,
                "after": resolved.key,
                "presence_before": presence,
                "presence_after": new_presence,
            }
        )
    return changed
