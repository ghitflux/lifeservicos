# Guia de Deploy — Life System

## Informações do Servidor

| Item | Valor |
|------|-------|
| Servidor | `root@72.60.158.156` |
| Diretório | `/opt/lifeservicos/src` |
| Branch produção | `life-system` |
| DB container | `src-db-1` |
| API container | `src-api-1` |
| Web container | `src-web-1` |
| Proxy container | `src-proxy-1` |
| DB usuário | `lifecalling` |
| DB nome | `lifecalling` |
| Rede Docker | `life-net` |

---

## Checklist de Deploy Completo

- [ ] 1. Criar commit e push da branch `life-system`
- [ ] 2. Acessar servidor via SSH
- [ ] 3. Fazer backup do banco de dados
- [ ] 4. Fazer backup do código fonte
- [ ] 5. `git pull origin life-system`
- [ ] 6. Rebuild sem cache: `api` e `web` apenas
- [ ] 7. Restart com `--force-recreate --no-deps`: `api` e `web` apenas
- [ ] 8. Garantir que o proxy está na rede `life-net` (ver seção abaixo)
- [ ] 9. Verificar saúde dos containers
- [ ] 10. Verificar logs da API (startup, sem erros)
- [ ] 11. Testar endpoints externos (health, web)

---

## Procedimento Manual Passo a Passo

### 1. Conectar ao servidor

```bash
ssh root@72.60.158.156
cd /opt/lifeservicos/src
```

### 2. Backup do banco de dados

```bash
mkdir -p /opt/lifeservicos/backups
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
docker exec src-db-1 pg_dump -U lifecalling lifecalling \
  > /opt/lifeservicos/backups/db_${TIMESTAMP}.sql
ls -lh /opt/lifeservicos/backups/db_${TIMESTAMP}.sql
```

### 3. Backup do código

```bash
tar -czf /opt/lifeservicos/backups/code_${TIMESTAMP}.tar.gz \
  --exclude=/opt/lifeservicos/src/.git /opt/lifeservicos/src
ls -lh /opt/lifeservicos/backups/code_${TIMESTAMP}.tar.gz
```

### 4. Atualizar código

```bash
git fetch origin
git pull origin life-system
git log --oneline -3
```

### 5. Rebuild sem cache (apenas api e web)

```bash
docker compose build --no-cache api web
```

### 6. Restart — IMPORTANTE: usar --no-deps

```bash
docker compose up -d --force-recreate --no-deps api web
```

> **Por que `--no-deps`?**
> Sem `--no-deps`, o Docker Compose pode recriar o `db` como dependência do `api`,
> interrompendo o banco de dados desnecessariamente.
> Sempre use `--no-deps` para deploy parcial de api/web.

### 7. Garantir proxy na rede life-net (ver seção de problema conhecido)

```bash
docker network connect life-net src-proxy-1 2>/dev/null || echo "ja conectado"
```

### 8. Verificar saúde

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}'
docker logs src-api-1 --tail 20
curl -s -o /dev/null -w 'API: %{http_code}\n' https://api.lifeservicos.com/health
curl -s -o /dev/null -w 'WEB: %{http_code}\n' https://lifeservicos.com/
```

---

## Deploy Automatizado

Use o script `scripts/deploy.py`:

```bash
python scripts/deploy.py
```

O script executa todo o checklist: backup, pull, rebuild e verificação.

---

## Problema Conhecido: Proxy perde acesso à rede life-net

### O que acontece

Após `docker compose up -d --force-recreate api web`, o container `src-proxy-1`
(Caddy) pode perder a capacidade de resolver os hostnames `api` e `web` via
DNS interno do Docker, retornando erro:

```text
dial tcp: lookup api on 127.0.0.11:53: server misbehaving
```

O resultado externo é **502 Bad Gateway** em `api.lifeservicos.com` e `lifeservicos.com`.

### Por que acontece

O proxy Caddy usa os nomes de serviço `api:8000` e `web:3000` no Caddyfile.
Esses nomes são resolvidos pelo DNS interno do Docker (`127.0.0.11`) apenas
dentro da rede `life-net`. O `src-proxy-1` precisa estar conectado a essa
rede para resolver os hostnames. Após o force-recreate dos containers,
o DNS interno pode se tornar instável para o proxy até que ele seja reconectado.

### Solução imediata

```bash
docker network connect life-net src-proxy-1 2>/dev/null || echo "ja conectado"
```

Se o erro persistir, reiniciar o proxy também:

```bash
docker restart src-proxy-1
sleep 5
docker network connect life-net src-proxy-1 2>/dev/null || echo "ja conectado"
```

### Verificar se o proxy está na rede correta

```bash
docker inspect src-proxy-1 --format '{{json .NetworkSettings.Networks}}' \
  | python3 -c "import sys,json; [print(k) for k in json.load(sys.stdin)]"
# Deve listar: life-net (alem de src_default)
```

### Prevenção permanente

Para evitar o problema definitivamente, adicionar o proxy ao compose
principal (`docker-compose.yml`) com a rede `life-net` explicitamente,
ou adicionar o seguinte ao Caddyfile como fallback por IP direto caso
o DNS falhe.

---

## Rollback

Em caso de falha após o deploy:

```bash
# Voltar para commit anterior
cd /opt/lifeservicos/src
git log --oneline -5
git checkout <commit-hash>

# Rebuild
docker compose build --no-cache api web
docker compose up -d --force-recreate --no-deps api web

# Reconectar proxy se necessário
docker network connect life-net src-proxy-1 2>/dev/null || true
```

Para restaurar backup do banco:

```bash
docker exec -i src-db-1 psql -U lifecalling -c "DROP DATABASE lifecalling;"
docker exec -i src-db-1 psql -U lifecalling -c "CREATE DATABASE lifecalling;"
docker exec -i src-db-1 psql -U lifecalling lifecalling \
  < /opt/lifeservicos/backups/db_TIMESTAMP.sql
```

---

## Manutenção de Backups

Listar backups:

```bash
ls -lhrt /opt/lifeservicos/backups/
```

Limpar backups com mais de 7 dias:

```bash
find /opt/lifeservicos/backups/ -mtime +7 -delete
```

---

## Troubleshooting

### 502 Bad Gateway após deploy

Ver seção **Problema Conhecido: Proxy perde acesso à rede life-net** acima.

### Container não sobe

```bash
docker logs src-api-1 --tail 50
docker logs src-web-1 --tail 50
```

### Banco não conecta

```bash
docker inspect src-db-1 --format '{{.State.Health.Status}}'
docker exec -it src-db-1 psql -U lifecalling -c '\l'
```

### Rebuild completo (todos os containers)

```bash
docker compose down
docker compose build --no-cache
docker compose up -d
docker network connect life-net src-proxy-1 2>/dev/null || true
```

---

**Última Atualização**: 2026-03-18
**Branch Produção**: life-system
