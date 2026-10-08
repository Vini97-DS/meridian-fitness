"""G) Segurança básica de cabeçalhos/PWA — PASSIVO: só GETs simples (≈10 requisições) e inspeção de código."""
import json, os, re, sys, urllib.request, urllib.error
from pathlib import Path
from urllib.parse import urlparse
sys.path.insert(0, str(Path(__file__).parent / "lib"))
from common import Result, ROOT

r = Result("G")
base = os.environ.get("BASE_URL", "").rstrip("/")
local = bool(urlparse(base).hostname in ("localhost", "127.0.0.1", "::1")) or not base
pid = os.environ.get("TEST_PERSONAL_ID") or "00000000-0000-4000-8000-000000000001"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None


def get(url):
    opener = urllib.request.build_opener(NoRedirect)
    req = urllib.request.Request(url, headers={"User-Agent": "meridian-checks/1.0 (passivo)"})
    try:
        resp = opener.open(req, timeout=20)
    except urllib.error.HTTPError as e:
        resp = e
    except Exception as e:
        return None, {}, str(e)
    return resp.status if hasattr(resp, "status") else resp.code, {k.lower(): v for k, v in resp.headers.items()}, ""


# ── 1) Cabeçalhos ao vivo ───────────────────────────────────────
if local:
    r.note("BASE_URL é local (servidor de teste da suíte): cabeçalhos ao vivo NÃO são avaliados, pois refletiriam o servidor "
           "de teste e não a Vercel. Rode com BASE_URL=<preview da Vercel> para a checagem real.")
else:
    if urlparse(base).scheme != "https":
        r.add("high", "https", "scheme", "BASE_URL não usa HTTPS", base, "", "Servir apenas por HTTPS.", blocking=True)
    else:
        code, h, err = get("http://" + urlparse(base).netloc + "/")
        if err: r.note("HTTP→HTTPS não verificável: " + err)
        elif not (code in (301, 302, 307, 308) and h.get("location", "").startswith("https://")):
            r.add("medium", "http-redirect", "redirect", "HTTP não redireciona para HTTPS", "http://" + urlparse(base).netloc, f"status {code}", "Redirecionar todo HTTP para HTTPS.")
    pages = {"/": ("text/html",), "/aluno": ("text/html",), "/sw.js": ("javascript",), "/manifest.json": ("manifest+json", "json"),
             f"/api/aluno/manifest/{pid}.json": ("manifest+json", "json"), "/icons/icon-192.png": ("image/png",), "/css/style.css": ("text/css",)}
    for path, types in pages.items():
        code, h, err = get(base + path)
        loc = base + path
        if err: r.note(f"{path}: erro de conexão ({err})"); continue
        if code != 200:
            r.note(f"{path}: HTTP {code} (não avaliado)"); continue
        ct = h.get("content-type", "")
        if not any(t in ct for t in types):
            r.add("medium", "content-type", path, f"Content-Type inesperado em {path}: {ct or 'ausente'}", loc, "", f"Servir como {types[0]}.")
        if "nosniff" not in h.get("x-content-type-options", "").lower():
            r.add("medium", "nosniff", path, f"X-Content-Type-Options ausente em {path}", loc, "", "Adicionar `X-Content-Type-Options: nosniff` (vercel.json → headers).")
        if path in ("/", "/aluno"):
            if "strict-transport-security" not in h:
                r.add("medium", "hsts", path, "HSTS (Strict-Transport-Security) ausente", loc, "", "Adicionar HSTS (a Vercel costuma enviar em *.vercel.app; confirme no domínio próprio).")
            if "referrer-policy" not in h:
                r.add("low", "referrer", path, "Referrer-Policy ausente", loc, "", "Adicionar `Referrer-Policy: strict-origin-when-cross-origin`.")
            if "content-security-policy" not in h:
                r.add("low", "csp", path, "Content-Security-Policy ausente", loc, "O app usa JS inline (CSP exigiria nonces/hashes).", "Avaliar CSP em modo report-only.")
            if "x-frame-options" not in h and "frame-ancestors" not in h.get("content-security-policy", ""):
                r.add("low", "frame", path, "Sem proteção contra clickjacking (X-Frame-Options/frame-ancestors)", loc, "", "Adicionar `X-Frame-Options: DENY`.")
        cc = h.get("cache-control", "").lower()
        m = re.search(r"max-age=(\d+)", cc)
        age = int(m.group(1)) if m else 0
        if path == "/sw.js" and ("immutable" in cc or age > 0 and "must-revalidate" not in cc and "no-cache" not in cc):
            r.add("high", "sw-cache", path, f"sw.js com cache longo ({cc or 'sem cabeçalho'})", loc,
                  "Navegadores limitam a 24h, mas um cache longo atrasa atualizações do app.", "Servir com `Cache-Control: no-cache` / `max-age=0, must-revalidate`.", blocking=True)
        if "manifest" in path and age > 86400:
            r.add("medium", "manifest-cache", path, f"Manifest com cache de {age}s", loc, "", "Usar cache curto (≤1 dia) ou revalidação.")
        r.note(f"{path}: {code} | {ct} | cache-control: {cc or '—'}")

# ── 2) Inspeção estática (vercel.json) ──────────────────────────
vj = json.loads((ROOT / "vercel.json").read_text())
if not vj.get("headers"):
    r.add("low", "no-headers-config", "vercel.json", "vercel.json não declara `headers` (segurança/cache dependem só dos padrões da Vercel)",
          "vercel.json", "Sem X-Content-Type-Options, Referrer-Policy, nem Cache-Control explícito para sw.js.",
          "Adicionar bloco `headers` (nosniff, referrer-policy, cache-control: no-cache para /sw.js).")

# ── 3) Inspeção estática do login por código (SEM requisições) ──
api = (ROOT / "api.py").read_text(encoding="utf-8")
consts = {k: int(v) for k, v in re.findall(r"^(LOGIN_CODE_MAX_ATTEMPTS|LOGIN_CODE_MAX_PER_HOUR|IP_REQUEST_CODE_MAX_PER_HOUR|IP_VERIFY_CODE_MAX_PER_HOUR)\s*=\s*(\d+)", api, re.M)}
r.meta["login_rate_limits"] = consts
r.note("Login por código (inspeção de código, nenhuma requisição enviada): " + ", ".join(f"{k}={v}" for k, v in consts.items()))
req_fn = re.search(r"def aluno_request_code.*?(?=\n@app\.|\Z)", api, re.S)
ver_fn = re.search(r"def aluno_verify_code.*?(?=\n@app\.|\Z)", api, re.S)
for label, fn, pat in (("request-code", req_fn, "_rate_limited"), ("verify-code", ver_fn, "_rate_limited")):
    if not fn or pat not in fn.group(0):
        r.add("high", "login-ip-limit", label, f"{label} sem limite por IP", "api.py", "", "Aplicar _rate_limited por IP.")
if not ver_fn or "attempts" not in ver_fn.group(0):
    r.add("high", "login-attempts", "attempts", "verify-code sem contagem de tentativas por código", "api.py", "", "Contar tentativas e invalidar o código.")
else:
    r.note("verify-code: contador de tentativas por código + limite por IP presentes; request-code: limite por e-mail e por IP presentes.")
if re.search(r'xff\s*=\s*request\.headers\.get\("x-forwarded-for"\)', api):
    r.add("low", "xff-trust", "xff", "Limite por IP confia no 1º valor de X-Forwarded-For", "api.py (_client_ip)",
          "Na Vercel o cabeçalho é sobrescrito pela borda, então é seguro lá; fora dela (ou atrás de outro proxy) o cliente poderia forjar o IP e burlar o limite.",
          "Documentar a premissa ou usar o IP do cabeçalho confiável da plataforma.")
for name, rx in (("JWT_SECRET", r'getenv\("JWT_SECRET",\s*"([^"]+)"'), ("ADMIN_KEY", r'getenv\("ADMIN_KEY",\s*"([^"]+)"')):
    m = re.search(rx, api)
    if m:
        r.add("medium", "secret-default", name, f"{name} tem valor padrão de desenvolvimento no código (fail-open se faltar em produção)", "api.py",
              "Se a variável não estiver setada no ambiente, o app sobe com segredo público e tokens/admin ficam forjáveis.",
              f"Falhar o boot quando {name} ausente e ENV=produção (sem default).")
if re.search(r'allow_origins=\["\*"\]', api):
    r.add("low", "cors-wildcard", "cors", "CORS com allow_origins=['*']", "api.py",
          "Tokens vão em header Authorization (não cookie), então o risco é menor; ainda assim abre a API para qualquer origem.",
          "Restringir ao domínio do app.")
r.save()
