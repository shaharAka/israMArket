"""The business field list: industries only, stored as keys, old values still accepted."""

import _test_env  # noqa: F401  (must come before any `app` import)
import json
import re
import unittest
from pathlib import Path

from pydantic import ValidationError
from sqlalchemy import create_engine

from app.schemas import OnboardingIn
from app.services import business_fields as bf
from app.services import google_cost
from app.services import onboarding_draft as drafts

WEB_COPY = Path(__file__).resolve().parents[2] / "web" / "lib" / "businessFields.json"

EXPECTED = [
    ("food", "אוכל ושתייה"),
    ("fashion", "אופנה והלבשה"),
    ("jewelry", "תכשיטים ואקססוריז"),
    ("beauty", "יופי וטיפוח"),
    ("health", "בריאות וטיפול"),
    ("fitness", "ספורט וכושר"),
    ("home", "בית, עיצוב ושיפוצים"),
    ("real_estate", "נדל״ן"),
    ("professional", "שירותים מקצועיים (עו״ד, רו״ח, ייעוץ)"),
    ("education", "חינוך וסדנאות"),
    ("hospitality", "תיירות, אירוח ואירועים"),
    ("kids", "ילדים ותינוקות"),
    ("pets", "חיות מחמד"),
    ("gifts", "מתנות ופרחים"),
    ("other", "משהו אחר"),
]


class ListTest(unittest.TestCase):
    def test_web_and_api_read_the_same_list(self):
        if not WEB_COPY.exists():  # the api image is built without the web tree
            self.skipTest("web/lib/businessFields.json is not in this checkout")
        api = json.loads(bf.DATA_PATH.read_text(encoding="utf-8"))
        web = json.loads(WEB_COPY.read_text(encoding="utf-8"))
        self.assertEqual(api, web, "copy api/app/data/business_fields.json to web/lib/businessFields.json")
        # The web's typed key list (FieldKey) must be the same keys, in the same order.
        source = (WEB_COPY.parent / "businessFields.ts").read_text(encoding="utf-8")
        block = re.search(r"FIELD_KEYS = \[(.*?)\] as const", source, re.S)
        self.assertIsNotNone(block, "FIELD_KEYS not found in web/lib/businessFields.ts")
        self.assertEqual(re.findall(r'"([a-z_]+)"', block.group(1)), list(bf.FIELD_KEYS))

    def test_the_list_is_industries_only(self):
        self.assertEqual([(f.key, f.label) for f in bf.fields()], EXPECTED)
        for field in bf.fields():
            with self.subTest(field=field.key):
                for word in ("חנות", "אונליין", "קמעונ", "קומרס"):
                    self.assertNotIn(word, field.label)
                    self.assertNotIn(word, field.chip)
                self.assertNotIn('"', field.label, "labels use gershayim (״), not a quote")
                self.assertIn(field.model, {"products", "services", "both"})
                self.assertIn(field.preset, drafts.STYLE_PRESETS)
                if field.cost_industry is not None:
                    self.assertIn(field.cost_industry, google_cost.INDUSTRIES_BY_KEY)

    def test_keywords_are_folded_and_do_not_double_count(self):
        for field in bf.fields():
            for word in field.keywords:
                self.assertEqual(word, word.lower().strip())
                self.assertTrue(word)
                for other in field.keywords:
                    if other != word:
                        self.assertNotIn(word, other, f"{field.key}: '{word}' is counted twice in '{other}'")

    def test_defaults_come_from_the_list(self):
        self.assertEqual(drafts.MODEL_BY_TYPE["food"], "products")
        self.assertEqual(drafts.MODEL_BY_TYPE["professional"], "services")
        self.assertEqual(drafts.DEFAULT_PRESET_BY_TYPE["jewelry"], "luxe")
        self.assertEqual(set(drafts.MODEL_BY_TYPE), set(bf.FIELD_KEYS))


class LegacyTest(unittest.TestCase):
    CASES = [
        # (old stored value, offerings, key, presence_type)
        ("מאפייה / קפה / מסעדה", "", "food", None),
        ("חנות פיזית / קמעונאות", "חזיות, תחתונים ומארזי פיג'מות", "fashion", "brick_and_mortar"),
        ("חנות פיזית / קמעונאות", "lingerie and swimwear", "fashion", "brick_and_mortar"),
        ("חנות פיזית / קמעונאות", "זרי פרחים ומתנות לחג", "gifts", "brick_and_mortar"),
        ("חנות פיזית / קמעונאות", "צעצועים ועגלות לתינוקות", "kids", "brick_and_mortar"),
        ("חנות פיזית / קמעונאות", "מזון וציוד לכלבים ולחתולים", "pets", "brick_and_mortar"),
        ("חנות פיזית / קמעונאות", "", "other", "brick_and_mortar"),
        ("חנות אונליין (אי-קומרס)", "תכשיטים בעבודת יד, שרשראות ועגילים", "jewelry", "online_only"),
        ("חנות אונליין (אי-קומרס)", "מוצרי חשמל", "other", "online_only"),
        ('שירותים מקצועיים (עו"ד, רו"ח, ייעוץ)', "", "professional", None),
        ("שירותים מקצועיים (עו״ד, רו״ח, ייעוץ)", "", "professional", None),
        ("קליניקה, יופי ובריאות", "פיזיותרפיה ושיקום", "health", None),
        ("קליניקה, יופי ובריאות", "טיפולי פנים ואיפור", "beauty", None),
        ("קליניקה, יופי ובריאות", "", "beauty", None),
        ("סטודיו לאימון / ספורט", "", "fitness", None),
        ("עיצוב / אדריכלות / נדל״ן", "תיווך דירות למכירה", "real_estate", None),
        ('עיצוב / אדריכלות / נדל"ן', "עיצוב פנים לדירות קטנות", "home", None),
        ("עיצוב / אדריכלות / נדל״ן", "", "home", None),
        ("הדרכות, קורסים וחינוך", "", "education", None),
        ("תיירות ואירוח", "", "hospitality", None),
        ("עסק אחר", "חזיות", "other", None),
    ]

    def test_every_old_value_has_a_new_key(self):
        covered = {value for value, *_ in self.CASES}
        self.assertEqual({bf._fold(v) for v in covered}, {bf._fold(v) for v in bf.legacy_values()})
        for value, offerings, key, presence in self.CASES:
            with self.subTest(value=value, offerings=offerings):
                resolved = bf.resolve_field(value, offerings)
                self.assertEqual(resolved, bf.Resolved(key, presence))

    def test_keys_labels_and_chips_resolve_to_themselves(self):
        for field in bf.fields():
            for text in (field.key, field.label, field.chip):
                self.assertEqual(bf.resolve_field(text), bf.Resolved(field.key))
        self.assertEqual(bf.resolve_field('נדל"ן').key, "real_estate")
        self.assertIsNone(bf.resolve_field("חללית"))
        self.assertIsNone(bf.resolve_field(""))

    def test_free_text_is_read_and_falls_back_to_other(self):
        self.assertEqual(bf.coerce_field("מאפייה שכונתית / בית קפה").key, "food")
        self.assertEqual(bf.coerce_field("חנות", "לנז'רי ובגדי ים").key, "fashion")
        self.assertEqual(bf.coerce_field("חללית", "").key, "other")

    def test_label_for_prompts(self):
        self.assertEqual(bf.field_label("real_estate"), "נדל״ן")
        # Not a key: the owner's own words are kept as written.
        self.assertEqual(bf.field_label("שיפוצים ובנייה"), "שיפוצים ובנייה")
        self.assertEqual(bf.field_label(""), "")


class InferenceTest(unittest.TestCase):
    def test_from_the_owners_words(self):
        cases = [
            ("lingerie", "fashion"),
            ("Lingerie & sleepwear", "fashion"),
            ("חזיות", "fashion"),
            ("חזיות ותחתונים בכל המידות", "fashion"),
            ("מאפייה", "food"),
            ("מאפייה שכונתית, חלות לשישי", "food"),
            ("לחמי מחמצת ועוגות", "food"),
            ("תכשיטים בעבודת יד", "jewelry"),
            ("בניית ציפורניים ולק ג'ל", "beauty"),
            ("קליניקה לפיזיותרפיה", "health"),
            ("פילאטיס מכשירים", "fitness"),
            ("שיפוצים ועיצוב פנים", "home"),
            ("תיווך נדל״ן בחיפה", "real_estate"),
            ("משרד עו״ד לדיני עבודה", "professional"),
            ("הנהלת חשבונות לעצמאים", "professional"),
            ("סדנאות קרמיקה למבוגרים", "education"),
            ("צימר זוגי בגליל", "hospitality"),
            ("הפקת אירועים וחתונות", "hospitality"),
            ("צעצועים לתינוקות", "kids"),
            ("מספרת כלבים", "pets"),
            ("זרי פרחים ומתנות", "gifts"),
        ]
        for text, key in cases:
            with self.subTest(text=text):
                self.assertEqual(bf.infer_field(text), key)

    def test_nothing_recognisable_is_none_not_a_guess(self):
        self.assertIsNone(bf.infer_field("משהו שאין לו תחום"))
        self.assertIsNone(bf.infer_field(""))
        # A characteristic ("מאפיין") is not a bakery ("מאפייה").
        self.assertIsNone(bf.infer_field("מאפיינים טכניים"))


class DraftTest(unittest.TestCase):
    BASE = {"business_name": "תפר עדין", "offerings": "חזיות והלבשה תחתונה", "business_model": "products"}

    def test_old_labels_become_keys_and_keep_where_customers_come(self):
        draft = drafts.OnboardingDraft(**{**self.BASE, "business_type": "חנות אונליין (אי-קומרס)"})
        self.assertEqual(draft.business_type, "fashion")
        self.assertEqual(draft.presence_type, "online_only")
        draft = drafts.OnboardingDraft(**{**self.BASE, "business_type": "קליניקה, יופי ובריאות",
                                          "offerings": "דיאטנית קלינית"})
        self.assertEqual(draft.business_type, "health")
        self.assertIsNone(draft.presence_type)

    def test_keys_and_labels_are_accepted_and_junk_is_not(self):
        self.assertEqual(drafts.OnboardingDraft(**{**self.BASE, "business_type": "fashion"}).business_type, "fashion")
        self.assertEqual(drafts.OnboardingDraft(**{**self.BASE, "business_type": "נדל״ן"}).business_type, "real_estate")
        for junk in ("חללית", ""):
            with self.subTest(junk=junk), self.assertRaises(ValidationError):
                drafts.OnboardingDraft(**{**self.BASE, "business_type": junk})

    def test_the_prompt_says_the_label(self):
        draft = drafts.OnboardingDraft(**{**self.BASE, "business_type": "fashion"})
        self.assertIn("- תחום: אופנה והלבשה", drafts._draft_block(draft))

    def test_profile_payload_is_stored_as_a_key(self):
        body = OnboardingIn(name="תפר עדין", business_type="חנות אונליין (אי-קומרס)",
                            offerings="חזיות והלבשה תחתונה", monthly_budget_ils=0, primary_goal="sales")
        self.assertEqual(body.business_type, "fashion")
        self.assertEqual(body.presence_type, "online_only")
        explicit = OnboardingIn(name="תפר עדין", business_type="חנות אונליין (אי-קומרס)", presence_type="hybrid",
                                offerings="חזיות", monthly_budget_ils=0, primary_goal="sales")
        self.assertEqual(explicit.presence_type, "hybrid")
        self.assertEqual(OnboardingIn(name="לחם", business_type="food", offerings="לחם",
                                      monthly_budget_ils=0, primary_goal="sales").business_type, "food")


class CostMappingTest(unittest.TestCase):
    def test_each_field_lands_on_its_published_row(self):
        for field in bf.fields():
            with self.subTest(field=field.key):
                plan = google_cost.plan_from_budget(5_000, field.key, "")
                expected = field.cost_industry or google_cost.UNMATCHED_KEY
                self.assertEqual(plan.industry_key, expected)

    def test_the_owners_words_still_decide_first(self):
        industry, _ = google_cost.match_industry("home", "ריהוט וכלי בית")
        self.assertEqual(industry.key, "home_garden")
        industry, _ = google_cost.match_industry("professional", "סוכנות ביטוח ופנסיה")
        self.assertEqual(industry.key, "insurance_finance")

    def test_a_field_without_a_row_says_so(self):
        plan = google_cost.plan_from_budget(5_000, "pets", "")
        self.assertEqual(plan.cpc_range, google_cost.CPC_TIERS["medium"])
        self.assertTrue(any("לתחום 'חיות מחמד' אין שורה" in w for w in plan.warnings))
        other = google_cost.plan_from_budget(5_000, "other", "")
        self.assertFalse(any("אין שורה" in w for w in other.warnings))

    def test_an_online_only_shop_is_priced_as_ecommerce(self):
        plan = google_cost.plan_from_budget(10_000, "fashion", "חזיות", "products", presence_type="online_only")
        self.assertEqual(plan.sector_key, "ecommerce")
        shop = google_cost.plan_from_budget(10_000, "fashion", "חזיות", "products", presence_type="brick_and_mortar")
        self.assertEqual(shop.sector_key, "ecommerce")  # the fashion row itself is eCommerce
        food = google_cost.plan_from_budget(10_000, "food", "", "products", presence_type="online_only")
        self.assertEqual(food.sector_key, "ecommerce")
        services = google_cost.plan_from_budget(10_000, "beauty", "", "services", presence_type="online_only")
        self.assertEqual(services.sector_key, "local_services")

    def test_old_labels_price_as_before(self):
        self.assertEqual(google_cost.match_industry("מאפייה / קפה / מסעדה", "")[0].key, "food")
        plan = google_cost.plan_from_budget(10_000, "חנות אונליין (אי-קומרס)", "מוצרי חשמל")
        self.assertEqual(plan.sector_key, "ecommerce")


class MigrationTest(unittest.TestCase):
    def setUp(self):
        # Only the columns the migration reads and writes.
        self.engine = create_engine("sqlite:///:memory:")
        rows = [
            (1, "חנות פיזית / קמעונאות", "25% הנחה על חזיות, תחתונים ומארזי פיג'מות", "hybrid"),
            (2, "חנות אונליין (אי-קומרס)", "תכשיטים בעבודת יד", "brick_and_mortar"),
            (3, "food", "לחם", "brick_and_mortar"),
            (4, "", "", "brick_and_mortar"),
            (5, "מאפייה שכונתית / בית קפה", "מחמצת", "brick_and_mortar"),
            (6, "קליניקה, יופי ובריאות", "פיזיותרפיה", "brick_and_mortar"),
        ]
        with self.engine.connect() as conn:
            conn.exec_driver_sql(
                "CREATE TABLE businesses (id INTEGER PRIMARY KEY, business_type VARCHAR(120), "
                "offerings TEXT, presence_type VARCHAR(40))"
            )
            for business_id, business_type, offerings, presence in rows:
                conn.exec_driver_sql(
                    "INSERT INTO businesses (id, business_type, offerings, presence_type) VALUES (?, ?, ?, ?)",
                    (business_id, business_type, offerings, presence),
                )
            conn.commit()

    def tearDown(self):
        self.engine.dispose()

    def _stored(self) -> dict:
        with self.engine.connect() as conn:
            return {
                row[0]: (row[1], row[2])
                for row in conn.exec_driver_sql("SELECT id, business_type, presence_type FROM businesses")
            }

    def test_rewrites_old_values_once(self):
        with self.engine.connect() as conn:
            changed = bf.migrate_business_types(conn)
            conn.commit()
        self.assertEqual(sorted(item["id"] for item in changed), [1, 2, 5, 6])
        self.assertEqual(
            self._stored(),
            {
                1: ("fashion", "hybrid"),  # an explicit "both" is kept
                2: ("jewelry", "online_only"),  # "חנות אונליין" said where customers come
                3: ("food", "brick_and_mortar"),
                4: ("", "brick_and_mortar"),  # not answered yet stays unanswered
                5: ("food", "brick_and_mortar"),
                6: ("health", "brick_and_mortar"),
            },
        )
        with self.engine.connect() as conn:
            again = bf.migrate_business_types(conn)
            conn.commit()
        self.assertEqual(again, [])
        self.assertEqual(self._stored()[2], ("jewelry", "online_only"))


if __name__ == "__main__":
    unittest.main()
