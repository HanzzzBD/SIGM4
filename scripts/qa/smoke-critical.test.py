"""Kontrak keamanan/pembersihan CD-07; tanpa jaringan atau rahasia staging."""
import importlib.util
import contextlib
import io
import os
from pathlib import Path
import struct
import unittest
from unittest.mock import patch
import zlib

spec = importlib.util.spec_from_file_location("smoke", Path(__file__).resolve().parents[2] / "deploy/staging/smoke-critical.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SmokeContract(unittest.TestCase):
    def setUp(self):
        out, err = contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO())
        out.__enter__(); err.__enter__()
        self.addCleanup(out.__exit__, None, None, None)
        self.addCleanup(err.__exit__, None, None, None)

    def fixture(self):
        with patch.dict(os.environ, {"SMOKE_EMAIL": "fixture@test.invalid", "SMOKE_PASSWORD": "synthetic-only", "SMOKE_ROOM_ID": "1", "SMOKE_ASSET_UUID": "00000000-0000-4000-8000-000000000001"}, clear=True):
            return module.Smoke("https://staging.test")

    def test_https_no_userinfo_and_loopback_opt_in(self):
        with patch.dict(os.environ, {}, clear=True):
            for url in ("http://staging.test", "http://127.0.0.1", "https://secret:password@staging.test", "file:///etc/passwd"):
                with self.subTest(url=url), self.assertRaises(module.SmokeFailure):
                    module.trusted_url(url)
        with patch.dict(os.environ, {"SMOKE_ALLOW_HTTP_LOOPBACK": "1"}, clear=True):
            self.assertEqual(module.trusted_url("http://127.0.0.1:1234"), "http://127.0.0.1:1234")
            with self.assertRaises(module.SmokeFailure):
                module.trusted_url("http://external.test")

    def test_redirect_cannot_forward_bearer_or_login(self):
        with self.assertRaises(module.SmokeFailure):
            module.NoRedirect().redirect_request(None, None, 307, "", {}, "https://other.test")

    def test_failed_ticket_cleanup_still_cancels_and_logs_out(self):
        smoke = self.fixture()
        smoke.ticket, smoke.reservation, smoke.token = "2", "3", "synthetic-token"
        paths = []

        def respond(stage, path, *args, **kwargs):
            paths.append(path)
            if path.endswith("/verify"):
                raise module.SmokeFailure("fixture error")
            return {"status": "DIBATALKAN"}

        smoke.request = respond
        with self.assertRaises(module.SmokeFailure):
            smoke.cleanup()
        self.assertEqual(paths, ["/damage-reports/2/verify", "/reservations/3/cancel", "/auth/logout"])

    def test_malformed_cleanup_response_still_cancels_and_logs_out(self):
        smoke = self.fixture()
        smoke.ticket, smoke.reservation, smoke.token = "2", "3", "synthetic-token"
        paths = []
        def respond(stage, path, *args, **kwargs):
            paths.append(path)
            return None if path.endswith("/verify") else {"status": "DIBATALKAN"}
        smoke.request = respond
        with self.assertRaises(module.SmokeFailure):
            smoke.cleanup()
        self.assertEqual(paths[-2:], ["/reservations/3/cancel", "/auth/logout"])

    def test_unconfirmed_close_is_a_gate_failure(self):
        smoke = self.fixture()
        smoke.ticket = "2"
        smoke.request = lambda *args, **kwargs: {"status": "DILAPORKAN"}
        with self.assertRaises(module.SmokeFailure):
            smoke.cleanup()

    def test_recovery_never_closes_another_runs_ticket(self):
        smoke = self.fixture()
        smoke.asset, smoke.damage_submitted = {"id": "1"}, True
        paths = []

        def respond(stage, path, *args, **kwargs):
            paths.append(path)
            return {"id": "2"} if path.startswith("/damage-reports/open") else {"deskripsi": "other run", "objek": {"id": "1"}}

        smoke.request = respond
        with self.assertRaises(module.SmokeFailure):
            smoke.cleanup()
        self.assertFalse(any(p.endswith("/verify") for p in paths))

    def test_synthetic_png_is_valid(self):
        # Tangkap byte yang benar-benar dikirim driver, tanpa storage/jaringan.
        smoke = self.fixture()
        uploads = []
        class Response:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *args): pass
        class Opener:
            def open(self, request, **kwargs):
                uploads.append(request)
                return Response()
        smoke.asset, smoke.opener = {"id": "1"}, Opener()
        def respond(stage, path, *args, **kwargs):
            if path == "/files/presign": return {"file_id": "1", "upload_url": "https://storage.test/object"}
            return {"id": "2", "status": "DILAPORKAN"}
        smoke.request = respond
        smoke.damage()
        photo = uploads[0].data
        self.assertEqual(photo[:8], b"\x89PNG\r\n\x1a\n")
        self.assertIsNone(uploads[0].get_header("Authorization"))
        pos = 8
        while pos < len(photo):
            size = struct.unpack(">I", photo[pos:pos+4])[0]
            self.assertEqual(zlib.crc32(photo[pos+4:pos+8+size]), struct.unpack(">I", photo[pos+8+size:pos+12+size])[0])
            pos += 12 + size


if __name__ == "__main__":
    unittest.main()
