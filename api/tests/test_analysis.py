"""Analysis keeps the lightweight model and evidence guardrails in its own path."""
import _test_env  # noqa: F401

import unittest
from unittest.mock import patch

from app.services import diagnostics
from app.services.schemas_llm import DIAGNOSTIC_SCHEMA, RECOMMENDATION_SCHEMA


class AnalysisTest(unittest.TestCase):
    @patch("app.services.diagnostics.lite_json", return_value='{"headline":"אין מדידת הזמנות"}')
    def test_diagnosis_uses_medium_and_keeps_measurement_gaps(self, model):
        result = diagnostics.diagnose({"name": "דוגמה"}, {"overview": {"sessions": "80"}}, {})
        self.assertEqual(result["headline"], "אין מדידת הזמנות")
        self.assertEqual(model.call_args.args[1], DIAGNOSTIC_SCHEMA)
        self.assertEqual(model.call_args.kwargs["thinking_level"], "MEDIUM")
        prompt = model.call_args.args[0]
        self.assertIn("sessions", prompt)
        self.assertIn("נתון חסר אינו אפס", prompt)
        self.assertIn("לא בהכרח פניות או הזמנות", prompt)

    @patch("app.services.diagnostics.lite_json", return_value='{"week_summary":"צריך לבדוק מדידה","suggestions":[]}')
    def test_recommendation_uses_plan_and_allows_no_useful_action(self, model):
        result = diagnostics.recommend({"name": "דוגמה"}, {"goal": "הזמנות מאומתות"}, {}, {}, {})
        self.assertEqual(result["suggestions"], [])
        self.assertEqual(model.call_args.args[1], RECOMMENDATION_SCHEMA)
        self.assertEqual(model.call_args.kwargs["thinking_level"], "MEDIUM")
        prompt = model.call_args.args[0]
        self.assertIn("הזמנות מאומתות", prompt)
        self.assertIn("אין לטעון להצלחה במכירות", prompt)
        self.assertIn("החזירו רשימה ריקה", prompt)
