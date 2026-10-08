"""C) Lint estático: ruff (py), eslint (js + <script> inline), html-validate (html), checagem simples de css.
Só relata; bloqueia apenas erro de sintaxe."""
import json, re, subprocess, sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent / "lib"))
from common import Result, ROOT, CHECKS

r = Result("C")
NB = CHECKS / "node_modules" / ".bin"
IGNORE_DIRS = {"fonts", "icons", "node_modules", "checks", "__pycache__", ".git", ".venv"}


def files(ext):
    return [p for p in ROOT.rglob(f"*{ext}") if not (set(p.relative_to(ROOT).parts[:-1]) & IGNORE_DIRS) and ".min." not in p.name]


def rel(p): return str(Path(p).resolve().relative_to(ROOT))


AGG = {}  # (arquivo, regra, mensagem) -> dados; id estável mesmo se as linhas mudarem


def lint(sev, rule, name, ln, msg, sug, blocking=False, title=None):
    e = AGG.setdefault((name, rule, msg), dict(sev=sev, lines=[], sug=sug, blocking=blocking, title=title or f"{rule}: {msg}"))
    e["lines"].append(ln)


# ── ruff ────────────────────────────────────────────────────────
ruff = str(CHECKS / ".venv" / "bin" / "ruff")
cfg = str(CHECKS / "config" / "ruff.toml")
p = subprocess.run([ruff, "check", "--config", cfg, "--output-format", "json", "--no-cache", str(ROOT)], capture_output=True, text=True)
try: items = json.loads(p.stdout or "[]")
except Exception: items = []; r.status = "error"; r.note("ruff check falhou: " + p.stderr[-300:])
for it in items:
    code = it.get("code") or "syntax"
    syntax = code in (None, "E999") or it.get("code") is None
    f = rel(it["filename"]); ln = it["location"]["row"]
    lint("high" if syntax else "low", f"ruff:{code}", f, ln, it["message"], "Corrigir no código." if not syntax else "Erro de sintaxe — corrigir.", syntax, f"ruff {code}: {it['message']}")
p = subprocess.run([ruff, "format", "--check", "--config", cfg, "--no-cache", str(ROOT / "api.py")], capture_output=True, text=True)
if p.returncode != 0:
    r.add("low", "ruff:format", "api.py", "api.py não segue o formato do ruff (`ruff format`)", "api.py",
          "Apenas estilo; a suíte não reescreve nada.", "Opcional: rodar `ruff format api.py` numa rodada própria (diff grande).")
r.note(f"ruff: {len(items)} achados de lint.")

# ── eslint (js + scripts inline de html) ────────────────────────
tmp = Path(tempfile.mkdtemp())
mapping = {}  # arquivo temp -> (html original, linha inicial do bloco)
targets = [str(p) for p in files(".js")]
for h in files(".html"):
    text = h.read_text(encoding="utf-8")
    for i, m in enumerate(re.finditer(r"<script(?P<attrs>[^>]*)>(?P<body>.*?)</script>", text, re.S | re.I)):
        if "src=" in m.group("attrs") or "application/json" in m.group("attrs") or "ld+json" in m.group("attrs"):
            continue
        start = text.count("\n", 0, m.start("body"))
        t = tmp / f"{h.stem}.{i}.js"
        t.write_text("\n" * 0 + m.group("body"))
        mapping[str(t)] = (rel(h), start)
        targets.append(str(t))
p = subprocess.run([str(NB / "eslint"), "-c", str(CHECKS / "eslint.config.mjs"), "--no-warn-ignored", "-f", "json"] + targets,
                   capture_output=True, text=True, cwd=ROOT)
try: res = json.loads(p.stdout or "[]")
except Exception: res = []; r.status = "error"; r.note("eslint falhou: " + (p.stderr or p.stdout)[-400:])
n = 0
for fr in res:
    path = fr["filePath"]
    if path in mapping: name, off = mapping[path]
    else: name, off = rel(path), 0
    for m in fr["messages"]:
        fatal = m.get("fatal")
        rule = m.get("ruleId") or "parsing"
        ln = m.get("line", 0) + off
        n += 1
        lint("high" if fatal else "low", f"eslint:{rule}", name, ln, m["message"], "Erro de sintaxe — corrigir." if fatal else "Revisar.", bool(fatal), f"eslint {rule}: {m['message']}")
r.note(f"eslint: {n} achados em {len(targets)} unidades (js + scripts inline de HTML).")

# ── html-validate ───────────────────────────────────────────────
htmls = [str(h) for h in files(".html")]
hv_out = tmp / "hv.json"  # via arquivo: html-validate trunca stdout em pipe (>64KB)
with open(hv_out, "w") as fh:
    p = subprocess.run([str(NB / "html-validate"), "-c", str(CHECKS / "config" / "htmlvalidate.json"), "-f", "json"] + htmls,
                       stdout=fh, stderr=subprocess.PIPE, text=True, cwd=ROOT)
try: res = json.loads(hv_out.read_text() or "[]")
except Exception: res = []; r.status = "error"; r.note("html-validate falhou: " + p.stderr[-400:])
n = 0
for fr in res:
    name = rel(fr["filePath"])
    for m in fr["messages"]:
        rule = m.get("ruleId") or "parse-error"
        sev = "medium" if rule in ("no-dup-id", "parser-error", "parse-error") else "low"
        n += 1
        lint(sev, f"html:{rule}", name, m.get("line"), m["message"], "ID duplicado quebra getElementById/labels — tornar único." if rule == "no-dup-id" else "Revisar.",
             rule in ("parser-error", "parse-error"), f"html-validate {rule}: {m['message']}")
r.note(f"html-validate: {n} achados em {len(htmls)} arquivos.")

for (name, rule, msg), e in AGG.items():
    ls = e["lines"]
    shown = ", ".join(str(x) for x in ls[:8]) + (f" … (+{len(ls) - 8})" if len(ls) > 8 else "")
    r.add(e["sev"], rule, f"{name}|{msg}", e["title"] + (f" (×{len(ls)})" if len(ls) > 1 else ""), f"{name}:{shown}", "", e["sug"], blocking=e["blocking"])

# ── css (somente chaves balanceadas) ────────────────────────────
for c in files(".css"):
    t = re.sub(r"/\*.*?\*/", "", c.read_text(encoding="utf-8"), flags=re.S)
    if t.count("{") != t.count("}"):
        r.add("high", "css:braces", rel(c), "CSS com chaves desbalanceadas", rel(c), "", "Corrigir sintaxe.", blocking=True)
r.note("css: apenas checagem de chaves balanceadas (sem stylelint, de propósito — dependência leve).")
r.save()
