SITE_EXTRACT_SCHEMA = {
    "type": "object",
    "title": "SiteExtract",
    "description": "ערך שיווקי שחולץ מאתר העסק",
    "properties": {
        "business_name": {"type": "string", "description": "שם העסק כפי שעולה מהאתר"},
        "value_propositions": {
            "type": "array",
            "description": "הצעות ערך מרכזיות",
            "items": {"type": "string"},
        },
        "tone": {"type": "string", "description": "טון המותג"},
        "audience": {"type": "string", "description": "קהל היעד העיקרי"},
        "offers": {
            "type": "array",
            "description": "מוצרים או שירותים מזוהים",
            "items": {"type": "string"},
        },
        "proof_points": {
            "type": "array",
            "description": "הוכחות, המלצות או בידול שמופיעים באתר",
            "items": {"type": "string"},
        },
    },
    "required": [
        "business_name",
        "value_propositions",
        "tone",
        "audience",
        "offers",
        "proof_points",
    ],
}

COMPETITOR_EXTRACT_SCHEMA = {
    "type": "object",
    "title": "CompetitorExtract",
    "description": "מיצוב מתחרה מאתר ציבורי",
    "properties": {
        "positioning": {"type": "string", "description": "איך המתחרה מציג את עצמו"},
        "offers": {"type": "array", "items": {"type": "string"}},
        "claimed_advantages": {"type": "array", "items": {"type": "string"}},
        "weak_spots": {
            "type": "array",
            "description": "פערים שעולים מהאתר עצמו, בלי להמציא",
            "items": {"type": "string"},
        },
    },
    "required": ["positioning", "offers", "claimed_advantages", "weak_spots"],
}

USP_SCHEMA = {
    "type": "object",
    "title": "StrategyDefinition",
    "description": "אסטרטגיה עסקית, בידול, השערת צמיחה ושיטות עבודה מוכחות",
    "properties": {
        "usp": {"type": "string", "description": "הצעת ערך ייחודית מנוסחת"},
        "usp_one_liner": {"type": "string", "description": "משפט אחד לקמפיין"},
        "why_now": {"type": "string", "description": "למה זה רלוונטי לשוק הישראלי עכשיו"},
        "competitor_gaps": {
            "type": "array",
            "items": {"type": "string"},
            "description": "פערים וחולשות אצל המתחרים",
        },
        "risks": {"type": "array", "items": {"type": "string"}},
        "proof_points": {"type": "array", "items": {"type": "string"}},
        "messaging_pillars": {"type": "array", "items": {"type": "string"}},
        "growth_hypothesis": {
            "type": "string",
            "description": "השערת צמיחה חדה: אם נבצע X נשיג Y בתוך פרק זמן Z",
        },
        "growth_targets": {
            "type": "array",
            "items": {"type": "string"},
            "description": "יעדים מדידים ספציפיים",
        },
        "known_bkms": {
            "type": "array",
            "items": {"type": "string"},
            "description": "שיטות עבודה מוכחות (Best Known Methods) לתחום ולסוג העסק",
        },
        "budget_allocation": {
            "type": "object",
            "properties": {
                "meta_ads_share_pct": {"type": "integer"},
                "organic_production_share_pct": {"type": "integer"},
                "local_promotion_share_pct": {"type": "integer"},
                "guidance": {"type": "string", "description": "הנחיות לחלוקת התקציב"},
            },
            "required": [
                "meta_ads_share_pct",
                "organic_production_share_pct",
                "local_promotion_share_pct",
                "guidance",
            ],
        },
    },
    "required": [
        "usp",
        "usp_one_liner",
        "why_now",
        "competitor_gaps",
        "risks",
        "proof_points",
        "messaging_pillars",
        "growth_hypothesis",
        "growth_targets",
        "known_bkms",
        "budget_allocation",
    ],
}

HYPOTHESES_SCHEMA = {
    "type": "object",
    "title": "GrowthHypotheses",
    "description": "שלוש השערות צמיחה לבחירת בעל העסק",
    "properties": {
        "hypotheses": {
            "type": "array",
            "minItems": 3,
            "maxItems": 3,
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "title": {"type": "string", "description": "כותרת קצרה בעברית"},
                    "hypothesis": {
                        "type": "string",
                        "description": "אם נעשה X נשיג Y בתוך זמן Z",
                    },
                    "why_this": {"type": "string", "description": "למה זה מתאים לעסק הזה"},
                },
                "required": ["id", "title", "hypothesis", "why_this"],
            },
        }
    },
    "required": ["hypotheses"],
}

BRAND_LANGUAGE_SCHEMA = {
    "type": "object",
    "title": "BrandLanguage",
    "description": "שפת עיצוב ומסרים שחולצה מהאתר עצמו",
    "properties": {
        "business_name": {"type": "string"},
        "palette": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "hex": {"type": "string"},
                    "role": {
                        "type": "string",
                        "enum": ["primary", "accent", "background", "ink", "secondary"],
                    },
                    "name": {"type": "string", "description": "שם צבע בעברית"},
                },
                "required": ["hex", "role", "name"],
            },
        },
        "typography": {
            "type": "object",
            "properties": {
                "primary": {"type": "string"},
                "mood": {"type": "string"},
            },
            "required": ["primary", "mood"],
        },
        "visual_style": {"type": "string", "description": "איך האתר נראה: חומרים, קומפוזיציה, רמת גימור"},
        "photography": {"type": "string", "description": "סגנון הצילום באתר"},
        "voice": {"type": "string", "description": "טון הדיבור באתר"},
        "voice_examples": {"type": "array", "items": {"type": "string"}},
        "do_say": {"type": "array", "items": {"type": "string"}},
        "dont_say": {"type": "array", "items": {"type": "string"}},
        "messaging": {"type": "array", "items": {"type": "string"}},
        "offers_seen": {"type": "array", "items": {"type": "string"}},
        "audience": {"type": "string"},
        "logo_description": {"type": "string"},
    },
    "required": [
        "business_name",
        "palette",
        "typography",
        "visual_style",
        "photography",
        "voice",
        "voice_examples",
        "do_say",
        "dont_say",
        "messaging",
        "offers_seen",
        "audience",
        "logo_description",
    ],
}

ROADMAP_ITEM_SCHEMA = {
    "type": "object",
    "properties": {
        "week": {"type": "integer", "description": "מספר השבוע בחודש, 1-5"},
        "date_hint": {"type": "string", "description": "תאריך מומלץ YYYY-MM-DD או טווח"},
        "format": {
            "type": "string",
            "enum": ["reel", "carousel", "image", "story"],
            "description": "פורמט התוכן",
        },
        "title": {"type": "string"},
        "angle": {"type": "string", "description": "זווית המסר"},
        "hook": {"type": "string", "description": "משפט פתיחה"},
        "caption": {"type": "string", "description": "טיוטת כיתוב בעברית"},
        "cta": {"type": "string"},
        "calendar_tie": {"type": "string", "description": "איזה אירוע בלוח השנה זה משרת, אם בכלל"},
        "goal_fit": {"type": "string", "description": "איך זה משרת מכירות או מודעות"},
        "why_now": {
            "type": "string",
            "description": "משפט אחד לבעל העסק: למה הפוסט הזה בחודש הזה, בלי שפת סוכנות",
        },
        "image_prompt": {
            "type": "string",
            "description": "Prompt באנגלית ליצירת התמונה, בסגנון הוויזואלי של האתר",
        },
        "overlay_text": {
            "type": "string",
            "description": "טקסט עברי קצר שיופיע על התמונה, עד שש מילים",
        },
        "primary_outlet": {
            "type": "string",
            "enum": ["instagram", "facebook", "whatsapp", "tiktok"],
            "description": "רשת ראשית",
        },
        "outlets": {
            "type": "array",
            "items": {"type": "string"},
            "description": "רשתות שבהן יפורסם הפוסט",
        },
        "metrics_to_watch": {
            "type": "array",
            "items": {"type": "string"},
            "description": "מה מודדים בפוסט הזה",
        },
        "outlet_captions": {
            "type": "object",
            "properties": {
                "instagram": {"type": "string"},
                "facebook": {"type": "string"},
                "whatsapp": {"type": "string"},
            },
            "required": ["instagram", "facebook", "whatsapp"],
        },
    },
    "required": [
        "week",
        "date_hint",
        "format",
        "title",
        "angle",
        "hook",
        "caption",
        "cta",
        "calendar_tie",
        "goal_fit",
        "why_now",
        "image_prompt",
        "overlay_text",
        "primary_outlet",
        "outlets",
        "metrics_to_watch",
        "outlet_captions",
    ],
}

ROADMAP_SCHEMA = {
    "type": "object",
    "title": "MonthlyRoadmapAndPlan",
    "description": "תוכנית חודשית מפורקת: אירועים, יעדי טווח ארוך, תוכנית שבועית ופוסטים",
    "properties": {
        "theme": {"type": "string", "description": "נושא-העל של החודש"},
        "summary": {"type": "string"},
        "relevant_events": {
            "type": "array",
            "description": "אירועים מלוח השנה שרלוונטיים ספציפית למוצרי העסק",
            "items": {
                "type": "object",
                "properties": {
                    "date": {"type": "string"},
                    "name": {"type": "string"},
                    "business_relevance": {"type": "string"},
                    "relevance_tier": {"type": "string", "enum": ["critical", "high", "medium"]},
                },
                "required": ["date", "name", "business_relevance", "relevance_tier"],
            },
        },
        "long_horizon_plan": {
            "type": "object",
            "description": "השערת טווח ארוך ואבני דרך",
            "properties": {
                "horizon": {"type": "string"},
                "hypothesis": {"type": "string"},
                "targets": {"type": "array", "items": {"type": "string"}},
                "milestones": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "month_label": {"type": "string"},
                            "milestone": {"type": "string"},
                            "checkpoint": {"type": "string"},
                        },
                        "required": ["month_label", "milestone", "checkpoint"],
                    },
                },
            },
            "required": ["horizon", "hypothesis", "targets", "milestones"],
        },
        "monthly_horizon_plan": {
            "type": "object",
            "description": "השערת החודש הקרוב ויעדים",
            "properties": {
                "hypothesis": {"type": "string"},
                "targets": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["hypothesis", "targets"],
        },
        "management_and_checkpoints": {
            "type": "object",
            "description": "איך אנו עוזרים לנהל ומתי נצטרך אישור מהעסק",
            "properties": {
                "how_we_help": {"type": "string"},
                "when_we_need_user": {"type": "array", "items": {"type": "string"}},
                "checkpoints": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "timing": {"type": "string"},
                            "purpose": {"type": "string"},
                            "user_action": {"type": "string"},
                        },
                        "required": ["timing", "purpose", "user_action"],
                    },
                },
            },
            "required": ["how_we_help", "when_we_need_user", "checkpoints"],
        },
        "weekly_breakdown": {
            "type": "array",
            "description": "חלוקה שבועית: מה אנו עושים, מה המשתמש עושה, מה מודדים ורואים",
            "items": {
                "type": "object",
                "properties": {
                    "week": {"type": "integer"},
                    "focus": {"type": "string"},
                    "what_we_do": {"type": "array", "items": {"type": "string"}},
                    "what_user_does": {"type": "array", "items": {"type": "string"}},
                    "metrics_target": {"type": "array", "items": {"type": "string"}},
                    "media_distribution": {"type": "string"},
                },
                "required": [
                    "week",
                    "focus",
                    "what_we_do",
                    "what_user_does",
                    "metrics_target",
                    "media_distribution",
                ],
            },
        },
        "posts": {
            "type": "array",
            "items": ROADMAP_ITEM_SCHEMA,
        },
    },
    "required": [
        "theme",
        "summary",
        "relevant_events",
        "long_horizon_plan",
        "monthly_horizon_plan",
        "management_and_checkpoints",
        "weekly_breakdown",
        "posts",
    ],
}

PLAN_CORE_SCHEMA = {
    "type": "object",
    "title": "MonthlyPlanCore",
    "description": "כיוון החודש בלי הפוסטים עצמם",
    "properties": {key: value for key, value in ROADMAP_SCHEMA["properties"].items() if key != "posts"},
    "required": [
        "theme",
        "summary",
        "relevant_events",
        "long_horizon_plan",
        "monthly_horizon_plan",
        "management_and_checkpoints",
        "weekly_breakdown",
    ],
}

MONTHLY_POSTS_SCHEMA = {
    "type": "object",
    "title": "MonthlyPosts",
    "description": "3 עד 4 פוסטים לזוג שבועות",
    "properties": {
        "posts": {
            "type": "array",
            "items": ROADMAP_ITEM_SCHEMA,
        }
    },
    "required": ["posts"],
}

POST_REWRITE_SCHEMA = {
    "type": "object",
    "title": "PostRewrite",
    "description": "שכתוב פוסט בסגנון ובטון מבוקש",
    "properties": {
        "title": {"type": "string"},
        "hook": {"type": "string"},
        "caption": {"type": "string"},
        "cta": {"type": "string"},
        "overlay_text": {"type": "string"},
        "outlet_captions": {
            "type": "object",
            "properties": {
                "instagram": {"type": "string"},
                "facebook": {"type": "string"},
                "whatsapp": {"type": "string"},
            },
            "required": ["instagram", "facebook", "whatsapp"],
        },
    },
    "required": ["title", "hook", "caption", "cta", "overlay_text", "outlet_captions"],
}

DIAGNOSTIC_SCHEMA = {
    "type": "object",
    "title": "PerformanceDiagnostic",
    "description": "אבחון ביצועים מ-GA4 ומטא",
    "properties": {
        "headline": {"type": "string"},
        "top_content": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "label": {"type": "string"},
                    "why": {"type": "string"},
                },
                "required": ["label", "why"],
            },
        },
        "bottom_content": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "label": {"type": "string"},
                    "why": {"type": "string"},
                },
                "required": ["label", "why"],
            },
        },
        "funnel_issues": {"type": "array", "items": {"type": "string"}},
        "metric_highlights": {"type": "array", "items": {"type": "string"}},
    },
    "required": [
        "headline",
        "top_content",
        "bottom_content",
        "funnel_issues",
        "metric_highlights",
    ],
}

RECOMMENDATION_SCHEMA = {
    "type": "object",
    "title": "WeeklyRecommendations",
    "description": "המלצות איטרציה לשבוע הקרוב",
    "properties": {
        "week_summary": {"type": "string"},
        "suggestions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "priority": {"type": "string", "enum": ["high", "medium", "low"]},
                    "title": {"type": "string"},
                    "action": {"type": "string", "description": "פעולה קונקרטית"},
                    "evidence": {"type": "string", "description": "על סמך איזה מדד"},
                    "target": {"type": "string", "description": "פוסט, CTA, קהל או עמוד"},
                },
                "required": ["priority", "title", "action", "evidence", "target"],
            },
        },
    },
    "required": ["week_summary", "suggestions"],
}

DESIGNER_POST_CREATIVE_SCHEMA = {
    "type": "object",
    "title": "PostDesignCreative",
    "description": "הנחיית ארט-דיירקשן, קונספט ויזואלי והחלטות עיצוב גרפי לפוסט ברשתות החברתיות",
    "properties": {
        "creative_concept": {
            "type": "string",
            "title": "Creative Concept",
            "description": "הסבר בעברית של הקונספט הוויזואלי שנבחר לפוסט: מה האסטרטגיה הוויזואלית, מדוע נבחר המראה הזה, ואיזה רגש הוא מעביר לצופים.",
        },
        "visual_style": {
            "type": "string",
            "title": "Visual Style",
            "description": "הגדרת סגנון הצילום והאסתטיקה (למשל: צילום עריכתי חם של מוצרי מאפה, צילום אווירה אותנטי מאחורי הקלעים, מינימליזם נקי ומודרני, אווירת חג עשירה על שולחן עץ כפרי).",
        },
        "scene_description": {
            "type": "string",
            "title": "Scene Description for Image Generation",
            "description": "Detailed English photographic art-direction prompt for Gemini image generation. Describe the exact scene, subject matter, materials, natural lighting direction, camera focal length/angle, color palette from brand, depth of field, and context. CRITICAL: Strictly DO NOT include any text, letters, typography, watermarks, or social media chrome.",
        },
        "has_overlay": {
            "type": "boolean",
            "title": "Has Overlay",
            "description": "האם מתאים לשלב כיתוב מעוצב על גבי התמונה (True למודעות, מבצעים, הודעות חג, זמני פעילות) או שעדיף צילום גיבור נקי לחלוטין ללא כל טקסט (False לצילומי תיאבון, מלאכת יד, אותנטיות).",
        },
        "overlay_headline": {
            "type": "string",
            "title": "Overlay Headline",
            "description": "כותרת קצרה, מעוצבת וקולעת בעברית בת 2 עד 5 מילים (למשל: 'החלות החמות של שישי', 'סוגרים הזמנות לסוכות', 'טרי מהתנור ב-07:00'). אם has_overlay הוא false, החזר מחרוזת ריקה.",
        },
        "overlay_badge": {
            "type": "string",
            "title": "Overlay Badge",
            "description": "תגית קטנה או קיקר של מילה עד שתיים (למשל: 'מהדורת חג', 'בשישי בלבד', 'חדש', 'עד 13:00'). אם has_overlay הוא false, החזר מחרוזת ריקה.",
        },
        "overlay_position": {
            "type": "string",
            "title": "Overlay Position",
            "description": "מיקום הכיתוב על התמונה: top_right (פינה ימנית עליונה), top_left (פינה שמאלית), bottom_pill (תג צף במרכז למטה), bottom_bar (פס תחתון אלגנטי), center_card (כרטיס מרכזי להודעות ואירועים).",
        },
        "overlay_theme": {
            "type": "string",
            "title": "Overlay Theme",
            "description": "הסגנון העיצובי של הכיתוב: paper_badge (מדבקת נייר חם עם מסגרת עדינה), ink_pill (תגית דיו שחורה יוקרתית), accent_banner (פס בצבע המותג), frosted_glass (זכוכית חלבית מטושטשת), minimal_text (טיפוגרפיה נקייה עם צל עדין).",
        },
    },
    "required": [
        "creative_concept",
        "visual_style",
        "scene_description",
        "has_overlay",
        "overlay_headline",
        "overlay_badge",
        "overlay_position",
        "overlay_theme",
    ],
}
