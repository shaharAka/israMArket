"""Owner-confirmed content language, independent of interface locale.

Existing posts and approved preview samples keep their own language. Experiments are
hypotheses within the owner's selected languages, never a claimed measured winner.
"""
from copy import deepcopy

from app.services.hebrew_style import HEBREW_STYLE

LANGUAGES = {"he": "Hebrew", "en": "English", "ar": "Arabic", "ru": "Russian"}
DEFAULT = {"default_language": "he", "audience_languages": ["he"], "allow_language_tests": False}


def preferences(stored: dict | None) -> dict:
    raw = (stored or {}).get("content_language") or {}
    if not isinstance(raw, dict):
        raw = {}
    default = raw.get("default_language")
    default = default if isinstance(default, str) and default in LANGUAGES else "he"
    selected = raw.get("audience_languages")
    selected = selected if isinstance(selected, list) else []
    allowed = list(dict.fromkeys([default, *[code for code in selected if isinstance(code, str) and code in LANGUAGES]]))
    return {"default_language": default, "audience_languages": allowed,
            "allow_language_tests": raw.get("allow_language_tests") is True and len(allowed) > 1}


def for_batch(prefs: dict, override: str | None = None) -> dict:
    if override is not None and override not in LANGUAGES:
        raise ValueError("Unsupported content language")
    normalized = preferences({"content_language": prefs})
    # An explicit batch choice takes precedence over the optional experiment.
    return ({"default_language": override, "audience_languages": [override], "allow_language_tests": False}
            if override else normalized)


def post_language(post: dict) -> str:
    code = post.get("content_language")
    # Posts saved before this setting were written in Hebrew.
    return code if isinstance(code, str) and code in LANGUAGES else "he"


def prompt_block(prefs: dict) -> str:
    prefs = for_batch(prefs)
    default = prefs["default_language"]
    rules = [
        "CONTENT LANGUAGE (independent of the interface language):",
        f"Write public-facing title, angle, hook, caption, cta, overlay text, price_note and all outlet_captions in {LANGUAGES[default]} ({default}).",
        "Keep JSON keys, IDs, URLs, product names and verified facts unchanged. English image_prompt describes the scene with no text in the image.",
        "הסברים לבעל העסק והנחיות (why_now, owner_fact, language_reason, inspiration_note) נכתבים תחילה בעברית טבעית; טקסט לפרסום נכתב בשפת התוכן שנבחרה.",
        HEBREW_STYLE,
        "Return content_language on each post. Never infer a reader's language from nationality, location or business type alone.",
    ]
    if prefs["allow_language_tests"]:
        rules += [
            f"The owner confirmed these audience languages: {', '.join(prefs['audience_languages'])}.",
            "You may propose at most one post in a different confirmed language in this batch, only when the audience, offer and business context give a specific reason.",
            "Explain the audience/business reason in language_reason. Label this a test, not an established winner. Other posts use the default language.",
            "Never claim a language caused better results or invent language-specific metrics. Existing measured posts provide context, not a controlled language comparison.",
        ]
    else:
        rules += [f"Every new post must use {default}; do not choose a different language. language_reason is empty."]
    return "\n".join(rules)


def system(prefs: dict) -> str | None:
    prefs = for_batch(prefs)
    if prefs == DEFAULT:
        return None  # preserve the existing Hebrew writer contract
    return "You are a careful marketing strategist for a small business. Follow the content-language rules exactly. Preserve verified facts. " + prompt_block(prefs)


def copy_schema(schema: dict, language: str) -> dict:
    """Public-copy schema descriptions must not contradict a non-Hebrew prompt."""
    if language == "he":
        return schema
    result = deepcopy(schema)
    fields = {"title", "angle", "hook", "caption", "cta", "overlay_text", "overlay_headline", "overlay_sub", "price_note", "outlet_captions"}

    def walk(node: dict, public: bool = False) -> None:
        if public and isinstance(node.get("description"), str):
            node["description"] = node["description"].replace("עברית", "שפת התוכן של הפוסט").replace("Hebrew", "the post's content language")
        for key, child in (node.get("properties") or {}).items():
            if isinstance(child, dict):
                walk(child, public or key in fields)
        if isinstance(node.get("items"), dict):
            walk(node["items"], public)
    walk(result)
    return result


def schema_for(schema: dict, prefs: dict) -> dict:
    if prefs["default_language"] == "he" and not prefs["allow_language_tests"]:
        return schema  # legacy Hebrew schemas stay shared; the server tags Hebrew drafts
    result = deepcopy(copy_schema(schema, "mixed" if prefs["allow_language_tests"] else prefs["default_language"]))
    item = result["properties"]["posts"]["items"]
    allowed = prefs["audience_languages"] if prefs["allow_language_tests"] else [prefs["default_language"]]
    item["properties"].update({
        "content_language": {"type": "string", "enum": allowed},
        "language_reason": {"type": "string", "description": "Owner-facing reason for an optional language experiment, in Hebrew; otherwise empty."},
    })
    item["required"] = [*item.get("required", []), "content_language", "language_reason"]
    return result


def tag_written(items: list[dict], prefs: dict) -> list[dict]:
    """Reject an unapproved language before saving drafts; never silently relabel copy."""
    default = prefs["default_language"]
    allowed = prefs["audience_languages"] if prefs["allow_language_tests"] else [default]
    experiments = 0
    for item in items:
        code = item.get("content_language")
        # Old mocked/legacy Hebrew writers omitted the field; only Hebrew may default.
        if not code and default == "he":
            code = "he"
        if code not in allowed:
            raise RuntimeError("הפוסטים חזרו בשפה שלא בחרתם. נסו לכתוב אותם שוב.")
        if code != default:
            experiments += 1
            if not str(item.get("language_reason") or "").strip():
                raise RuntimeError("חסר הסבר לבחירת שפת הפוסט. נסו לכתוב אותו שוב.")
        item["content_language"] = code
        item["language_reason"] = str(item.get("language_reason") or "").strip()[:400] if code != default else ""
    if experiments > 1:
        raise RuntimeError("התקבלו יותר מדי ניסויי שפה בבת אחת. נסו לכתוב שוב.")
    return items
