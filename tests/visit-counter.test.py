"""Behavioral tests for persistent counting and the loopback HTTP interface."""

from concurrent.futures import ThreadPoolExecutor
from contextlib import closing, redirect_stderr
import http.client
import importlib.util
import io
import json
from pathlib import Path
import sqlite3
import tempfile
import threading
import unittest


MODULE = Path(__file__).resolve().parents[1] / "server" / "visit-counter.py"
SPEC = importlib.util.spec_from_file_location("visit_counter", MODULE)
COUNTER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(COUNTER)


class VisitCounterTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="visit-counter-test-")
        self.database = Path(self.temporary.name) / "data" / "visits.sqlite3"
        self.start_server()

    def start_server(self):
        self.server = COUNTER.CounterHTTPServer(self.database, port=0)
        self.thread = threading.Thread(
            target=self.server.serve_forever,
            kwargs={"poll_interval": 0.01},
            daemon=True,
        )
        self.thread.start()

    def stop_server(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)
        self.assertFalse(self.thread.is_alive())

    def tearDown(self):
        self.stop_server()
        self.temporary.cleanup()

    def request(self, method="GET", path="/visit", headers=None, body=None):
        host, port = self.server.server_address
        connection = http.client.HTTPConnection(host, port, timeout=15)
        try:
            connection.request(method, path, body=body, headers=headers or {})
            response = connection.getresponse()
            raw = response.read()
            return (
                response.status,
                dict(response.getheaders()),
                json.loads(raw) if raw else None,
            )
        finally:
            connection.close()

    def test_get_and_head_are_read_only(self):
        self.assertEqual(self.server.server_address[0], "127.0.0.1")
        self.assertEqual(self.request()[2], {"visits": 0})
        status, headers, body = self.request("HEAD")
        self.assertEqual(status, 200)
        self.assertIsNone(body)
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertEqual(self.request("GET", "/visit?refresh=1")[2], {"visits": 0})

    def test_post_counts_once_and_returns_json(self):
        status, headers, body = self.request("POST")
        self.assertEqual(status, 200)
        self.assertEqual(body, {"visits": 1})
        self.assertEqual(headers["Content-Type"], "application/json; charset=utf-8")
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertNotIn("Set-Cookie", headers)
        self.assertEqual(self.request("POST", body=b"unused")[2], {"visits": 2})
        self.assertEqual(self.request()[2], {"visits": 2})

    def test_restart_preserves_the_total(self):
        for _ in range(3):
            self.assertEqual(self.request("POST")[0], 200)
        self.stop_server()
        self.start_server()
        self.assertEqual(self.request()[2], {"visits": 3})
        self.assertEqual(self.request("POST")[2], {"visits": 4})

    def test_concurrent_requests_do_not_lose_increments(self):
        count = 64
        with ThreadPoolExecutor(max_workers=12) as executor:
            replies = list(executor.map(lambda _: self.request("POST"), range(count)))
        self.assertTrue(all(reply[0] == 200 for reply in replies))
        self.assertEqual(sorted(reply[2]["visits"] for reply in replies), list(range(1, count + 1)))
        self.assertEqual(self.request()[2], {"visits": count})

    def test_unknown_routes_and_methods_do_not_count(self):
        self.assertEqual(self.request("POST", "/other")[0], 404)
        status, headers, body = self.request("PUT")
        self.assertEqual(status, 405)
        self.assertEqual(body, {"error": "method_not_allowed"})
        self.assertEqual(headers["Allow"], "GET, HEAD, POST")
        self.assertEqual(self.request()[2], {"visits": 0})

    def test_database_failure_is_generic_and_does_not_reset(self):
        self.request("POST")
        original = self.server.counter.increment

        def fail():
            raise sqlite3.OperationalError("database detail must not be disclosed")

        self.server.counter.increment = fail
        try:
            status, _, body = self.request("POST")
            self.assertEqual(status, 503)
            self.assertEqual(body, {"error": "counter_unavailable"})
        finally:
            self.server.counter.increment = original
        self.assertEqual(self.request()[2], {"visits": 1})

    def test_client_metadata_is_neither_logged_nor_stored(self):
        marker = "counter-test-client-metadata"
        captured = io.StringIO()
        with redirect_stderr(captured):
            status, headers, _ = self.request(
                "POST", headers={"User-Agent": marker, "Cookie": "session=" + marker}
            )
        self.assertEqual(status, 200)
        self.assertEqual(captured.getvalue(), "")
        self.assertNotIn("Set-Cookie", headers)
        with closing(sqlite3.connect(self.database)) as connection:
            self.assertEqual(
                connection.execute("SELECT * FROM page_views").fetchall(), [(1, 1)]
            )
            self.assertEqual(
                [row[1] for row in connection.execute("PRAGMA table_info(page_views)")],
                ["id", "total"],
            )
        for path in self.database.parent.iterdir():
            if path.is_file():
                self.assertNotIn(marker.encode(), path.read_bytes())


if __name__ == "__main__":
    unittest.main()
