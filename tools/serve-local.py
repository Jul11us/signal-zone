"""Serve this local static website without exposing backups or repository metadata."""
import argparse
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
import webbrowser

ROOT = Path(__file__).resolve().parent.parent


class WebsiteHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if not self.allowed():
            self.send_error(404)
            return
        super().do_GET()

    def do_HEAD(self):
        if not self.allowed():
            self.send_error(404)
            return
        super().do_HEAD()

    def allowed(self):
        route = unquote(urlsplit(self.path).path)
        parts = Path(route).parts
        blocked = {"_verify", "gui-test-screenshots", "design-demos", "预览图"}
        if any(p.startswith(".") or p in blocked for p in parts):
            return False
        resolved = Path(self.translate_path(self.path)).resolve()
        return resolved == ROOT or ROOT in resolved.parents

    def list_directory(self, path):
        self.send_error(404)
        return None

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8642)
    parser.add_argument("--open", action="store_true", help="Open the website in your default browser")
    args = parser.parse_args()
    handler = functools.partial(WebsiteHandler, directory=str(ROOT))
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    except OSError as error:
        parser.exit(1, f"Cannot start local website: {error}. Try --port 8643.\n")
    url = f"http://127.0.0.1:{args.port}"
    print(f"SIGNAL//ZONE: {url}\nPress Ctrl+C to stop.", flush=True)
    if args.open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
