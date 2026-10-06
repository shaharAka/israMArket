"""Owner-declared software context. Never derive product traction from a website."""
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator

class DraftSoftware(BaseModel):
    model_config = ConfigDict(extra="ignore")
    stage: Literal["idea", "beta", "live", "unknown"] = "unknown"
    buying_motion: Literal["self_serve", "demo", "waitlist", "unknown"] = "unknown"
    problem: str = Field(default="", max_length=400)
    buyer: str = Field(default="", max_length=300)
    market: str = Field(default="", max_length=200)
    focus_product: str = Field(default="", max_length=120)
    commercial_offer: str = Field(default="", max_length=400)
    product_evidence: str = Field(default="", max_length=600)

    @field_validator("problem", "buyer", "market", "focus_product", "commercial_offer", "product_evidence")
    @classmethod
    def trim(cls, value: str) -> str:
        return " ".join(value.split())


def software_block(raw: dict | None) -> str:
    if not isinstance(raw, dict):
        return ""
    stage = {"idea":"רעיון או מוצר בבנייה", "beta":"בטא או משתמשים ראשונים", "live":"מוצר פעיל", "unknown":"לא נמסר"}
    motion = {"self_serve":"הרשמה וניסיון עצמאי", "demo":"בקשה להדגמה או שיחה", "waitlist":"רשימת המתנה", "unknown":"עוד לא הוחלט"}
    return "\n".join([
        "מסלול תוכנה/סטארטאפ — אלה תשובות הבעלים, לא נתונים שאומתו:",
        f"- המוצר שרוצים לקדם קודם: {str(raw.get('focus_product') or 'עדיין לא נבחר')[:120]}",
        f"- ההצעה המסחרית בפועל: {str(raw.get('commercial_offer') or 'לא נמסר; אין להמציא מחיר או תקופת ניסיון')[:400]}",
        f"- מה אפשר להדגים או להסביר על המוצר כבר היום: {str(raw.get('product_evidence') or 'לא נמסר; צריך חומר אמיתי מהבעלים')[:600]}",
        f"- הבעיה שהמוצר פותר: {str(raw.get('problem') or 'לא נמסר')[:400]}",
        f"- מי משתמש ומי מחליט לשלם: {str(raw.get('buyer') or 'לא נמסר')[:300]}",
        f"- שלב המוצר: {stage.get(raw.get('stage'), 'לא נמסר')}",
        f"- הצעד שלקוח עושה כדי להתחיל: {motion.get(raw.get('buying_motion'), 'לא נמסר')}",
        f"- שוק ושפה: {str(raw.get('market') or 'לא נמסר')[:200]}",
        "המלץ על ניסוי שמתאים לשלב ולדרך ההצטרפות. הפרד הרשמה, שימוש ראשון בעל ערך ותשלום.",
        "אל תמציא משתמשים, הכנסה, שיעורי המרה, שימור או נטישה. אם אין נתונים, קבע מה למדוד לפני יעד מספרי.",
        "תוכן: הבעיה, הדגמת מוצר אמיתית, תהליך/ידע של המייסדים ושאלות לקוחות; ללא מסכי תוכנה או סיפורי לקוח מומצאים.",
        "התאם כל פוסט למוצר שנבחר, לתפקיד הקונה, ליכולת מוכחת ולהצעה המסחרית. הפרד הסבר שימושי, הדגמה והזמנה לפעולה. אל תכתוב קידום גנרי של החברה או של AI.",
        "במחקר החברה: הבחֵן בין כלל המוצרים שהבעלים תיאר לבין המוצר שבמוקד. בדוק יכולות, תמחור ודרך הצטרפות רק בטקסט שקראנו באתר; ציין מקור, וחוסר או סתירה נשארים פתוחים לבדיקה.",
    ])
