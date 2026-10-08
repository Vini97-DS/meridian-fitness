#!/usr/bin/env python3
"""Servidor de teste da suíte. SOMENTE LEITURA sobre o app (lê os arquivos, não escreve nada).

  --mode mock   : serve os estáticos como a Vercel (rotas do vercel.json) + API SINTÉTICA em memória.
                  Nenhum banco, nenhum dado real. Injeta (só na resposta) sessão fake no localStorage.
  --mode proxy  : repassa GET/HEAD para --target (preview). Bloqueia qualquer escrita (POST/PUT/PATCH/DELETE).
                  Injeta os tokens TEST_* no localStorage das páginas autenticadas.
"""
import argparse, base64, gzip, json, mimetypes, os, re, sys, time, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

ROOT = Path(__file__).resolve().parent.parent.parent
FAKE_PID = "00000000-0000-4000-8000-000000000001"
UUID = re.compile(r"^/aluno/[0-9a-f-]{36}/?$", re.I)
ROUTES = {"/": "index.html", "/dashboard": "dashboard.html", "/primeiro-acesso": "primeiro-acesso.html",
          "/recuperar-senha": "recuperar-senha.html", "/minha-conta": "minha-conta.html", "/admin": "admin.html"}
mimetypes.add_type("application/manifest+json", ".json")


def fake_jwt(typ=None):
    b = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).rstrip(b"=").decode()
    p = {"sub": "mock", "email": "aluno@exemplo.test", "exp": int(time.time()) + 170 * 86400}
    if typ: p["typ"] = typ
    return f"{b({'alg': 'none'})}.{b(p)}.mock"


def mock_api(method, path, query):
    if path.startswith("/api/aluno/brand/"):
        return {"display_name": "Studio Teste", "logo_url": None, "primary": "#E8B04B", "accent": "#4F46E5"}
    if path.startswith("/api/aluno/manifest/"):
        return {"name": "Studio Teste", "short_name": "Studio Teste", "start_url": f"/aluno/{FAKE_PID}", "scope": f"/aluno/{FAKE_PID}",
                "display": "standalone", "background_color": "#111A2E", "theme_color": "#111A2E",
                "icons": [{"src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
                          {"src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
                          {"src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}]}
    if path == "/api/aluno/termos/status": return {"accepted": True}
    if path == "/api/aluno/me":
        return {"email": "aluno@exemplo.test", "name": "Aluno Exemplo",
                "students": [{"id": "s1", "name": "Aluno Exemplo", "personal_id": FAKE_PID, "personal_name": "Personal Teste",
                              "brand_name": "Studio Teste", "brand_logo_url": None}]}
    if path == "/api/aluno/treino":
        ex = lambda i, n: {"id": f"ex{i}", "exercise_name": n, "sets": 3, "reps_min": 8, "reps_max": 12, "load_value": 40, "load_unit": "kg",
                            "rest_seconds": 60, "method": None, "video_url": None, "notes": None}
        return {"student_name": "Aluno Exemplo", "had_previous": True, "active": {"id": "w1", "name": "Ficha de teste", "status": "ativa", "sessions": [
            {"id": "sess1", "name": "A - Peito e tríceps", "weekdays": [0, 1, 2, 3, 4, 5, 6], "exercises": [ex(1, "Supino reto"), ex(2, "Tríceps corda")]},
            {"id": "sess2", "name": "B - Costas e bíceps", "weekdays": [], "exercises": [ex(3, "Remada curvada")]}]}}
    if path == "/api/aluno/treino/execucoes/iniciar": return {"ok": True, "last_time": {}, "already_done": []}
    if path == "/api/aluno/peso/status": return {"can_log": False}
    if path.startswith("/api/aluno/treino/execucoes"): return [] if method == "GET" else {"ok": True}
    if path.startswith("/api/aluno/privacidade"): return []
    if path.startswith("/api/aluno/auth/"): return {"ok": True, "token": fake_jwt("student")}
    if path == "/api/auth/me": return {"id": "u1", "name": "Personal Teste", "email": "personal@exemplo.test", "personal_id": FAKE_PID}
    return {}


class H(BaseHTTPRequestHandler):
    server_version = "meridian-checks"
    def log_message(self, *a): pass

    def _send(self, code, body, ctype, extra=None):
        accept = self.headers.get("Accept-Encoding", "")
        compress = "gzip" in accept and (ctype.startswith("text/") or "javascript" in ctype or "json" in ctype or "svg" in ctype)
        if compress: body = gzip.compress(body, 6)
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        if compress: self.send_header("Content-Encoding", "gzip")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "public, max-age=0, must-revalidate")
        for k, v in (extra or {}).items(): self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD": self.wfile.write(body)

    def inject(self, html, path, qs):
        if "noauth" in qs: return html
        snip = ""
        if UUID.match(path):
            tok = self.server.student_token
            if tok: snip = f"localStorage.setItem('mf_aluno_token',{json.dumps(tok)});"
        elif path == "/dashboard":
            tok = self.server.pro_token
            if tok:
                snip = f"localStorage.setItem('mf_token',{json.dumps(tok)});localStorage.setItem('mf_user',{json.dumps(json.dumps(self.server.pro_user))});"
        if "exec" in qs and UUID.match(path):  # abre sozinho a tela de execução (para o Lighthouse)
            snip += ("document.addEventListener('DOMContentLoaded',function(){var n=0,t=setInterval(function(){var b=document.getElementById('btn-iniciar-treino');"
                     "if(b){clearInterval(t);b.click();}if(++n>150)clearInterval(t)},100)});")
        if not snip: return html
        return html.replace("<head>", "<head><script>try{" + snip + "}catch(e){}</script>", 1) if "<head>" in html else html

    def do_ANY(self):
        u = urlparse(self.path); path = u.path; qs = parse_qs(u.query)
        if self.server.mode == "proxy": return self.proxy(u)
        if path.startswith("/api/"):
            if self.command not in ("GET", "HEAD"):
                n = int(self.headers.get("Content-Length") or 0); self.rfile.read(n)
            return self._send(200, json.dumps(mock_api(self.command, path, qs)).encode(),
                              "application/manifest+json" if path.endswith(".json") and "manifest" in path else "application/json")
        if self.command not in ("GET", "HEAD"): return self._send(405, b"{}", "application/json")
        f = None
        if path in ROUTES: f = ROOT / ROUTES[path]
        elif path == "/aluno" or path.startswith("/aluno/"): f = ROOT / "aluno.html"
        elif path.startswith("/form/"): f = ROOT / "form.html"
        else:
            p = (ROOT / path.lstrip("/")).resolve()
            allowed = (p.suffix in (".html", ".js", ".css", ".svg", ".png", ".ico", ".json", ".woff2") and ROOT in p.parents
                       and not any(x in p.parts for x in ("checks", ".git", "node_modules")) and p.name != "api.py")
            if allowed and p.is_file(): f = p
        if not f or not f.is_file(): return self._send(404, b"not found", "text/plain")
        body = f.read_bytes()
        ctype = mimetypes.guess_type(str(f))[0] or "application/octet-stream"
        if f.suffix == ".js": ctype = "application/javascript"
        if f.suffix == ".html":
            ctype = "text/html; charset=utf-8"
            body = self.inject(body.decode("utf-8"), path, qs).encode()
        return self._send(200, body, ctype)

    def proxy(self, u):
        if self.command == "POST" and u.path.startswith("/api/aluno/treino/execucoes"):  # sintético: nada é enviado ao alvo
            self.rfile.read(int(self.headers.get("Content-Length") or 0))
            return self._send(200, json.dumps({"ok": True, "last_time": {}, "already_done": []}).encode(), "application/json")
        if self.command not in ("GET", "HEAD"):
            return self._send(405, json.dumps({"blocked": "checks são SOMENTE LEITURA: escrita bloqueada pelo proxy"}).encode(), "application/json")
        req = urllib.request.Request(self.server.target + self.path, headers={"Accept-Encoding": "identity", "User-Agent": "meridian-checks/1.0",
                                      **({"Authorization": self.headers["Authorization"]} if self.headers.get("Authorization") else {})})
        try: resp = urllib.request.urlopen(req, timeout=30); code = resp.status
        except urllib.error.HTTPError as e: resp = e; code = e.code
        except Exception: return self._send(502, b"upstream indisponivel", "text/plain")
        body = resp.read(); ctype = resp.headers.get("Content-Type", "application/octet-stream")
        extra = {k: v for k, v in resp.headers.items() if k.lower() in ("etag", "last-modified")}
        if "text/html" in ctype: body = self.inject(body.decode("utf-8", "replace"), u.path, parse_qs(u.query)).encode()
        return self._send(code, body, ctype, extra)

    do_GET = do_HEAD = do_POST = do_PUT = do_PATCH = do_DELETE = do_ANY


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765); ap.add_argument("--mode", choices=["mock", "proxy"], default="mock")
    ap.add_argument("--target", default="")
    a = ap.parse_args()
    srv = ThreadingHTTPServer(("127.0.0.1", a.port), H)
    srv.mode, srv.target = a.mode, a.target.rstrip("/")
    if a.mode == "mock":
        srv.student_token, srv.pro_token = fake_jwt("student"), fake_jwt()
        srv.pro_user = {"id": "u1", "name": "Personal Teste", "email": "personal@exemplo.test", "personal_id": FAKE_PID}
    else:
        srv.student_token = os.environ.get("TEST_STUDENT_TOKEN") or ""
        srv.pro_token = os.environ.get("TEST_PRO_TOKEN") or ""
        srv.pro_user = None
        if srv.pro_token:  # GET /api/auth/me (leitura) para montar mf_user
            try:
                rq = urllib.request.Request(srv.target + "/api/auth/me", headers={"Authorization": "Bearer " + srv.pro_token})
                srv.pro_user = json.loads(urllib.request.urlopen(rq, timeout=20).read())
            except Exception: srv.pro_token = ""
    print("dev_server pronto", flush=True)
    srv.serve_forever()
