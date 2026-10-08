"""F) Tamanho/orçamento de carregamento do que é servido ao aluno + precache do service worker."""
import gzip, hashlib, re, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent / "lib"))
from common import Result, ROOT, load_budgets

r = Result("F")
B = load_budgets()["size"]
kb = lambda n: round(n / 1024, 1)
gz = lambda p: len(gzip.compress(p.read_bytes(), 6))


def tracked_files():
    out = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True).stdout.splitlines()
    return [ROOT / f for f in out if (ROOT / f).is_file() and not f.startswith("checks/")]


# Arquivos servidos ao aluno: página + SW + manifest estático + ícones referenciados
aluno = ROOT / "aluno.html"
sw = ROOT / "sw.js"
html = aluno.read_text(encoding="utf-8")
refs = set(re.findall(r'(?:href|src)="(/[^"#?]+\.(?:png|svg|ico|js|css|woff2?))"', html))
sw_text = sw.read_text(encoding="utf-8")
shell_block = re.search(r"SHELL_URLS\s*=\s*\[(.*?)\]", sw_text, re.S)
shell_urls = re.findall(r"'(/[^']+)'", shell_block.group(1)) if shell_block else []
manifest_icons = set(re.findall(r'"src":\s*"(/icons/[^"]+)"', (ROOT / "manifest.json").read_text()))
served = {"/aluno (aluno.html)": aluno, "/sw.js": sw}
for u in sorted(refs | set(shell_urls) | manifest_icons):
    p = ROOT / u.lstrip("/")
    if p.exists():
        served[u] = p
rows = [(k, p.stat().st_size, gz(p)) for k, p in served.items()]
total = sum(x[1] for x in rows); total_gz = sum(x[2] for x in rows)
r.meta["served_to_student"] = [dict(path=k, bytes=a, gzip_bytes=b) for k, a, b in rows]
r.note(f"Servido ao aluno: {len(rows)} arquivos, {kb(total)} KB brutos / {kb(total_gz)} KB gzip. "
       f"aluno.html = {kb(aluno.stat().st_size)} KB (CSS+JS inline, sem bundle externo).")
by_type = {}
for k, a, b in rows:
    ext = ".html" if k.startswith("/aluno") else (Path(k).suffix or "?")
    by_type[ext] = by_type.get(ext, 0) + a
r.note("Por tipo (bytes brutos): " + ", ".join(f"{e} {kb(v)} KB" for e, v in sorted(by_type.items())))

# Fontes
fonts = [p for p in tracked_files() if p.suffix.lower() in (".woff", ".woff2", ".ttf", ".otf")]
fsum = sum(p.stat().st_size for p in fonts)
ext_fonts = re.findall(r"fonts\.(?:googleapis|gstatic)\.com", html)
r.note(f"Fontes: {len(fonts)} arquivos ({kb(fsum)} KB); aluno.html {'carrega' if ext_fonts else 'não carrega'} fontes externas (usa fontes do sistema).")
if fsum > B["fonts_kb_max"] * 1024:
    r.add("medium", "fonts-total", "fonts", f"Fontes somam {kb(fsum)} KB (> {B['fonts_kb_max']} KB)", "fonts/",
          "", "Subsetar para latim, manter só pesos usados, servir só woff2.")

# Precache do service worker
pre = []
for u in shell_urls:
    p = ROOT / u.lstrip("/")
    pre.append((u, p.stat().st_size if p.exists() else 0, p.exists()))
for u, s, ok in pre:
    if not ok:
        r.add("high", "sw-missing", u, f"SW pré-cacheia {u}, que não existe", "sw.js",
              "cache.addAll falha por inteiro se UM item der 404 → o service worker não instala.", "Corrigir a lista SHELL_URLS.", blocking=False)
pre_total = sum(s for _, s, _ in pre)
runtime = aluno.stat().st_size
r.meta["sw_precache_bytes"] = pre_total
r.note(f"Precache do SW: {len(pre)} itens = {kb(pre_total)} KB (+ ~{kb(runtime)} KB de aluno.html cacheado em runtime após o 1º login).")
if pre_total + runtime > B["sw_precache_kb_max"] * 1024:
    r.add("medium", "sw-precache-size", "sw", f"Precache do SW > {B['sw_precache_kb_max']} KB ({kb(pre_total + runtime)} KB)", "sw.js", "",
          "Pré-cachear só o necessário.")

# Arquivos grandes e duplicados
files = tracked_files()
thr = B["large_file_kb"] * 1024
for p in files:
    if p.stat().st_size > thr and p.suffix.lower() not in (".md", ".py"):
        rel = str(p.relative_to(ROOT))
        in_deploy = rel in ("aluno.html", "sw.js")
        r.add("low", "large-file", rel, f"Arquivo grande: {rel} ({kb(p.stat().st_size)} KB)", rel,
              "Servido ao aluno." if in_deploy else "Não é servido ao app do aluno (dashboard/admin/repo).",
              "Se for imagem órfã, remover do repo; se JS grande, considerar split/minificação." )
hashes = {}
for p in files:
    if p.stat().st_size > 0 and p.suffix.lower() not in (".md",):
        hashes.setdefault(hashlib.sha256(p.read_bytes()).hexdigest(), []).append(str(p.relative_to(ROOT)))
for h, names in hashes.items():
    if len(names) > 1:
        r.add("low", "duplicate-file", "|".join(sorted(names)), "Arquivos duplicados (conteúdo idêntico): " + ", ".join(names),
              names[0], "", "Manter uma cópia só.")
orph = [p for p in files if p.name == "icon.svg"]
r.save()
