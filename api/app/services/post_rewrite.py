"""One-instruction rewrite (docs/posts-v2.md, Phase C).

The editor's text step offers a few one-tap instructions (`קצר יותר`, `להוסיף מחיר`,
`יותר חם`, `עם שאלה ללקוחות`) and a short field for the owner's own words. One
instruction, one new version: no suggestion box to decide on (Revision 1).

What this module decides, so the writer never has to:

* which money the post may carry. A price is *known* when the owner typed it (in the
  instruction, in a saved text, in a featured item's note), confirmed it (saved or
  approved the text: `owner_prices`, `owner_fact_done`), or it is already in the post.
  Nothing else: a price or a discount the writer adds on its own is invented.
* what must stay. A fact the owner confirmed is kept exactly as it is.
* `להוסיף מחיר` with no known price never reaches the writer: the post stays as it is,
  and asks the owner "מה המחיר?".

After the writer answers, `guard` checks its text against those facts: an invented price
becomes the `[מחיר]` placeholder the writer itself is told to use (and the owner is asked
to check it); an invented discount, or a confirmed fact that went missing, means the new
version is not used at all.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

MAX_INSTRUCTION = 200

# The one-tap instructions: the chip's words, and what the writer is asked to do.
INSTRUCTIONS: dict[str, str] = {
    "קצר יותר": "קצר את הפוסט: הכיתוב בערך בחצי, 2 עד 3 משפטים קצרים. אותו מסר, אותה קריאה לפעולה ואותן עובדות.",
    "להוסיף מחיר": "הוסף לפוסט את המחיר הידוע, בכיתוב, ואם מתאים גם בטקסט על התמונה. השתמש רק במחיר שמופיע ברשימת המחירים המותרים.",
    "יותר חם": "כתוב בטון חם ואישי יותר, כמו שכן שמדבר עם שכן. בלי להוסיף הבטחות, מבצעים או עובדות.",
    "עם שאלה ללקוחות": "שלב בפוסט שאלה אחת קצרה ללקוחות, שקל לענות עליה בתגובה או בהודעה. עדיף בפתיחה.",
}

# The older tone-only rewrite (still accepted), in the words the editor shows after it.
TONE_LABEL_HE: dict[str, str] = {
    "direct": "ברור יותר",
    "neighborhood": "יותר חם",
    "punchy": "קצר יותר",
    "holiday": "אווירת חג",
    "story": "סיפור קצר",
}

PRICE_QUESTION_HE = "מה המחיר?"
PRICE_FACT_HE = "המחיר"
NO_PRICE_MESSAGE_HE = "לא מצאנו מחיר שאישרתם, אז הפוסט נשאר כמו שהוא. כתבו את המחיר במילים שלכם, למשל: להוסיף מחיר 45 ₪."
DROPPED_FACT_MESSAGE_HE = "הנוסח נשאר כמו שהיה: בגרסה החדשה חסר {fact}, שכבר אישרתם. נסו שוב."
INVENTED_DISCOUNT_MESSAGE_HE = "הנוסח נשאר כמו שהיה: בגרסה החדשה הופיעה הנחה שלא הגדרתם. נסו שוב."
PRICE_PLACEHOLDER = "[מחיר]"

# The fields the writer rewrites, and the ones the owner sees on the card.
TEXT_FIELDS = ("title", "hook", "caption", "cta", "overlay_text")
_READ_FIELDS = (*TEXT_FIELDS, "overlay_headline", "overlay_badge")

_WS = re.compile(r"\s+")
_SHEKEL = r"(?:₪|ש\"ח|ש״ח|ש'ח|שקלים|שקל)"
_AMOUNT = r"\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?"
_MONEY = re.compile(rf"₪\s*({_AMOUNT})|({_AMOUNT})\s*{_SHEKEL}")
_PERCENT = re.compile(rf"({_AMOUNT})\s*%")
_NUMBER = re.compile(r"\d+(?:[:.,/]\d+)*")
_PRICE_WORDS = re.compile(r"מחיר|כמה עולה|עולה\s*\d|₪|ש\"ח|ש״ח|שקל")


def clean_instruction(value) -> str:
    """The owner's instruction as one line of at most 200 characters, or ""."""
    if not isinstance(value, str):
        return ""
    return _WS.sub(" ", value).strip()[:MAX_INSTRUCTION]


def label_for(instruction: str, tone: str | None) -> str:
    """What the editor shows after the rewrite: "שונה לפי: {label}"."""
    if instruction:
        # The owner's own words when they are short; a long request is "the one you wrote".
        return instruction if len(instruction) <= 40 else "הבקשה שלכם"
    return TONE_LABEL_HE.get(tone or "", "")


def guidance(instruction: str) -> str:
    """The writer's instruction line: a chip's own guidance, or the owner's words."""
    if instruction in INSTRUCTIONS:
        return INSTRUCTIONS[instruction]
    return f'בעל העסק ביקש, במילים שלו: "{instruction}". עשה בדיוק את זה, ושום דבר מעבר.'


def wants_price(instruction: str) -> bool:
    return bool(instruction) and bool(_PRICE_WORDS.search(instruction))


def _norm(amount: str) -> str:
    text = amount.replace(",", "")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text


def money_in(text: str) -> set[str]:
    """The shekel amounts in a text, normalised ("1,200 ₪" -> "1200")."""
    return {_norm(a or b) for a, b in _MONEY.findall(str(text or ""))}


def percents_in(text: str) -> set[str]:
    return {_norm(a) for a in _PERCENT.findall(str(text or ""))}


def numbers_in(text: str) -> set[str]:
    return set(_NUMBER.findall(str(text or "")))


def post_text(post: dict, fields=_READ_FIELDS) -> str:
    return "\n".join(str(post.get(name) or "") for name in fields)


def cta_in_caption(post: dict) -> bool:
    """Whether the caption (what is posted) carries the post's call to action word for word.
    The writer puts the CTA at the end of the caption; a rewrite must not drop it."""
    cta = _WS.sub(" ", str(post.get("cta") or "")).strip()
    return bool(cta) and cta in _WS.sub(" ", str(post.get("caption") or ""))


def _featured_text(featured: dict | None) -> str:
    if not isinstance(featured, dict):
        return ""
    return " ".join(str(featured.get(key) or "") for key in ("name", "why", "note"))


def owner_money(post: dict, instruction: str = "", featured: dict | None = None) -> set[str]:
    """Prices the owner typed or confirmed: in this instruction, in a text they saved or
    approved (`owner_prices`), in the post once they went over its facts, in their note
    on the featured item."""
    known = {_norm(str(value)) for value in post.get("owner_prices") or [] if str(value).strip()}
    known |= money_in(instruction)
    known |= money_in(_featured_text(featured))
    if post.get("owner_fact_done"):
        known |= money_in(post_text(post))
    return known


def known_money(post: dict, instruction: str = "", featured: dict | None = None) -> set[str]:
    """Every price the new version may carry: the owner's, and the ones already in it."""
    return owner_money(post, instruction, featured) | money_in(post_text(post))


def kept_facts(post: dict) -> list[str]:
    """The facts the owner confirmed that are in the post now, and must stay: their
    prices, and every number of a text whose facts they went over (dates, hours)."""
    text = post_text(post)
    keep = {f"{amount} ₪" for amount in money_in(text) & {_norm(str(v)) for v in post.get("owner_prices") or []}}
    if post.get("owner_fact_done"):
        keep |= {f"{amount} ₪" for amount in money_in(text)}
        keep |= numbers_in(_MONEY.sub(" ", text))
    return sorted(keep)


def _present(fact: str, text: str) -> bool:
    if fact.endswith(" ₪"):
        return fact[:-2] in money_in(text)
    return fact in numbers_in(_MONEY.sub(" ", text))


def facts_block(post: dict, instruction: str = "", featured: dict | None = None) -> str:
    """The writer's rules on facts and money, with the real values."""
    lines = []
    keep = kept_facts(post)
    if keep:
        lines.append("- עובדות שבעל העסק כבר אישר. חובה להשאיר אותן בדיוק כמו שהן: " + ", ".join(keep) + ".")
    prices = sorted(known_money(post, instruction, featured), key=lambda value: float(value))
    if prices:
        lines.append("- המחירים המותרים בפוסט: " + ", ".join(f"{p} ₪" for p in prices) + ". אסור מחיר אחר.")
    else:
        lines.append(f"- אין מחיר ידוע. אל תכתוב מחיר. אם הפוסט חייב מחיר, כתוב {PRICE_PLACEHOLDER} במקומו.")
    lines.append("- אסור להמציא הנחה, מבצע או אחוז שלא מופיעים כבר בפוסט.")
    return "\n".join(lines)


@dataclass
class GuardResult:
    fields: dict
    rejected: bool = False
    message: str | None = None
    placeholders: list[str] = field(default_factory=list)


def guard(post: dict, new_fields: dict, instruction: str = "", featured: dict | None = None) -> GuardResult:
    """The writer's new text, checked against what the owner confirmed and what is known."""
    before = post_text(post)
    after = post_text({**post, **{k: v for k, v in new_fields.items() if isinstance(v, str)}})
    for fact in kept_facts(post):
        if _present(fact, before) and not _present(fact, after):
            return GuardResult(fields={}, rejected=True, message=DROPPED_FACT_MESSAGE_HE.format(fact=fact))
    outlets = new_fields.get("outlet_captions") if isinstance(new_fields.get("outlet_captions"), dict) else {}
    copies = "\n".join(str(value or "") for value in outlets.values())
    allowed_percents = percents_in(before) | percents_in(instruction)
    if (percents_in(after) | percents_in(copies)) - allowed_percents:
        return GuardResult(fields={}, rejected=True, message=INVENTED_DISCOUNT_MESSAGE_HE)
    known = known_money(post, instruction, featured)
    fixed: dict = {}
    invented: list[str] = []

    def replace(match: re.Match) -> str:
        amount = _norm(match.group(1) or match.group(2))
        if amount in known:
            return match.group(0)
        invented.append(amount)
        return PRICE_PLACEHOLDER

    for name in TEXT_FIELDS:
        value = new_fields.get(name)
        fixed[name] = _MONEY.sub(replace, value) if isinstance(value, str) else value
    if outlets:
        fixed["outlet_captions"] = {
            key: _MONEY.sub(replace, value) if isinstance(value, str) else value for key, value in outlets.items()
        }
    return GuardResult(fields=fixed, placeholders=sorted(set(invented)))


def has_placeholder(fields: dict) -> bool:
    return any(PRICE_PLACEHOLDER in str(fields.get(name) or "") for name in TEXT_FIELDS)


def confirm_prices(post: dict, *texts: str) -> None:
    """Record the prices in what the owner typed, saved or approved as theirs."""
    prices = {_norm(str(v)) for v in post.get("owner_prices") or [] if str(v).strip()}
    for text in texts:
        prices |= money_in(text)
    if prices:
        post["owner_prices"] = sorted(prices, key=lambda value: float(value))
