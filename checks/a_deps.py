"""A) Dependências vulneráveis: pip-audit (requirements.txt) e npm audit (se houver package.json na raiz)."""
import json, shutil, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent / "lib"))
from common import Result, ROOT, CHECKS

r = Result("A")
HIGH = {"high", "critical"}

# ── Python ──────────────────────────────────────────────────────
req = ROOT / "requirements.txt"
pip_audit = CHECKS / ".venv" / "bin" / "pip-audit"
if not req.exists():
    r.note("Python: sem requirements.txt — nada a auditar.")
else:
    p = subprocess.run([str(pip_audit), "-r", str(req), "--format", "json", "--progress-spinner", "off"],
                       capture_output=True, text=True, cwd=ROOT)
    try:
        data = json.loads(p.stdout)
    except Exception:
        r.status = "error"
        r.note("pip-audit não devolveu JSON: " + (p.stderr or p.stdout)[-800:])
        data = {"dependencies": []}
    n_deps = len(data.get("dependencies", []))
    r.meta["python_deps_audited"] = n_deps
    r.note(f"Python: {n_deps} dependências auditadas via pip-audit (requirements.txt).")
    for d in data.get("dependencies", []):
        if d.get("skip_reason"):
            r.note(f"Python: {d['name']} não auditada ({d['skip_reason']}).")
        for v in d.get("vulns", []):
            ids = ", ".join([v["id"]] + v.get("aliases", []))
            fix = ", ".join(v.get("fix_versions") or []) or "sem versão corrigida publicada"
            # pip-audit não informa severidade; sem dado, assumimos ALTA (conservador, bloqueia).
            r.add("high", "pip-audit", f"{d['name']}|{v['id']}",
                  f"{d['name']} {d.get('version','?')} vulnerável ({v['id']})",
                  "requirements.txt",
                  f"{ids}. Severidade não informada pelo pip-audit — tratada como ALTA (conservador). "
                  + (v.get("description") or "")[:240],
                  (f"Atualizar {d['name']} para: {fix}." if v.get("fix_versions") else f"Sem correção publicada: avaliar a exposição real ou trocar a biblioteca ({d['name']}).") + " Fixar versões no requirements.txt.", blocking=True)

# ── Node ────────────────────────────────────────────────────────
pkg = ROOT / "package.json"
if not pkg.exists():
    r.note("Node: sem package.json na raiz — npm audit não se aplica (o front é HTML/JS vanilla; "
           "o /checks/package.json são só ferramentas de dev e não vão ao deploy).")
else:
    p = subprocess.run(["npm", "audit", "--json"], capture_output=True, text=True, cwd=ROOT)
    try:
        vulns = json.loads(p.stdout).get("vulnerabilities", {})
    except Exception:
        vulns = {}
        r.status = "error"; r.note("npm audit falhou: " + (p.stderr or p.stdout)[-500:])
    for name, v in vulns.items():
        sev = v.get("severity", "low")
        sev = {"moderate": "medium", "info": "low"}.get(sev, sev)
        r.add(sev, "npm-audit", name, f"{name} vulnerável ({v.get('severity')})", "package.json",
              "Via: " + ", ".join(str(x if isinstance(x, str) else x.get("title", "")) for x in v.get("via", []))[:300],
              "Rodar `npm audit fix` em branch separado e revisar.", blocking=sev in HIGH)
r.save()
