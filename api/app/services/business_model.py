"""The products / services fork.

A shop and a designer are not the same business with different nouns. A shop converts a
browse into a purchase and can be judged on ROAS; a designer converts attention into an
inquiry, and the sale happens in a conversation weeks later. Planning one with the other's
model produces targets nobody can hit and advice that does not apply — which is exactly
what happened before this module existed.

Everything that needs to know which path we are on reads it from here, so the fork has a
single definition rather than being re-implemented per prompt.
"""

BUSINESS_MODELS = ("products", "services", "both")

DEFAULT_BUSINESS_MODEL = "products"

MODEL_TITLES = {
    "products": "מוצרים",
    "services": "שירותים",
    "both": "מוצרים ושירותים",
}

# Which goals are meaningful for each model. `sales` is a purchase goal and is
# deliberately absent for a pure service business; `leads` is meaningless for a shop
# that has no inquiry step.
VALID_GOALS: dict[str, tuple[str, ...]] = {
    "products": ("sales", "brand_awareness"),
    "services": ("leads", "personal_brand"),
    "both": ("sales", "leads", "brand_awareness", "personal_brand"),
}

# The unit a plan is actually trying to produce. Used in copy and in prompts.
CONVERSION_UNIT = {
    "products": "רכישה",
    "services": "פנייה (ליד)",
    "both": "רכישה או פנייה",
}

VALID_DIAGNOSTIC_KEYS: dict[str, tuple[str, ...]] = {
    "products": ("has_customer_club", "repeat_vs_new", "priority_channel", "capacity_constraint"),
    "services": ("lead_source", "has_portfolio", "brand_owner", "capacity_constraint"),
    "both": (
        "priority_channel",
        "repeat_vs_new",
        "lead_source",
        "has_portfolio",
        "capacity_constraint",
    ),
}


def normalise_model(value: str | None) -> str:
    """Unknown or empty values fall back to the historic behaviour, never crash."""
    model = (value or "").strip().lower()
    return model if model in BUSINESS_MODELS else DEFAULT_BUSINESS_MODEL


def goals_for(business_model: str | None) -> tuple[str, ...]:
    return VALID_GOALS[normalise_model(business_model)]


def diagnostics_for(business_model: str | None) -> tuple[str, ...]:
    return VALID_DIAGNOSTIC_KEYS[normalise_model(business_model)]


def audience_framing(business_model: str | None) -> str:
    """What a "target audience" means for this business model.

    A shop's segment is a kind of buyer; a designer's segment is a kind of client and the
    situation that makes them pick up the phone. Naming a service business's audience in
    shop language ("קוני מוצר") produces segments nobody can target and content that
    misses, so the fork is stated once here rather than re-invented per prompt.
    """
    model = normalise_model(business_model)
    if model == "services":
        return """
סוג העסק: נותן שירותים. קהל היעד כאן הוא סוג לקוח — מי מזמין את השירות, ובאיזו סיטואציה.
כל קהל חייב להיות מוגדר לפי הצורך שמוביל לפנייה: למשל לקוח פרטי בשלב חיים מסוים,
עסק קטן שצריך ספק קבוע, או מי שמגיע בהמלצה של לקוח קודם.
אל תגדיר קהלים לפי "כל מי שאוהב את התחום" — זו אינה הגדרה שאפשר לפנות אליה או לפרסם מולה.
אין כאן רכישה אונליין, ולכן אין "סל נטישה" ואין קהלים לפי התנהגות רכישה באתר.
"""
    if model == "both":
        return """
סוג העסק: גם מוצרים וגם שירותים. יש לקוחות שקונים מוצר ולקוחות שמזמינים שירות,
ולכן צריך גם מקטעי קונים וגם סוגי לקוחות שירות — ואין לערבב ביניהם באותו קהל.
"""
    return """
סוג העסק: מוכר מוצרים. קהל היעד כאן הוא מקטע קונים — מי קונה, בשביל מה, ובאיזו סיטואציה.
כל קהל חייב להיות מוגדר לפי הצורך וההזדמנות שמובילים לקנייה: למשל מי שקונה לעצמו באמצע השבוע
מול מי שקונה כמתנה, או מי שמחפש את הזול מול מי שמחפש את הטרי.
אל תגדיר קהלים לפי "כל מי שאוהב את המוצר" — זו אינה הגדרה שאפשר לפנות אליה או לפרסם מולה.
"""


def model_framing(business_model: str | None) -> str:
    """The Hebrew block injected into every generation prompt.

    This is the part that actually changes what the model produces, so it states the
    conversion unit, what a target may look like, and what the content should earn —
    rather than only labelling the business.
    """
    model = normalise_model(business_model)
    if model == "services":
        return """
סוג העסק: נותן שירותים. זו אינה חנות.
יחידת ההמרה היא פנייה או ליד — לא רכישה. הלקוח מתלבט, משווה, ומחליט בשיחה.

מה מותר ואסור ביעדים:
- יעדים הם: מספר פניות או לידים, שיחות או פגישות שנקבעו, תיק עבודות שמביא פניות,
  הכרה מקצועית, והמלצות מלקוחות. לא מכירות מדף, לא סל קנייה, לא מלאי.
- אין רכישה מקוונת ישירה ולכן ROAS ‏ו-ACoS אינם רלוונטיים. אל תזכיר אותם.
- אל תמציא שיעור המרה מפנייה ללקוח. אנחנו לא יודעים אותו.

מה התוכן צריך לעשות:
לבנות אמון ומומחיות לאורך זמן — מקרי ביקורת, תהליך העבודה, לפני ואחרי, עמדה מקצועית,
והיכרות עם האדם שמאחורי העבודה. מעט מאוד מבצעים וקופונים; הם מזיקים למיתוג מקצועי.
"""
    if model == "both":
        return """
סוג העסק: גם מוצרים וגם שירותים.
יש שתי דרכי הכנסה — רכישה של מוצר ופנייה על שירות — והתוכנית צריכה לשרת את שתיהן.
כשמדברים על פנייה, יחידת ההמרה היא ליד ולא רכישה, ואין להמציא שיעור המרה.
"""
    return """
סוג העסק: מוכר מוצרים.
יחידת ההמרה היא רכישה. יעדים הם מכירות, סל קנייה, לקוחות חוזרים ותנועה.
"""
