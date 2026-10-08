"""Consolida reports/*.json → SUMMARY.md + um .md por checagem; imprime a tabela; exit != 0 se houver achado bloqueante."""
import json, os, sys
from datetime import date
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent / "lib"))
from common import CHECKS, REPORTS, SEVERITIES, SEV_PT, CHECK_NAMES

SLUG = {"A": "A-dependencias", "B": "B-segredos", "C": "C-lint", "D": "D-lighthouse", "E": "E-axe", "F": "F-tamanho", "G": "G-headers", "H": "H-e2e"}
base = json.loads((CHECKS / "baseline.json").read_text())
accepted = {a["id"]: a for a in base.get("accepted", [])}
results, rc = {}, 0
for k in CHECK_NAMES:
    f = REPORTS / f"{k}.json"
    only = os.environ.get("CHECKS_ONLY", "").split()
    if only and k not in only:
        results[k] = dict(check=k, name=CHECK_NAMES[k], status="skipped", notes=["fora do escopo desta execução (CHECKS_ONLY)."], findings=[], meta={})
        continue
    results[k] = json.loads(f.read_text()) if f.exists() else dict(check=k, name=CHECK_NAMES[k], status="error", notes=["checagem não executou (sem relatório)."], findings=[], meta={})
for res in results.values():
    for f in res["findings"]:
        f["accepted"] = f["id"] in accepted
    act = [f for f in res["findings"] if not f["accepted"]]
    if res["status"] == "error": res["label"] = "ERRO"
    elif res["status"] == "skipped": res["label"] = "PULADO"
    elif any(f["blocking"] for f in act): res["label"] = "FALHOU"
    elif act: res["label"] = "ALERTA"
    else: res["label"] = "OK"
    if res["label"] in ("ERRO", "FALHOU"): rc = 1


def counts(res):
    c = {s: 0 for s in SEVERITIES}
    for f in res["findings"]:
        if not f["accepted"]: c[f["severity"]] += 1
    return c


def fmt(f, full=True):
    tag = " 🚫 BLOQUEANTE" if f["blocking"] and not f["accepted"] else (" ✅ aceito" if f["accepted"] else "")
    s = f"- **[{SEV_PT[f['severity']]}]** {f['title']}{tag}  \n  `id: {f['id']}` · {f['check']} · {f['location']}"
    if full and f.get("description"): s += f"  \n  {f['description']}"
    if full and f.get("suggestion"): s += f"  \n  ➜ _Sugestão:_ {f['suggestion']}"
    return s


order = {s: i for i, s in enumerate(SEVERITIES)}
rows = ["| Checagem | Resultado | crítico | alto | médio | baixo | aceitos |", "|---|---|--:|--:|--:|--:|--:|"]
term = [f"{'Checagem':<42} {'Resultado':<9} {'crít':>4} {'alto':>4} {'méd':>4} {'baix':>4} {'aceit':>5}"]
for k, res in results.items():
    c = counts(res); acc = sum(1 for f in res["findings"] if f["accepted"])
    rows.append(f"| {k}) {res['name']} | **{res['label']}** | {c['critical']} | {c['high']} | {c['medium']} | {c['low']} | {acc} |")
    term.append(f"{k}) {res['name']:<39} {res['label']:<9} {c['critical']:>4} {c['high']:>4} {c['medium']:>4} {c['low']:>4} {acc:>5}")

allf = [dict(f, check=k) for k, res in results.items() for f in res["findings"]]
allf.sort(key=lambda f: (order[f["severity"]], not f["blocking"], f["check"]))
md = [f"# Resumo das checagens — {date.today().isoformat()}", "",
      f"**Status geral:** {'❌ HÁ ACHADO BLOQUEANTE / ERRO' if rc else '✅ sem achados bloqueantes'}", "", *rows, "",
      "## Observações, limites e itens pulados", ""]
for k, res in results.items():
    md.append(f"**{k}) {res['name']}** — {res['label']}")
    md += [f"- {n}" for n in res["notes"]] or ["- (sem notas)"]
    md.append("")
md += ["## Achados por gravidade (não aceitos)", ""]
cur = None
for f in allf:
    if f["accepted"]: continue
    if f["severity"] != cur:
        cur = f["severity"]; md += ["", f"### {SEV_PT[cur].capitalize()}", ""]
    md.append(fmt(f, full=f["severity"] != "low"))
acc_list = [f for f in allf if f["accepted"]]
if acc_list:
    md += ["", "## Achados aceitos (baseline)", ""]
    for f in acc_list:
        a = accepted[f["id"]]; md.append(fmt(f, False) + f"  \n  motivo: {a.get('reason','')} ({a.get('date','')})")
stale = [i for i in accepted if i not in {f["id"] for f in allf}]
if stale: md += ["", f"_Itens do baseline que não aparecem mais (podem ser removidos): {', '.join(stale)}_"]
(REPORTS / "SUMMARY.md").write_text("\n".join(md) + "\n")
(REPORTS / "SUMMARY.json").write_text(json.dumps({k: dict(label=r["label"], counts=counts(r)) for k, r in results.items()}, indent=2))

for k, res in results.items():
    lines = [f"# {k}) {res['name']} — {res['label']}", "", "## Notas", *[f"- {n}" for n in res["notes"]], "", "## Achados", ""]
    fs = sorted(res["findings"], key=lambda f: (order[f["severity"]], not f["blocking"]))
    lines += [fmt(dict(f, check=k)) for f in fs] or ["_nenhum_"]
    (REPORTS / f"{SLUG[k]}.md").write_text("\n".join(lines) + "\n")

print("\n" + "=" * 78 + "\nRESUMO DAS CHECAGENS\n" + "=" * 78)
print("\n".join(term))
print("=" * 78)
print("Relatórios: checks/reports/SUMMARY.md" + ("   →  EXIT 1 (bloqueante/erro)" if rc else "   →  EXIT 0"))
sys.exit(rc)
