# Deploy - Atendimento: filtros por banco/cargo/busca

## Escopo

Correção dos filtros da Esteira de Atendimentos nas tabs:

- Casos Novos
- Casos Retornados
- Global
- Meus Atendimentos

A regra principal desta entrega é que o filtro de banco não consulta apenas `cases.entidade`. Ele passa a considerar também os bancos registrados nas linhas de folha e SIAPE vinculadas ao CPF do cliente.

## Arquivos alterados

- `apps/api/app/routers/cases.py`
- `apps/api/app/routers/clients.py`
- `apps/web/src/app/esteira/page.tsx`
- `packages/ui/src/EsteiraCard.tsx`
- `packages/ui/src/CasesTable.tsx`
- `docs/DEPLOY-2026-05-07-ATENDIMENTO-FILTROS.md`

## Regras implementadas

- `GET /cases` filtra banco por:
  - `cases.entidade`
  - `payroll_lines.entity_name` pelo CPF do cliente
  - `siape_lines.banco_emprestimo` pelo CPF do cliente
- `q=` busca também em:
  - cargo do cliente
  - cargo da folha
  - bancos da folha
  - bancos SIAPE
- `cargo=` consulta `clients.cargo` e `payroll_lines.cargo`.
- Ordenações `financiamentos_desc` e `financiamentos_banco_desc:<banco>` são aplicadas antes da paginação.
- `GET /cases/filters` fornece bancos, cargos e status pelo mesmo escopo da tab ativa.
- O payload de caso mantém `banco` e adiciona `banco_principal` e `bancos`.
- O CSV usa a mesma regra de filtros e exporta `banco` e `bancos_registrados`.
- A normalização preserva `BANCO INDUSTRIAL DO BRASIL` e agrupa a variação SIAPE `BANCO INDUSTRIAL E COMERCIAL`.

## Validação local

Executado no container local `life-system-api-1`:

```bash
docker exec life-system-api-1 python -m py_compile app/routers/cases.py app/routers/clients.py
```

Contagens confirmadas no dump local:

- Global: `79811`
- Casos Novos: `76571`
- Casos Retornados: `2748`
- Banco Industrial do Brasil global: `2487`
- Banco Industrial do Brasil em Casos Novos: `1809`
- Banco Industrial do Brasil em Casos Retornados: `601`
- Busca `Coronel`: `125`

Validação de opções de filtro:

- `/cases/filters?status=novo&never_attended=true` inclui `BANCO INDUSTRIAL DO BRASIL` com `1809`.
- `/cases/filters?status=novo&returned_to_pipeline=true` inclui `BANCO INDUSTRIAL DO BRASIL` com `601`.
- `/cases/filters` global inclui `BANCO INDUSTRIAL DO BRASIL` com `2487`.

Validação de export:

- CSV global com `entidade=BANCO INDUSTRIAL DO BRASIL` exportou `2487` linhas.

Validação frontend:

```bash
cd apps/web
npm run build
```

Resultado: build Next concluído com sucesso e rota `/esteira` gerada.

Observação: `npm run lint` falhou antes de analisar os arquivos por erro de configuração existente no ESLint 9/plugin React:

```text
TypeError: Converting circular structure to JSON
property 'react' closes the circle
```

## Deploy padrão via Paramiko

Executar a partir da raiz do repositório local:

```bash
cd /mnt/d/apps/lifeservicos/life-system
python scripts/deploy.py
```

O script `scripts/deploy.py` já executa:

- conexão SSH via Paramiko em `root@72.60.158.156`
- backup SQL do banco
- backup compactado do código
- `git fetch`
- `git pull origin life-system`
- rebuild sem cache apenas de `api` e `web`
- restart com `--force-recreate --no-deps api web`
- validação de containers, logs e health checks externos

Não há migration nesta entrega.

## Caminho manual SSH como fallback

Usar somente se o Paramiko falhar.

```bash
ssh root@72.60.158.156
cd /opt/lifeservicos/src
git branch
docker compose ps
```

## Backup obrigatório

```bash
cd /opt/lifeservicos/src

BACKUP_DIR="/opt/lifeservicos/backups/deploy-$(date +%Y%m%d-%H%M%S)-atendimento-filtros"
mkdir -p "$BACKUP_DIR"

docker exec src-db-1 pg_dump -U lifecalling lifecalling > "$BACKUP_DIR/db.sql"
tar -czf "$BACKUP_DIR/code.tar.gz" --exclude=/opt/lifeservicos/src/.git /opt/lifeservicos/src

du -sh "$BACKUP_DIR/db.sql" "$BACKUP_DIR/code.tar.gz"
```

O arquivo `db.sql` não pode ficar vazio.

## Deploy manual de código

```bash
cd /opt/lifeservicos/src
git fetch origin
git pull --ff-only origin life-system

docker compose build --no-cache api web
docker compose up -d --force-recreate --no-deps api web

docker network connect life-net src-proxy-1 2>/dev/null || true
docker compose ps
docker logs src-api-1 --tail 80
docker logs src-web-1 --tail 80
```

## Validações pós-deploy

### Health

```bash
curl -sS -f https://api.lifeservicos.com/health
curl -sS -I https://lifeservicos.com/esteira
```

### SQL

```bash
docker exec -i src-db-1 psql -U lifecalling -d lifecalling <<'SQL'
SELECT COUNT(*) AS global FROM cases;

SELECT COUNT(*) AS industrial_cases_entidade
FROM cases
WHERE entidade ILIKE '%INDUSTRIAL%';

SELECT COUNT(DISTINCT c.id) AS industrial_folha
FROM cases c
JOIN clients cl ON cl.id = c.client_id
JOIN payroll_lines pl ON pl.cpf = cl.cpf
WHERE pl.entity_name ILIKE '%INDUSTRIAL%';

SELECT COUNT(DISTINCT c.id) AS industrial_siape
FROM cases c
JOIN clients cl ON cl.id = c.client_id
JOIN siape_lines sl ON sl.cpf = cl.cpf
WHERE sl.banco_emprestimo ILIKE '%INDUSTRIAL%';
SQL
```

### API

Usar token de usuário `admin/supervisor` válido.

```bash
API="https://api.lifeservicos.com"
TOKEN="<TOKEN>"

curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API/cases?page_size=1"

curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API/cases?status=novo&never_attended=true&page_size=1"

curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API/cases?status=novo&returned_to_pipeline=true&page_size=1"

curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API/cases?entidade=BANCO%20INDUSTRIAL%20DO%20BRASIL&page_size=1"

curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API/cases/filters?status=novo&never_attended=true"

curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API/cases?q=Coronel&page_size=1"
```

Esperado conforme dump local usado na validação:

- Global: `79811`
- Casos Novos: `76571`
- Casos Retornados: `2748`
- Industrial Global: `2487`
- Industrial Novos: `1809`
- Industrial Retornados: `601`
- `Coronel`: mais de 1 caso; no dump local validado retornou `125`

Os totais de produção podem divergir se a base do servidor tiver mudado depois do dump local.

### UI

Validar em `/esteira`:

- Casos Novos: banco Industrial aparece e filtra.
- Casos Retornados: banco Industrial aparece e filtra.
- Global: banco Industrial aparece e filtra.
- Meus Atendimentos: filtros de busca, banco, cargo, status e SIAPE funcionam.
- Chips removem filtros individualmente.
- `Limpar filtros` limpa também a busca.
- Cards/tabela exibem banco principal e `+N` quando houver mais de um banco.
- Export CSV com Industrial bate com o total filtrado na tela.

## Rollback

Se o problema for apenas de código:

```bash
cd /opt/lifeservicos/src
git log --oneline -n 5
git checkout <commit_anterior>
docker compose build --no-cache api web
docker compose up -d --force-recreate --no-deps api web
docker logs src-api-1 --tail 80
docker logs src-web-1 --tail 80
```

Se houver suspeita de impacto em dados, restaurar o backup criado na janela:

```bash
cd /opt/lifeservicos/src
docker exec -i src-db-1 psql -U lifecalling -d lifecalling < /opt/lifeservicos/backups/<backup>/db.sql
```

Esta entrega não altera schema nem executa migration.
