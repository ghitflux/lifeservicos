#!/usr/bin/env python3
"""
Script de deploy automatizado -- Life System
Uso: python scripts/deploy.py

Requer: pip install paramiko
"""

import paramiko
import sys
import time
from datetime import datetime

# --- Configuracoes ---
HOST = "72.60.158.156"
USER = "root"
PORT = 22
SRC_DIR = "/opt/lifeservicos/src"
BACKUP_DIR = "/opt/lifeservicos/backups"
BRANCH = "life-system"
DB_CONTAINER = "src-db-1"
DB_USER = "lifecalling"
DB_NAME = "lifecalling"

# Apenas api e web sao reconstruidos -- db e proxy nao sao tocados
SERVICES_REBUILD = ["api", "web"]

# Rede Docker dos servicos (necessaria para o proxy resolver DNS)
DOCKER_NETWORK = "life-net"
PROXY_CONTAINER = "src-proxy-1"


# --- Helpers ---
def banner(msg):
    _print("\n" + "=" * 60)
    _print("  " + msg)
    _print("=" * 60)


def _print(text):
    sys.stdout.buffer.write((text + "\n").encode("utf-8", errors="replace"))
    sys.stdout.buffer.flush()


def run(ssh, cmd, timeout=300):
    """Executa comando remoto e retorna (exit_code, stdout, stderr)."""
    preview = cmd[:120] + ("..." if len(cmd) > 120 else "")
    _print("  $ " + preview)
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    exit_code = stdout.channel.recv_exit_status()
    out = stdout.read().decode("utf-8", errors="replace").strip()
    err = stderr.read().decode("utf-8", errors="replace").strip()
    if out:
        for line in out[:1000].split("\n"):
            _print("    " + line)
    if err and exit_code != 0:
        _print("    [stderr] " + err[:400])
    return exit_code, out, err


def check(code, msg):
    if code != 0:
        _print("\n[FALHOU] " + msg + " (exit " + str(code) + ")")
        sys.exit(code)
    _print("  [OK] " + msg)


# --- Deploy ---
def deploy(password):
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    banner("Conectando ao servidor")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, port=PORT, username=USER, password=password, timeout=30)
    _print("  Conectado em " + USER + "@" + HOST)

    # 1. Criar diretorio de backup
    banner("1/7 - Preparando diretorio de backup")
    code, _, _ = run(ssh, "mkdir -p " + BACKUP_DIR)
    check(code, "Diretorio de backup criado")

    # 2. Backup do banco de dados
    banner("2/7 - Backup do banco de dados")
    db_backup = BACKUP_DIR + "/db_" + timestamp + ".sql"
    code, _, _ = run(
        ssh,
        "docker exec " + DB_CONTAINER + " pg_dump -U " + DB_USER + " " + DB_NAME + " > " + db_backup,
        timeout=300,
    )
    check(code, "Backup DB -> " + db_backup)
    code, size, _ = run(ssh, "du -sh " + db_backup)
    _print("  Tamanho: " + (size.split()[0] if size else "n/a"))

    # 3. Backup do codigo
    banner("3/7 - Backup do codigo-fonte")
    code_backup = BACKUP_DIR + "/code_" + timestamp + ".tar.gz"
    code, _, _ = run(
        ssh,
        "tar -czf " + code_backup + " --exclude=" + SRC_DIR + "/.git " + SRC_DIR,
        timeout=120,
    )
    check(code, "Backup codigo -> " + code_backup)
    code, size, _ = run(ssh, "du -sh " + code_backup)
    _print("  Tamanho: " + (size.split()[0] if size else "n/a"))

    # 4. Git pull
    banner("4/7 - Atualizando codigo (git pull)")
    code, _, _ = run(ssh, "cd " + SRC_DIR + " && git fetch origin")
    check(code, "git fetch")
    code, out, _ = run(ssh, "cd " + SRC_DIR + " && git pull origin " + BRANCH)
    check(code, "git pull")
    code, out, _ = run(ssh, "cd " + SRC_DIR + " && git log --oneline -3")
    _print("  Commits recentes:")
    for line in out.split("\n"):
        _print("    " + line)

    # 5. Rebuild sem cache -- APENAS api e web, sem tocar db
    banner("5/7 - Rebuild sem cache: " + ", ".join(SERVICES_REBUILD))
    services_str = " ".join(SERVICES_REBUILD)
    compose_base = "cd " + SRC_DIR + " && docker compose"

    code, _, _ = run(
        ssh,
        compose_base + " build --no-cache " + services_str + " 2>&1 | tail -25",
        timeout=600,
    )
    check(code, "Build concluido")

    # 6. Restart com force-recreate -- --no-deps para NAO recriar db
    banner("6/7 - Restart: " + ", ".join(SERVICES_REBUILD))
    code, _, _ = run(
        ssh,
        compose_base + " up -d --force-recreate --no-deps " + services_str,
        timeout=120,
    )
    check(code, "Containers recriados")

    _print("\n  Aguardando inicializacao (40s)...")
    time.sleep(40)

    # Verificar se containers realmente subiram (nao ficaram em Created)
    # force-recreate pode deixar containers em estado Created sem iniciar
    code, status_out, _ = run(
        ssh,
        "docker ps -a --format '{{.Names}} {{.Status}}' | grep -E 'src-api|src-web'",
    )
    stuck_created = [l for l in status_out.splitlines() if "Created" in l]
    if stuck_created:
        _print("\n  AVISO: Containers presos em Created, forcando start...")
        for container in stuck_created:
            name = container.split()[0]
            run(ssh, f"docker start {name}")
        time.sleep(20)
    else:
        _print("\n  Containers iniciados corretamente.")

    # Garantir que proxy esta na mesma rede para resolver DNS
    banner("Garantindo conectividade do proxy")
    code, out, _ = run(
        ssh,
        "docker network connect " + DOCKER_NETWORK + " " + PROXY_CONTAINER + " 2>/dev/null || echo ja_conectado",
    )
    _print("  Proxy -> " + DOCKER_NETWORK + ": " + (out or "ok"))

    # 7. Verificacao de saude
    banner("7/7 - Verificacao de saude")

    code, out, _ = run(ssh, "docker ps --format '{{.Names}} | {{.Status}}' | grep src-")
    _print("\nContainers:")
    for line in out.split("\n"):
        _print("  " + line)

    code, out, _ = run(ssh, "docker logs src-api-1 --tail 15 2>&1")
    _print("\nLogs API (15 linhas):")
    for line in out.split("\n"):
        _print("  " + line)

    code, out, _ = run(
        ssh,
        "curl -s --max-time 10 -o /dev/null -w \"%{http_code}\" https://api.lifeservicos.com/health || echo 000",
    )
    _print("\nHealth API (externo): HTTP " + out)

    code, out, _ = run(
        ssh,
        "curl -s --max-time 10 -o /dev/null -w \"%{http_code}\" https://lifeservicos.com/ || echo 000",
    )
    _print("Web (externo):        HTTP " + out)

    ssh.close()

    banner("DEPLOY CONCLUIDO COM SUCESSO")
    _print("  Timestamp:     " + timestamp)
    _print("  Backup DB:     " + db_backup)
    _print("  Backup codigo: " + code_backup)
    _print("  Branch:        " + BRANCH)
    print()


if __name__ == "__main__":
    import getpass

    if len(sys.argv) > 1:
        pwd = sys.argv[1]
    else:
        pwd = getpass.getpass("Senha SSH para " + USER + "@" + HOST + ": ")

    deploy(pwd)
