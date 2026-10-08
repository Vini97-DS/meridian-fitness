"""B) Segredos: gitleaks se existir; senão detect-secrets (arvore atual + histórico inteiro do git).
Nunca grava o valor do segredo: só arquivo, linha, tipo e valor mascarado."""
import json, os, shutil, subprocess, sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent / "lib"))
from common import Result, ROOT, CHECKS, mask

r = Result("B")
_PLUGINS = ["ArtifactoryDetector", "AWSKeyDetector", "AzureStorageKeyDetector", "BasicAuthDetector",
            "CloudantDetector", "DiscordBotTokenDetector", "GitHubTokenDetector", "GitLabTokenDetector",
            "IbmCloudIamDetector", "IbmCosHmacDetector", "JwtTokenDetector", "KeywordDetector",
            "MailchimpDetector", "NpmDetector", "OpenAIDetector", "PrivateKeyDetector", "PypiTokenDetector",
            "SendGridDetector", "SlackDetector", "SoftlayerDetector", "SquareOAuthDetector",
            "StripeDetector", "TelegramBotTokenDetector", "TwilioKeyDetector"]
DS_CONFIG = {"plugins_used": [{"name": n} for n in _PLUGINS]
             + [{"name": "Base64HighEntropyString", "limit": 4.7}, {"name": "HexHighEntropyString", "limit": 3.6}],
             "filters_used": [{"path": "detect_secrets.filters.heuristic.is_potential_uuid"},
                              {"path": "detect_secrets.filters.heuristic.is_likely_id_string"},
                              {"path": "detect_secrets.filters.heuristic.is_templated_secret"},
                              {"path": "detect_secrets.filters.heuristic.is_sequential_string"},
                              {"path": "detect_secrets.filters.heuristic.is_indirect_reference"},
                              {"path": "detect_secrets.filters.common.is_ignored_due_to_verification_policies",
                               "min_level": 2}]}
SKIP_EXT = {".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".woff", ".woff2", ".pdf", ".zip"}
gitleaks = shutil.which("gitleaks") or (str(CHECKS / "bin" / "gitleaks") if (CHECKS / "bin" / "gitleaks").exists() else None)


def via_gitleaks():
    r.meta["tool"] = "gitleaks"
    r.note("Ferramenta: gitleaks (árvore + histórico git).")
    out = tempfile.mktemp(suffix=".json")
    subprocess.run([gitleaks, "detect", "--source", str(ROOT), "--redact", "--no-banner",
                    "--report-format", "json", "--report-path", out, "--exit-code", "0"],
                   capture_output=True, text=True)
    items = json.loads(Path(out).read_text() or "[]") if os.path.exists(out) else []
    if os.path.exists(out): os.remove(out)
    for it in items:
        loc = f"{it.get('File')}:{it.get('StartLine')} (commit {str(it.get('Commit',''))[:8]})"
        r.add("critical", it.get("RuleID", "secret"), f"{it.get('File')}|{it.get('RuleID')}|{it.get('Fingerprint')}",
              f"Possível segredo: {it.get('RuleID')}", loc, "Valor redigido pelo gitleaks (--redact).",
              "Revogar/rotacionar a credencial; remover do código e do histórico se necessário.", blocking=True)


def via_detect_secrets():
    from detect_secrets.core.scan import scan_file
    from detect_secrets.settings import transient_settings
    r.meta["tool"] = "detect-secrets"
    r.note("⚠ gitleaks não está instalado (binário só vem do GitHub Releases, bloqueado neste ambiente) → "
           "usando detect-secrets. A varredura de histórico é feita por este script (todos os blobs de "
           "todos os commits), pois o detect-secrets nativo só varre a árvore atual. Cobertura de regras "
           "é menor que a do gitleaks; instale o gitleaks no seu PC/CI para a checagem completa.")
    seen = {}
    objs = subprocess.run(["git", "rev-list", "--objects", "--all"], cwd=ROOT, capture_output=True, text=True).stdout.splitlines()
    head_blobs = set()
    for line in subprocess.run(["git", "ls-tree", "-r", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.splitlines():
        head_blobs.add(line.split()[2])
    blobs = {}
    for o in objs:
        parts = o.split(" ", 1)
        if len(parts) == 2 and Path(parts[1]).suffix.lower() not in SKIP_EXT:
            blobs.setdefault(parts[0], parts[1])
    n_scanned = 0
    tmpdir = tempfile.mkdtemp()
    with transient_settings(DS_CONFIG):
        for sha, path in blobs.items():
            p = subprocess.run(["git", "cat-file", "blob", sha], cwd=ROOT, capture_output=True)
            if len(p.stdout) > 2_000_000 or b"\0" in p.stdout[:4000]:
                continue
            n_scanned += 1
            tmp = Path(tmpdir) / ("f" + sha[:8] + Path(path).suffix)
            tmp.write_bytes(p.stdout)
            for sec in scan_file(str(tmp)):
                key = (path, sec.type, sec.secret_hash)
                where = "árvore atual" if sha in head_blobs else "só no histórico"
                ent = seen.setdefault(key, dict(path=path, type=sec.type, line=sec.line_number, masked=mask(sec.secret_value), where=where, sha=sha[:8]))
                if sha in head_blobs:
                    ent["where"] = "árvore atual"; ent["line"] = sec.line_number
            tmp.unlink()
    r.note(f"{n_scanned} arquivos/versões únicos varridos.")
    for (path, typ, h), e in seen.items():
        r.add("critical", typ, f"{path}|{typ}|{h}", f"Possível segredo: {typ}",
              f"{e['path']}:{e['line']} [{e['where']}, blob {e['sha']}]",
              f"Valor mascarado: {e['masked']}. (Valor completo NÃO gravado no relatório.)",
              "Verificar se é real; se for, rotacionar a credencial e removê-la do código/histórico.", blocking=True)


try:
    via_gitleaks() if gitleaks else via_detect_secrets()
except Exception as e:  # noqa
    r.status = "error"; r.note(f"falha na varredura: {type(e).__name__}: {e}")
r.save()
