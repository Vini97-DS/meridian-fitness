"""H) Testes e2e (smoke): chama `npm run e2e:smoke` em tests/e2e quando há alvo de TESTE + credenciais; senão PULA com aviso.
Falha de teste "real" é bloqueante; falha de funcionalidade ainda inexistente (lacuna conhecida) vira alerta; instável vira aviso."""
import json, os, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent / "lib"))
from common import Result, ROOT

r = Result("H")
E2E = ROOT / "tests" / "e2e"
need = ["USER_BASE_URL", "TEST_STUDENT_TOKEN", "TEST_PRO_TOKEN", "DATABASE_URL", "TEST_DB_HOST_ALLOWLIST"]
missing = [n for n in need if not os.environ.get(n)]
if not (E2E / "package.json").exists():
    r.skip("tests/e2e não existe.")
elif missing:
    r.skip("PULADA (não é falha): defina " + ", ".join("BASE_URL" if m == "USER_BASE_URL" else m for m in missing)
           + " (apontando para o ambiente de TESTE) — ver tests/e2e/README.md.")
else:
    env = dict(os.environ, BASE_URL=os.environ["USER_BASE_URL"], APP_ENV=os.environ.get("APP_ENV", "test"))
    if not (E2E / "node_modules").exists():
        subprocess.run(["npm", "install", "--no-audit", "--no-fund"], cwd=E2E, capture_output=True)
    res_file = E2E / "reports" / "results.json"
    res_file.unlink(missing_ok=True)
    p = subprocess.run(["npm", "run", "e2e:smoke"], cwd=E2E, env=env, capture_output=True, text=True)
    (E2E / "reports").mkdir(exist_ok=True)
    if not res_file.exists():
        r.status = "error"; r.note("os e2e não geraram resultado (guardas recusaram ou erro de setup): " + (p.stdout + p.stderr)[-900:])
    else:
        data = json.loads(res_file.read_text())
        total = 0
        def walk(s):
            global total
            for c in s.get("suites", []): walk(c)
            for sp in s.get("specs", []):
                for t in sp["tests"]:
                    total += 1
                    gap = any(a["type"] == "gap" for a in t.get("annotations", []))
                    note = next((a.get("description", "") for a in t["annotations"] if a["type"] == "gap"), "")
                    last = (t.get("results") or [{}])[-1]
                    err = (last.get("error", {}).get("message") or "").splitlines()[0][:200]
                    loc = f"tests/e2e/{sp['file']}:{sp['line']} [{t.get('projectName')}]"
                    if t["status"] == "flaky":
                        r.add("low", "e2e-flaky", sp["title"] + t["projectName"], f"Teste instável: {sp['title']}", loc, "Passou só na repetição.", "Estabilizar seletor/espera.")
                    elif t["status"] in ("unexpected",):
                        if gap:
                            r.add("medium", "e2e-gap", sp["title"] + t["projectName"], f"Lacuna conhecida: {sp['title']}", loc, f"{err} — esperado: {note}", "Implementar a funcionalidade ou remover a marca gap() do teste quando existir.")
                        else:
                            r.add("high", "e2e-fail", sp["title"] + t["projectName"], f"Falhou: {sp['title']}", loc, err, "Ver trace/screenshot em tests/e2e/reports/artifacts.", blocking=True)
        for s in data.get("suites", []): walk(s)
        r.note(f"{total} testes smoke executados (projetos: {', '.join(sorted({t['projectName'] for s in data['suites'] for sp in s.get('specs', []) for t in sp['tests']}))}).")
r.save()
