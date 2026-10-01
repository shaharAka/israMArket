import _test_env  # noqa: F401

import unittest

from app.schemas import PostPublishIn
from app.services.journey import is_published


class PublishWithoutLinkTest(unittest.TestCase):
    def test_link_is_optional(self):
        body = PostPublishIn(post_index=0)
        self.assertEqual(body.published_url, "")

    def test_published_at_alone_counts_as_published(self):
        self.assertTrue(is_published({"published_at": "2026-10-02T10:00:00"}))
        self.assertTrue(is_published({"published_url": "https://www.instagram.com/p/x/"}))
        self.assertFalse(is_published({"approval_status": "approved"}))


if __name__ == "__main__":
    unittest.main()
