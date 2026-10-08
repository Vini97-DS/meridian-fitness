"""Modelo comum de achados/relatórios. Somente leitura sobre o app."""
import hashlib, json, os, sys, time
from pathlib import Path

CHECKS = Path(__file__).resolve().parent.parent
ROOT = CHECKS.parent
REPORTS = CHECKS / "reports"
SEVERITIES = ["critical", "high", "medium", "low"]
SEV_PT = {"critical": "crítico", "high": "alto", "medium": "médio", "low": "baixo"}
CHECK_NAMES = {
    "A": "Dependências vulneráveis",
    "B": "Varredura de segredos",
    "C": "Lint e qualidade estática",
    "D": "Lighthouse + PWA instalável",
    "E": "Acessibilidade e contraste (axe)",
    "F": "Tamanho e orçamento de carregamento",
    "G": "Cabeçalhos e PWA (passivo)",
    "H": "Testes e2e (smoke)",
}


def mask(value: str) -> str:
    """Nunca devolve o segredo inteiro."""
    value = value or ""
    return (value[:2] + "*" * 6) if len(value) > 8 else "*" * 6


def make_id(check, rule, key):
    return hashlib.sha1(f"{check}|{rule}|{key}".encode()).hexdigest()[:12]


class Result:
    def __init__(self, check):
        self.check = check
        self.name = CHECK_NAMES[check]
        self.status = "ran"  # ran | skipped | error
        self.notes, self.findings, self.meta = [], [], {}
        self.started = time.time()

    def note(self, text):
        self.notes.append(text)

    def skip(self, reason):
        self.status = "skipped"
        self.notes.append(reason)

    def add(self, severity, rule, key, title, location="", description="", suggestion="", blocking=False):
        assert severity in SEVERITIES
        if any(f["id"] == make_id(self.check, rule, key) for f in self.findings):
            return
        self.findings.append(dict(
            id=make_id(self.check, rule, key), severity=severity, blocking=blocking, rule=rule,
            title=title, location=location, description=description, suggestion=suggestion))

    def save(self):
        REPORTS.mkdir(exist_ok=True)
        out = dict(check=self.check, name=self.name, status=self.status, notes=self.notes,
                   findings=self.findings, meta=self.meta, seconds=round(time.time() - self.started, 1))
        (REPORTS / f"{self.check}.json").write_text(json.dumps(out, ensure_ascii=False, indent=2))


def load_budgets():
    return json.loads((CHECKS / "budgets.json").read_text())


def save_error(check, message):
    r = Result(check)
    r.status = "error"
    r.notes.append(message[-1500:])
    r.save()


if __name__ == "__main__" and len(sys.argv) >= 4 and sys.argv[1] == "--error":
    save_error(sys.argv[2], sys.argv[3])
