#!/usr/bin/env python3
"""Imita o roteamento da Vercel SÓ no harness local: estáticos direto do disco (como @vercel/static) e
/api, /aluno*, /form/* repassados ao uvicorn (como @vercel/python). Não faz parte do app."""
import gzip, mimetypes, sys, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[3]
PORT, UPSTREAM = int(sys.argv[1]), sys.argv[2].rstrip("/")
PAGES = {"/": "index.html", "/dashboard": "dashboard.html", "/primeiro-acesso": "primeiro-acesso.html",
         "/recuperar-senha": "recuperar-senha.html", "/minha-conta": "minha-conta.html", "/admin": "admin.html"}
STATIC_PREFIX = ("/css/", "/js/", "/icons/")
STATIC_FILES = {"/sw.js", "/icon.svg", "/manifest.json"}
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/manifest+json", ".json")


class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def send(self, code, body, ctype, extra=()):
        self.send_response(code); self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "public, max-age=0, must-revalidate")
        for k, v in extra: self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD": self.wfile.write(body)

    def handle_any(self):
        path = urlparse(self.path).path
        api = path.startswith(("/api/", "/form/")) or path == "/aluno" or path.startswith("/aluno/")
        if not api:
            f = ROOT / PAGES[path] if path in PAGES else (ROOT / path.lstrip("/") if path in STATIC_FILES or path.startswith(STATIC_PREFIX) else None)
            if f and f.is_file() and ROOT in f.resolve().parents:
                return self.send(200, f.read_bytes(), mimetypes.guess_type(str(f))[0] or "application/octet-stream")
            return self.send(404, b"not found", "text/plain")
        body = self.rfile.read(int(self.headers.get("Content-Length") or 0)) if self.command in ("POST", "PUT", "PATCH", "DELETE") else None
        hdr = {k: v for k, v in self.headers.items() if k.lower() not in ("host", "accept-encoding", "connection", "content-length")}
        req = urllib.request.Request(UPSTREAM + self.path, data=body, method=self.command, headers=hdr)
        try: resp = urllib.request.urlopen(req, timeout=60); code = resp.status
        except urllib.error.HTTPError as e: resp = e; code = e.code
        except Exception: return self.send(502, b"upstream down", "text/plain")
        data = resp.read()
        extra = [(k, v) for k, v in resp.headers.items() if k.lower() in ("etag", "last-modified")]
        self.send(code, data, resp.headers.get("Content-Type", "application/octet-stream"), extra)

    do_GET = do_HEAD = do_POST = do_PUT = do_PATCH = do_DELETE = handle_any


ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
