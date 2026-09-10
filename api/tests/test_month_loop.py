import unittest

from app.services.month_loop import next_civil_month, prior_month_review


class MonthLoopTest(unittest.TestCase):
    def test_next_civil_month(self):
        self.assertEqual(next_civil_month(2026, 9), (2026, 10))
        self.assertEqual(next_civil_month(2026, 12), (2027, 1))

    def test_prior_review_does_not_invent_metrics(self):
        review = prior_month_review(
            {
                "year": 2026,
                "month": 9,
                "month_name_he": "ספטמבר",
                "usp": {"usp": "חלה", "growth_hypothesis": "אם נסגור הזמנות מוקדם נמכור את החלות"},
                "roadmap": {
                    "theme": "חגי תשרי",
                    "posts": [
                        {"title": "חלות", "approval_status": "approved", "format": "image"},
                        {
                            "title": "סוכות",
                            "approval_status": "review",
                            "format": "reel",
                            "published_url": "https://instagram.com/p/x",
                            "utm": {"utm_campaign": "isramarket-2026-09"},
                        },
                    ],
                },
            }
        )
        self.assertEqual(review["posts_total"], 2)
        self.assertEqual(review["posts_approved"], 1)
        self.assertEqual(review["posts_published"], 1)
        self.assertFalse(review["has_performance"])
        self.assertEqual(review["attribution"], [])
        self.assertIsNone(review["diagnostic"])


if __name__ == "__main__":
    unittest.main()
