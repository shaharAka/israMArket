"""
Designer AI Service (מעצב ה-AI) for IsraMarket.
Acts as a senior Art Director and Social Media Graphic Designer for Israeli small businesses.

Decides:
1. What to generate in the visual scene (composition, subjects, photography angle, lighting, depth of field).
2. The visual style (artisan documentary, editorial food photography, minimalist clean studio, festive holiday spread).
3. The graphic text & overlay: whether an overlay is even fitting (has_overlay), the headline, badge, placement, and visual theme.
"""

from app.services.gemini import strategy_json
from app.services.images import generate_and_store
from app.services.jsonutil import loads
from app.services.schemas_llm import DESIGNER_POST_CREATIVE_SCHEMA


def plan_post_design(
    post: dict,
    brand: dict,
    business: dict,
    vibe: str = "",
    custom_prompt: str = "",
) -> dict:
    palette_desc = ", ".join(
        f"{swatch.get('name', '')} ({swatch.get('hex', '')})" for swatch in brand.get("palette") or []
    )
    vibe_instruction = ""
    if vibe == "hero_clean":
        vibe_instruction = "הנחיית כיוון: תמונת גיבור נקייה לחלוטין. אל תשלב כיתוב בכלל (has_overlay=false). מקד את כל הכוח בצילום מרהיב, מעורר תיאבון ומקצועי של המוצר והאווירה."
    elif vibe == "announcement_card":
        vibe_instruction = "הנחיית כיוון: כרטיס מודעה / הודעה מעוצבת. שלב כיתוב בולט (has_overlay=true), רצוי כרטיס מרכזי או תחתון מעודן (overlay_theme='paper_badge' או 'frosted_glass' או 'ink_pill')."
    elif vibe == "corner_badge":
        vibe_instruction = "הנחיית כיוון: צילום אווירה אותנטי עם מדבקת פינה עדינה וחגיגית (has_overlay=true, overlay_position='top_right', overlay_theme='paper_badge')."
    elif vibe == "ink_pill":
        vibe_instruction = "הנחיית כיוון: תגית דיו שחורה יוקרתית ומודרנית (has_overlay=true, overlay_theme='ink_pill', overlay_position='bottom_pill')."
    elif vibe:
        vibe_instruction = f"הנחיית כיוון מבוקשת: {vibe}"

    if custom_prompt:
        vibe_instruction += f"\nבקשה מיוחדת מהמשתמש לגבי האסתטיקה או הסצנה: {custom_prompt}"

    prompt = f"""
אתה ארט דיירקטור ומעצב גרפי בכיר לרשתות חברתיות של מותגים ועסקים ישראליים.
תפקידך לתכנן את הפוסט הוויזואלי המושלם — לא סתם תמונה כללית, אלא יצירה שלמה של מעצב סושיאל מקצועי:
1. מה בדיוק יוצג בתמונה (ארט דיירקשן מקצועי לצילום שיועבר למודל ה-AI).
2. מה הסגנון הוויזואלי המתאים.
3. האם בכלל מתאים לשלב כיתוב מעוצב (Overlay) על גבי התמונה, או שעדיף צילום גיבור נקי ללא כל טקסט!

פרטי העסק:
שם: {business.get("name")}
סוג עסק: {business.get("business_type")}
הצעות ומוצרים: {business.get("offerings")}
מיקום: {business.get("location")}
מודל נוכחות: {business.get("presence_type")}
מטרת על: {business.get("primary_goal")}
השערת צמיחה: {business.get("growth_hypothesis")}

שפת המותג שחולצה מהאתר:
צבעי פלטה: {palette_desc}
סגנון ויזואלי: {brand.get("visual_style")}
סגנון צילום: {brand.get("photography")}
מצב רוח טיפוגרפי: {(brand.get("typography") or {}).get("mood")}
טון דיבור: {brand.get("voice")}
קהל יעד: {brand.get("audience")}

פרטי הפוסט שנכתב:
כותרת: {post.get("title")}
פורמט: {post.get("format")}
זווית: {post.get("angle")}
הוק: {post.get("hook")}
תוכן (קפשן): {post.get("caption")}
הנעה לפעולה (CTA): {post.get("cta")}
חיבור ללוח השנה: {post.get("calendar_tie")}
התאמה למטרה: {post.get("goal_fit")}
למה עכשיו: {post.get("why_now")}
ערוץ ראשי: {post.get("primary_outlet")}

{vibe_instruction}

הנחיות מקצועיות לארט-דיירקטור:
1. מה לייצר בתמונה (scene_description באנגלית מפורטת):
   - תאר בדיוק את נושא הצילום, הקומפוזיציה, זווית המצלמה (תקריב מאקרו 45 מעלות, צילום מגובה העיניים, פלאטליי מלמעלה), תאורה טבעית (אור בוקר חם רך, צללים עדינים), חומרים ומרקמים אמיתיים (קמח, עץ כפרי, מגשי נירוסטה, שולחן חג), שילוב גוונים מפלטת המותג.
   - איסור מוחלט: אל תבקש טקסט, אותיות, לוגו, מים או כיתוב בתוך התמונה! התמונה היא צילום נקי.
2. החלטת כיתוב (has_overlay):
   - מעצב אמיתי לא שם כיתוב על כל פוסט!
   - אם הפוסט הוא צילום אווירה, תיאבון, מלאכת יד או מאחורי הקלעים — עדיף ברוב המקרים has_overlay = false! תן לתמונה לנשום.
   - אם הפוסט הוא מודעת פתיחת הזמנות, שעות חג, תזכורת אחרונה, מבצע או הכרזה חשובה — has_overlay = true.
3. אם has_overlay הוא true:
   - overlay_headline: כותרת קצרה ומעוצבת בעברית בת 2 עד 5 מילים בלבד! (למשל: "החלות החמות של שישי", "סוגרים הזמנות לסוכות", "טרי מהתנור ב-07:00"). אל תחזור על כל כותרת הפוסט הארוכה.
   - overlay_badge: תגית עליונה של מילה-שתיים (למשל: "מהדורת חג", "בשישי בלבד", "חדש", "עד 13:00").
   - overlay_position: המיקום הנכון ביותר בקומפוזיציה (top_right, top_left, bottom_pill, bottom_bar, center_card).
   - overlay_theme: סגנון העיצוב (paper_badge, ink_pill, accent_banner, frosted_glass, minimal_text).
4. אם has_overlay הוא false:
   - overlay_headline ריק ("").
   - overlay_badge ריק ("").
   - overlay_position: "bottom_pill".
   - overlay_theme: "ink_pill".
"""
    creative = loads(strategy_json(prompt, DESIGNER_POST_CREATIVE_SCHEMA), {})
    if not creative.get("scene_description"):
        raise RuntimeError("Gemini לא החזיר תוכנית עיצוב מלאה לפוסט.")
    return creative


def apply_creative_to_post(post: dict, creative: dict) -> dict:
    has_overlay = bool(creative.get("has_overlay"))
    headline = (creative.get("overlay_headline") or "").strip() if has_overlay else ""
    badge = (creative.get("overlay_badge") or "").strip() if has_overlay else ""
    position = creative.get("overlay_position") or "bottom_pill"
    theme = creative.get("overlay_theme") or "ink_pill"

    post["creative_concept"] = creative.get("creative_concept", "")
    post["visual_style"] = creative.get("visual_style", "")
    post["scene_description"] = creative.get("scene_description", "")
    post["image_prompt"] = creative.get("scene_description", "")
    post["has_overlay"] = has_overlay
    post["overlay_headline"] = headline
    post["overlay_badge"] = badge
    post["overlay_position"] = position
    post["overlay_theme"] = theme
    post["overlay_text"] = headline
    post["design_creative"] = creative
    return post


def design_and_generate_post(
    business_id: int,
    post: dict,
    brand: dict,
    business: dict,
    vibe: str = "",
    custom_prompt: str = "",
    generate_image: bool = True,
) -> tuple[dict, str | None]:
    creative = plan_post_design(post, brand, business, vibe=vibe, custom_prompt=custom_prompt)
    apply_creative_to_post(post, creative)

    image_url = None
    if generate_image:
        image_url = generate_and_store(
            business_id,
            post,
            brand,
            business,
        )
        post["image_url"] = image_url

    return post, image_url
