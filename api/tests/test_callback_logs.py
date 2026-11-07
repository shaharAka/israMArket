"""Authentication queries reach routes, but stay out of server access-log paths."""
import _test_env  # noqa: F401
import asyncio
import unittest
from app.main import CallbackLogMiddleware
from uvicorn.protocols.utils import get_path_with_query_string


class CallbackLogTest(unittest.TestCase):
    def test_callbacks_keep_parameters_for_handler_not_server_log_scope(self):
        for path in CallbackLogMiddleware.PATHS:
            with self.subTest(path=path):
                seen = []
                async def handler(scope, receive, send):
                    seen.append(scope['query_string'])
                scope = {'type': 'http', 'path': path, 'query_string': b'code=qa-code&state=qa-state'}
                asyncio.run(CallbackLogMiddleware(handler)(scope, None, None))
                self.assertEqual(seen, [b'code=qa-code&state=qa-state'])
                self.assertEqual(get_path_with_query_string(scope), path)

    def test_other_queries_and_lifespan_are_unchanged(self):
        for scope in [{'type': 'http', 'path': '/research/history', 'query_string': b'limit=5'}, {'type': 'lifespan'}]:
            seen = []
            async def handler(inner, receive, send):
                seen.append(inner)
            asyncio.run(CallbackLogMiddleware(handler)(scope, None, None))
            self.assertIs(seen[0], scope)
