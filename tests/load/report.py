#!/usr/bin/env python3
"""Lê tests/load/reports/k6-<label>.json (+ arquivos de apoio) e imprime/gera o resumo em Markdown com p95 por cenário e endpoint."""
import json, sys
from pathlib import Path

R = Path(__file__).parent / "reports"
labels = sys.argv[1:] or sorted(p.stem[3:] for p in R.glob("k6-*.json"))


def get(label):
    d = json.loads((R / f"k6-{label}.json").read_text())
    m = d["metrics"]
    rd = lambda n, default="": (R / f"{n}-{label}.txt").read_text().strip() if (R / f"{n}-{label}.txt").exists() else default
    return d, m, rd


def vals(x):
    return (x.get("values") if isinstance(x.get("values"), dict) else x) if x else {}


def v(m, k, f):
    return vals(m.get(k)).get(f)


def ms(x): return "—" if x is None else f"{x:,.0f}"


out = []
for label in labels:
    d, m, rd = get(label)
    dur = d["state"]["testRunDurationMs"] / 1000
    out += [f"## Execução `{label}`  (duração {dur:.0f}s · {vals(m['http_reqs'])['count']:,} requisições · {vals(m['http_reqs'])['rate']:.0f} req/s)", ""]
    db = rd("db-after").splitlines()
    out += [f"- Conexões abertas no Postgres (pico): **{rd('peak-conns', '?')}** · erros de conexão no api.log (“too many clients”): **{rd('conn-errors', '?')}** · tracebacks no api.log: **{rd('tracebacks', '?')}**",
            f"- Banco depois: {' · '.join(db)}", ""]
    out += ["| Cenário | req | falhas | média | **p95** | p99 | máx |", "|---|--:|--:|--:|--:|--:|--:|"]
    for sc, name in [("students_peak", "alunos (tráfego contínuo)"), ("pro_dashboard", "painel do profissional"), ("offline_herd", "fila offline — rajada SEM jitter"),
                     ("offline_herd_jitter", "fila offline — rajada COM jitter (0–15s)"), ("login_abuse", "abuso do login (1 IP)")]:
        k = f"http_req_duration{{scenario:{sc}}}"
        if k not in m: continue
        f = vals(m.get(f"http_req_failed{{scenario:{sc}}}"))
        fails, tot = f.get("passes", 0), f.get("passes", 0) + f.get("fails", 0)
        ok = all(t["ok"] for t in m[k].get("thresholds", {}).values())
        out.append(f"| {name} | {tot:,} | {fails} ({(100 * fails / tot if tot else 0):.1f}%) | {ms(v(m, k, 'avg'))} | **{ms(v(m, k, 'p(95)'))}** {'✅' if ok else '❌'} | {ms(v(m, k, 'p(99)'))} | {ms(v(m, k, 'max'))} |")
    out += ["", "| Endpoint | p95 (ms) | p99 | máx | orçamento |", "|---|--:|--:|--:|---|"]
    for k, x in sorted(m.items()):
        if k.startswith("http_req_duration{endpoint:"):
            ep = k[len("http_req_duration{endpoint:"):-1]
            th = list(x.get("thresholds", {}).items())
            out.append(f"| {ep} | **{ms(vals(x).get('p(95)'))}** | {ms(vals(x).get('p(99)'))} | {ms(vals(x).get('max'))} | {th[0][0] if th else ''} {'✅' if th and th[0][1]['ok'] else '❌' if th else ''} |")
    out.append("")
text = "\n".join(out)
(R / "RESULTADO.md").write_text(text)
print(text)
