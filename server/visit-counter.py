#!/usr/bin/env python3
"""A persistent, loopback-only page-view counter using Python's standard library.

GET /visit reads the total; POST /visit increments it once and returns the total.
No request payload, cookies, client identifiers, or request logs are stored.
"""

import argparse
from contextlib import closing
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sqlite3
import sys


class VisitCounter:
    """Persist a single integer; serialize increments with SQLite transactions."""

    def __init__(self, database):
        self.database = Path(database)
        self.database.parent.mkdir(parents=True, exist_ok=True)
        with closing(self._connect()) as connection:
            connection.execute("PRAGMA journal_mode = WAL")
            with connection:
                connection.execute(
                    "CREATE TABLE IF NOT EXISTS page_views ("
                    "id INTEGER PRIMARY KEY CHECK (id = 1), "
                    "total INTEGER NOT NULL CHECK (total >= 0))"
                )
                connection.execute(
                    "INSERT OR IGNORE INTO page_views (id, total) VALUES (1, 0)"
                )

    def _connect(self):
        return sqlite3.connect(str(self.database), timeout=10)

    def read(self):
        with closing(self._connect()) as connection:
            return connection.execute(
                "SELECT total FROM page_views WHERE id = 1"
            ).fetchone()[0]

    def increment(self):
        with closing(self._connect()) as connection:
            with connection:
                connection.execute("BEGIN IMMEDIATE")
                connection.execute(
                    "UPDATE page_views SET total = total + 1 WHERE id = 1"
                )
                total = connection.execute(
                    "SELECT total FROM page_views WHERE id = 1"
                ).fetchone()[0]
            return total


class CounterHTTPServer(ThreadingHTTPServer):
    request_queue_size = 64

    def __init__(self, database, port=8766):
        self.counter = VisitCounter(database)
        super().__init__(("127.0.0.1", port), CounterHandler)

    def handle_error(self, request, client_address):
        # The default implementation prints the client address and traceback.
        print("visit-counter: request failed", file=sys.stderr)


class CounterHandler(BaseHTTPRequestHandler):
    server_version = "VisitCounter/1.0"
    sys_version = ""

    def log_message(self, format, *args):
        # Avoid the standard access log, including client IP and request URL.
        pass

    def _json(self, status, payload, head=False):
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        # No request body is needed. Closing each connection also avoids
        # retaining or parsing any unused POST payload as a subsequent request.
        self.close_connection = True
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Connection", "close")
        if status == 405:
            self.send_header("Allow", "GET, HEAD, POST")
        self.end_headers()
        if not head:
            self.wfile.write(body)

    def send_error(self, code, message=None, explain=None):
        # Never echo request details or runtime paths into an error response.
        if code == 501:
            code = 405
        error = "method_not_allowed" if code == 405 else "bad_request"
        self._json(code, {"error": error}, head=self.command == "HEAD")

    def _handle(self, increment=False, head=False):
        if self.path.split("?", 1)[0] != "/visit":
            self._json(404, {"error": "not_found"}, head=head)
            return
        try:
            total = (
                self.server.counter.increment()
                if increment
                else self.server.counter.read()
            )
        except sqlite3.Error:
            self._json(503, {"error": "counter_unavailable"}, head=head)
            return
        self._json(200, {"visits": total}, head=head)

    def do_GET(self):
        self._handle()

    def do_HEAD(self):
        self._handle(head=True)

    def do_POST(self):
        self._handle(increment=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--database", required=True, metavar="PATH", help="SQLite database file"
    )
    parser.add_argument(
        "--port", type=int, default=8766, help="loopback listener port (default: 8766)"
    )
    args = parser.parse_args(argv)
    if not 1 <= args.port <= 65535:
        parser.error("port must be between 1 and 65535")
    try:
        server = CounterHTTPServer(args.database, args.port)
    except (OSError, sqlite3.Error):
        parser.exit(1, "Unable to start visit counter.\n")
    print("Visit counter listening on 127.0.0.1:{}".format(args.port), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
