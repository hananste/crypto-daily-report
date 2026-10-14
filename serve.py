#!/usr/bin/env python3
"""Read-only static server for the report dashboard (GET/HEAD only, no secrets)."""
import http.server, os, sys
ROOT = os.path.dirname(os.path.abspath(__file__)); PORT = int(sys.argv[1]) if len(sys.argv)>1 else 8790
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(s,*a,**k): super().__init__(*a,directory=ROOT,**k)
    def do_GET(s):
        p = s.path.split("?")[0]
        if p=="/": s.path="/index.html"
        elif p!="/index.html" and not (p.startswith("/static/") or p.startswith("/data/")): return s.send_error(404)
        super().do_GET()
    def do_POST(s): s.send_error(405)
    do_PUT = do_DELETE = do_POST
    def end_headers(s): s.send_header("Cache-Control","no-store"); super().end_headers()
    def list_directory(s,p): s.send_error(403)
print(f"http://127.0.0.1:{PORT}/"); http.server.ThreadingHTTPServer(("127.0.0.1",PORT),H).serve_forever()
