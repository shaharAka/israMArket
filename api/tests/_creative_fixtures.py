def direction(composition="full_bleed", mode="photo_only", duration=0):
    return {"platform_treatment": "מסר ברור שמתאים לערוץ שנבחר", "distinctiveness": "פעולה אמיתית במקום עוד תמונת אווירה",
            "asset_ids": [], "asset_notes": "יש לשמור על החומרים והזהות של העסק",
            "layout": {"composition": composition, "text_position": "bottom", "text_mode": mode},
            "shots": [{"start": 0.0, "end": float(duration), "action": "ידיים מבצעות פעולה אמיתית ברצף", "camera": "מצלמה יציבה"}] if duration else [],
            "sound": "צלילי עבודה שקטים" if duration else ""}


def fake_plan(prompt, schema, **_kwargs):
    import json
    from app.services.dna_library import COMPOSITIONS
    choices = schema["$defs"]["Layout"]["properties"]["composition"]["enum"]
    key = "full_bleed" if "full_bleed" in choices else choices[0]
    comp = COMPOSITIONS[key]
    mode = "photo_only" if "photo_only" in comp.text_modes else comp.text_modes[0]
    value = {"creative_concept": "רגע אמיתי בעסק", "visual_style": "אור יום", "scene_description": "A loaf on a counter in daylight.",
             "has_overlay": mode != "photo_only", "overlay_headline": "טרי מהתנור" if mode != "photo_only" else "",
             "overlay_sub": "", "overlay_badge": "", "direction": direction(key, mode)}
    value["direction"]["layout"]["text_position"] = comp.text_positions[0]
    return json.dumps(value)
