"""Outbound customer connector; isolated SQLite and controlled receiver transports."""
import _test_env  # noqa: F401

import hashlib
import hmac
import json
import shutil
import ssl
import tempfile
import threading
import unittest
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from ipaddress import ip_address
from pathlib import Path
from unittest import mock

import httpx
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_db
from app.deps import get_current_user
from app.main import app
from app.models import Business, User, WebhookDelivery, WebhookEndpoint
from app.services import webhooks
from app.services.netguard import UnsafeUrlError


class CustomerWebhookTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="isramarket-webhooks-"))
        self.engine = create_engine(f"sqlite:///{self.tmp / 'test.db'}", connect_args={"check_same_thread": False})
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()
        owner, other = User(email="webhook-a@example.test", full_name="Owner"), User(email="webhook-b@example.test", full_name="Other")
        self.db.add_all([owner, other]); self.db.flush()
        self.business = Business(user_id=owner.id, name="Receiver test")
        self.other = Business(user_id=other.id, name="Other receiver test")
        self.db.add_all([self.business, self.other]); self.db.commit()
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: owner
        self.client = TestClient(app)
        self.public = mock.patch.object(webhooks, "assert_public_url", return_value="https://receiver.example/hook")
        self.public.start()
        self.sleep = mock.patch.object(webhooks.time, "sleep")
        self.wait = self.sleep.start()

    def tearDown(self):
        self.sleep.stop(); self.public.stop(); app.dependency_overrides.clear()
        self.db.close(); self.engine.dispose(); shutil.rmtree(self.tmp, ignore_errors=True)

    def receiver(self, business=None, **values):
        item = WebhookEndpoint(business_id=(business or self.business).id,
            url=values.get("url", "https://receiver.example/hook?token=private-url-token"),
            secret="private-signing-secret", events=values.get("events", "recommendations,strategy"))
        self.db.add(item); self.db.commit()
        return item

    def send(self, endpoints, **kwargs):
        return webhooks.deliver(endpoints, "recommendations",
            {"business_id": self.business.id, "suggestions": [{"headline": "תוכנית לבדיקה"}]},
            db=self.db, event_id="recommendations:qa-record", **kwargs)

    def test_only_2xx_acknowledges_delivery(self):
        item = self.receiver()
        for status in (200, 201, 202, 204, 299):
            with self.subTest(status=status), mock.patch.object(webhooks.httpx, "post", return_value=httpx.Response(status)) as post:
                result = self.send([item])[0]
                self.assertTrue(result["ok"]); self.assertEqual(result["attempts"], 1)
                self.assertFalse(post.call_args.kwargs["follow_redirects"])
                self.assertEqual(post.call_args.kwargs["timeout"], 15)

    def test_redirects_and_permanent_refusals_are_not_retried_or_followed(self):
        item = self.receiver()
        for status in (301, 302, 303, 307, 308, 400, 401, 403, 404, 410, 422):
            with self.subTest(status=status), mock.patch.object(webhooks.httpx, "post", return_value=httpx.Response(status, headers={"Location": "https://other.example/"})) as post:
                result = self.send([item])[0]
                self.assertFalse(result["ok"]); self.assertEqual(post.call_count, 1)
                self.assertEqual(result["status"], status)
        self.wait.assert_not_called()

    def test_transient_errors_retry_identical_signed_bytes_with_stable_identity(self):
        item = self.receiver()
        for status in (408, 425, 429, 500, 502, 503):
            with self.subTest(status=status), mock.patch.object(webhooks.httpx, "post", side_effect=[httpx.Response(status), httpx.Response(204)]) as post:
                result = self.send([item])[0]
                first, second = [call.kwargs for call in post.call_args_list]
                self.assertEqual(first["content"], second["content"])
                self.assertEqual(first["headers"], second["headers"])
                envelope = json.loads(first["content"])
                self.assertEqual(envelope["id"], "recommendations:qa-record")
                self.assertEqual(first["headers"]["X-IsraMarket-Delivery-Id"], envelope["id"])
                expected = hmac.new(item.secret.encode(), first["content"], hashlib.sha256).hexdigest()
                self.assertTrue(hmac.compare_digest(expected, first["headers"]["X-IsraMarket-Signature"]))
                self.assertTrue(result["ok"]); self.assertEqual(result["attempts"], 2)

    def test_network_failure_is_bounded_and_does_not_copy_url_or_payload_into_diagnostics(self):
        item = self.receiver()
        with mock.patch.object(webhooks.httpx, "post", side_effect=httpx.ConnectError("private-url-token and private-signing-secret")) as post:
            result = self.send([item], attempts=90)[0]
        self.assertEqual(post.call_count, 3); self.assertEqual(self.wait.call_args_list, [mock.call(1), mock.call(2)])
        self.assertEqual(result["url"], "https://receiver.example")
        log = self.db.query(WebhookDelivery).one()
        serialized = json.dumps([result, {"url": log.url, "error": log.error}])
        self.assertNotIn("private-url-token", serialized); self.assertNotIn("private-signing-secret", serialized)

    def test_timeout_is_retried_but_response_body_is_never_saved(self):
        item = self.receiver()
        with mock.patch.object(webhooks.httpx, "post", side_effect=[httpx.ReadTimeout("sensitive body"), httpx.Response(400, text="private-signing-secret")]):
            result = self.send([item])[0]
        self.assertFalse(result["ok"]); self.assertEqual(result["attempts"], 2)
        self.assertEqual(self.db.query(WebhookDelivery).one().error, "receiver_rejected_delivery")

    def test_cross_business_and_unsubscribed_endpoints_receive_nothing(self):
        own, other = self.receiver(events="strategy"), self.receiver(self.other)
        with mock.patch.object(webhooks.httpx, "post") as post:
            self.assertEqual(self.send([own, other]), [])
        post.assert_not_called()

    def test_disconnect_during_backoff_stops_retry_and_cannot_recreate_delivery_history(self):
        item = self.receiver(); item_id = item.id
        def disconnect(_delay):
            with self.Session() as separate:
                separate.query(WebhookEndpoint).filter_by(id=item_id).delete(); separate.commit()
        self.wait.side_effect = disconnect
        with mock.patch.object(webhooks.httpx, "post", return_value=httpx.Response(503)) as post:
            result = self.send([item])[0]
        self.assertEqual(post.call_count, 1); self.assertEqual(result["error"], "receiver_disconnected")
        self.assertEqual(self.db.query(WebhookDelivery).count(), 0)

    def test_disconnect_during_success_does_not_log_orphan_history(self):
        item = self.receiver(); item_id = item.id
        def acknowledge(*args, **kwargs):
            with self.Session() as separate:
                separate.query(WebhookEndpoint).filter_by(id=item_id).delete(); separate.commit()
            return httpx.Response(204)
        with mock.patch.object(webhooks.httpx, "post", side_effect=acknowledge):
            result = self.send([item])[0]
        self.assertTrue(result["ok"])  # The already in-flight request completed.
        self.assertEqual(self.db.query(WebhookDelivery).count(), 0)

    def test_retargeting_during_retry_cannot_send_to_changed_receiver(self):
        item = self.receiver(); item_id = item.id
        def change(_delay):
            with self.Session() as separate:
                separate.query(WebhookEndpoint).filter_by(id=item_id).update({"url": "https://new.example/"}); separate.commit()
        self.wait.side_effect = change
        with mock.patch.object(webhooks.httpx, "post", return_value=httpx.Response(503)) as post:
            result = self.send([item])[0]
        self.assertEqual(post.call_count, 1); self.assertFalse(result["ok"])

    def test_url_is_checked_again_for_each_attempt(self):
        item = self.receiver()
        with mock.patch.object(webhooks, "assert_public_url", side_effect=[item.url, UnsafeUrlError("not public")]) as guard, mock.patch.object(webhooks.httpx, "post", return_value=httpx.Response(503)) as post:
            result = self.send([item])[0]
        self.assertEqual(guard.call_count, 2); self.assertEqual(post.call_count, 1)
        self.assertEqual(result["error"], "receiver_url_unavailable")

    def test_legacy_plain_http_receiver_is_not_sent_business_content(self):
        item = self.receiver(url="http://receiver.example/hook")
        with mock.patch.object(webhooks.httpx, "post") as post:
            result = self.send([item])[0]
        post.assert_not_called(); self.assertFalse(result["ok"])

    def test_registration_validates_https_and_supported_events(self):
        for url in ("http://receiver.example/", "https://user:secret@receiver.example/", "https://receiver.example/#fragment"):
            with self.subTest(url=url):
                self.assertEqual(self.client.post("/integrations/webhooks", json={"url": url}).status_code, 422)
        for events in ("", "all", "strategy,unknown"):
            self.assertEqual(self.client.post("/integrations/webhooks", json={"url": "https://receiver.example/", "events": events}).status_code, 422)

    def test_registration_secret_is_returned_once_and_another_owner_cannot_disconnect(self):
        with mock.patch("app.routers.integrations.assert_public_url", return_value="https://receiver.example/"):
            created = self.client.post("/integrations/webhooks", json={"url": "https://receiver.example/", "events": " strategy, recommendations, strategy "}).json()
        self.assertTrue(created["secret"]); self.assertEqual(created["events"], "strategy,recommendations")
        listed = self.client.get("/integrations").json()["webhooks"]
        self.assertNotIn("secret", listed[0])
        other = self.receiver(self.other)
        self.assertEqual(self.client.delete(f"/integrations/webhooks/{other.id}").status_code, 404)
        self.assertEqual(self.client.delete(f"/integrations/webhooks/{created['id']}").status_code, 200)

    def test_receiver_failure_does_not_erase_a_saved_recommendation(self):
        from app.models import Recommendation
        rec = Recommendation(business_id=self.business.id, week_of="2026-11-07", suggestions_json='{"items":[]}')
        self.db.add(rec); self.db.commit(); record_id = rec.id
        with mock.patch.object(webhooks.httpx, "post", return_value=httpx.Response(503)):
            self.send([self.receiver()])
        self.assertIsNotNone(self.db.get(Recommendation, record_id))

    def test_disconnect_removes_its_delivery_records_without_touching_another_owner(self):
        own, other = self.receiver(), self.receiver(self.other)
        with mock.patch.object(webhooks.httpx, "post", return_value=httpx.Response(204)):
            self.send([own])
            webhooks.deliver([other], "strategy", {"business_id": self.other.id}, db=self.db)
        self.assertEqual(self.db.query(WebhookDelivery).count(), 2)
        self.assertEqual(self.client.delete(f"/integrations/webhooks/{own.id}").status_code, 200)
        self.assertEqual([row.endpoint_id for row in self.db.query(WebhookDelivery).all()], [other.id])

    def test_saved_endpoint_is_not_a_delivered_message_and_status_is_owner_scoped(self):
        own, other = self.receiver(), self.receiver(self.other)
        initial = self.client.get("/integrations").json()["webhooks"]
        self.assertEqual(len(initial), 1); self.assertIsNone(initial[0]["last_delivery"])
        with mock.patch.object(webhooks.httpx, "post", return_value=httpx.Response(204)):
            self.send([own])
            webhooks.deliver([other], "strategy", {"business_id": self.other.id}, db=self.db)
        with mock.patch.object(webhooks.httpx, "post", return_value=httpx.Response(400, text="private-signing-secret")):
            self.send([own])
        listing = self.client.get("/integrations").json()["webhooks"]
        self.assertEqual(len(listing), 1)
        last = listing[0]["last_delivery"]
        self.assertFalse(last["ok"]); self.assertEqual(last["status_code"], 400)
        self.assertEqual(last["attempts"], 1); self.assertTrue(last["at"])
        self.assertNotIn("private-signing-secret", json.dumps(listing))

    def test_real_local_tls_receiver_verifies_signature_and_applies_retries_once(self):
        """Real TLS/HTTP, synthetic data; only this test permits its loopback receiver.

        This is not external deployment/provider proof. Production URL validation is
        covered separately and continues to refuse loopback/private destinations.
        """
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Local webhook QA")])
        now = datetime.now(timezone.utc)
        certificate = (x509.CertificateBuilder().subject_name(subject).issuer_name(subject)
            .public_key(key.public_key()).serial_number(x509.random_serial_number())
            .not_valid_before(now - timedelta(minutes=1)).not_valid_after(now + timedelta(hours=1))
            .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
            .add_extension(x509.SubjectAlternativeName([x509.IPAddress(ip_address("127.0.0.1"))]), critical=False)
            .sign(key, hashes.SHA256()))
        cert_file, key_file = self.tmp / "receiver.pem", self.tmp / "receiver-key.pem"
        cert_file.write_bytes(certificate.public_bytes(serialization.Encoding.PEM))
        key_file.touch(mode=0o600)
        key_file.write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
        tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        tls.load_cert_chain(cert_file, key_file)
        requests, applied = [], set()

        class Receiver(BaseHTTPRequestHandler):
            def do_POST(inner):
                body = inner.rfile.read(int(inner.headers["Content-Length"]))
                expected = hmac.new(b"private-signing-secret", body, hashlib.sha256).hexdigest()
                if not hmac.compare_digest(expected, inner.headers.get("X-IsraMarket-Signature", "")):
                    inner.send_response(401); inner.end_headers(); return
                envelope = json.loads(body)
                requests.append((body, inner.headers["X-IsraMarket-Delivery-Id"]))
                applied.add(envelope["id"])
                # First request is processed, but the receiver fails to acknowledge.
                inner.send_response(503 if len(requests) == 1 else 204)
                inner.end_headers()

            def log_message(inner, *args):
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), Receiver)
        server.socket = tls.wrap_socket(server.socket, server_side=True)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        url = f"https://127.0.0.1:{server.server_port}/hook"
        item = self.receiver(url=url)
        trusted = ssl.create_default_context(cafile=str(cert_file))
        def allow_local_receiver(candidate):
            if candidate != url:
                raise UnsafeUrlError("Unexpected test receiver")
            return candidate
        try:
            with httpx.Client(verify=trusted, trust_env=False) as client:
                with mock.patch.object(webhooks, "assert_public_url", side_effect=allow_local_receiver), mock.patch.object(webhooks.httpx, "post", side_effect=client.post):
                    first, repeated = self.send([item])[0], self.send([item])[0]
            self.assertTrue(first["ok"]); self.assertEqual(first["attempts"], 2)
            self.assertTrue(repeated["ok"])
            self.assertEqual(len(requests), 3); self.assertEqual(len(applied), 1)
            self.assertEqual(requests[0], requests[1])
            self.assertEqual({identity for _, identity in requests}, {"recommendations:qa-record"})
        finally:
            server.shutdown(); server.server_close(); thread.join(timeout=2)


if __name__ == "__main__":
    unittest.main()
