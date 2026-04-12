# Deploy - Clientes, SIAPE/Agente e Unificação por CPF

## Escopo

Entrega composta por 3 frentes:

1. Filtro `SIAPE` no módulo `Clientes` com 3 estados:
   - `Todos`
   - `Apenas`
   - `Excluir`
2. Filtro por `Agente` no módulo `Clientes` para `admin/supervisor`
3. Rotina de unificação de clientes duplicados por `CPF`, com remoção de casos novos redundantes

## Arquivos da entrega

- API: `apps/api/app/routers/clients.py`
- Script operacional: `apps/api/scripts/merge_duplicate_clients_by_cpf.py`
- Frontend: `apps/web/src/app/clientes/page.tsx`
- Frontend export CSV: `apps/web/src/components/ExportClientsDialog.tsx`
- Referência de stack local: `docs/LOCAL-STACK.md`

## Regras de negócio implementadas

### Filtros em `Clientes`

- `SIAPE` segue a mesma semântica da esteira:
  - `Todos`: sem restrição
  - `Apenas`: força `banco=SIAPE`
  - `Excluir`: envia `exclude_siape=true`
- `Agente` aparece apenas para `admin` e `supervisor`
- O export CSV respeita os filtros ativos da tela

### Unificação por CPF

- Um único `Client` canônico por `CPF`
- Se o CPF tiver caso já atendido, esse histórico é preservado e os casos novos duplicados são removidos
- Se o CPF só tiver casos novos, apenas 1 caso novo é mantido
- Telefones, endereços e dados SIAPE são migrados para o cliente canônico
- Casos já atendidos não são colapsados automaticamente entre si

## Resultado observado na base local

Execução concluída em `2026-04-12`:

- `3601` CPFs duplicados processados
- `3716` clientes duplicados consolidados
- `3712` casos novos duplicados removidos
- `0` CPFs duplicados remanescentes na tabela `clients`

## Pré-deploy

```bash
ssh root@72.60.158.156
cd /opt/lifeservicos/src
git branch
docker compose -f docker-compose.prod.yml ps
```

Esperado:

- branch correta do projeto
- containers atuais saudáveis antes da troca

## Backup obrigatório

```bash
cd /opt/lifeservicos/src

BACKUP_DIR="/opt/lifeservicos/backups/deploy-$(date +%Y%m%d-%H%M%S)-clientes-cpf"
mkdir -p "$BACKUP_DIR"

docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U "$DB_USER" -d "$DB_NAME" -F custom \
  > "$BACKUP_DIR/backup-custom.backup"

docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U "$DB_USER" -d "$DB_NAME" -F plain \
  > "$BACKUP_DIR/backup-plain.sql"

ls -lh "$BACKUP_DIR"
wc -l "$BACKUP_DIR/backup-plain.sql"
```

Validação mínima:

- o arquivo `backup-plain.sql` não pode estar vazio
- o backup precisa ter volume compatível com a base atual

## Deploy de código

```bash
cd /opt/lifeservicos/src
git fetch origin
git pull --ff-only origin life-system

docker compose -f docker-compose.prod.yml build api web migrate
docker compose -f docker-compose.prod.yml up -d db
docker compose -f docker-compose.prod.yml up -d migrate
docker compose -f docker-compose.prod.yml up -d api web proxy

docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail 100 api
docker compose -f docker-compose.prod.yml logs --tail 100 web
curl -f https://api.lifeservicos.com/health
```

## Execução da unificação por CPF no servidor

### 1. Simular primeiro

```bash
cd /opt/lifeservicos/src

docker compose -f docker-compose.prod.yml exec api \
  python scripts/merge_duplicate_clients_by_cpf.py
```

Se quiser validar um CPF específico antes:

```bash
docker compose -f docker-compose.prod.yml exec api \
  python scripts/merge_duplicate_clients_by_cpf.py --cpf 82071799372
```

### 2. Aplicar

```bash
cd /opt/lifeservicos/src

docker compose -f docker-compose.prod.yml exec api \
  python scripts/merge_duplicate_clients_by_cpf.py --apply
```

## Validação pós-merge

### SQL direto

```bash
cd /opt/lifeservicos/src

docker compose -f docker-compose.prod.yml exec -T db \
  psql -U "$DB_USER" -d "$DB_NAME" -c "
    SELECT COUNT(*) AS cpfs_duplicados
    FROM (
      SELECT cpf
      FROM clients
      GROUP BY cpf
      HAVING COUNT(*) > 1
    ) t;
  "
```

Esperado:

- `0` CPFs duplicados

### Exemplo de inspeção de CPF específico

```bash
docker compose -f docker-compose.prod.yml exec -T db \
  psql -U "$DB_USER" -d "$DB_NAME" -c "
    SELECT id, name, cpf, matricula, orgao, created_at
    FROM clients
    WHERE cpf = '82071799372'
    ORDER BY id;

    SELECT id, client_id, status, created_at
    FROM cases
    WHERE client_id IN (
      SELECT id FROM clients WHERE cpf = '82071799372'
    )
    ORDER BY id;
  "
```

### Validação funcional

No sistema:

1. Abrir `/clientes`
2. Testar `SIAPE = Todos`, `Apenas`, `Excluir`
3. Testar filtro por `Agente` com usuário `admin/supervisor`
4. Testar `Exportar CSV` com combinações de filtros
5. Buscar por um CPF antes duplicado e confirmar que agora há apenas um cadastro

## Rollback

Se o problema for apenas de código:

```bash
cd /opt/lifeservicos/src
git log --oneline -n 5
git checkout <commit-anterior>
docker compose -f docker-compose.prod.yml up -d --build api web proxy
```

Se o problema envolver a unificação em banco:

- parar a operação
- restaurar o backup criado nesta janela
- não repetir `--apply` antes de entender o ponto de falha

## Observações operacionais

- O script é idempotente para o cenário já consolidado: se não houver duplicados, ele só reporta que não encontrou CPFs duplicados
- A execução real deve ser feita fora de pico, porque ela faz escrita em lote em `clients` e `cases`
- Não há migration nesta entrega
