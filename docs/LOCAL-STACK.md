# Stack Local

## Árvore ativa

Para desenvolvimento local desta aplicação, a árvore ativa é:

- Frontend: `/mnt/d/apps/lifeservicos/life-system/apps/web`
- API: `/mnt/d/apps/lifeservicos/life-system/apps/api`
- Docs: `/mnt/d/apps/lifeservicos/life-system/docs`

Não confundir com a outra árvore do repositório:

- `/mnt/d/apps/lifeservicos/apps/...`

Quando o `localhost:3000` estiver exibindo a aplicação `life-system`, as alterações corretas devem ser feitas em `life-system/apps/...`.

## Portas locais

Padrão local atual:

- Frontend: `http://localhost:3000`
- API: `http://localhost:8000`
- PostgreSQL local do `life-system`: `localhost:5433`

## Banco local

O banco local do `life-system` roda em Docker:

- Container DB: `life-system-db-1`
- Imagem: `postgres:16`
- Porta exposta: `5433 -> 5432`

Configuração observada em `life-system/apps/api/.env.local`:

- `POSTGRES_HOST=localhost`
- `POSTGRES_PORT=5433`
- `POSTGRES_USER=lifecalling`
- `POSTGRES_DB=lifecalling`

## API local

A API local roda em Docker:

- Container API: `life-system-api-1`
- Porta exposta: `8000`
- Comando: `uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload`

O bind mount do container aponta para:

- Host: `D:\\apps\\lifeservicos\\life-system\\apps\\api`
- Container: `/app`

Ou seja: editar `life-system/apps/api/...` altera diretamente o código que o container usa.

## Frontend local

O frontend local usa:

- Código: `life-system/apps/web`
- URL local: `http://localhost:3000`

Em `life-system/apps/web/.env.local`, o frontend está apontando diretamente para:

- `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`
- `NEXT_PUBLIC_API_URL=http://localhost:8000`

Na prática, em desenvolvimento local desta cópia:

- Browser -> `localhost:3000`
- Frontend chama API em `localhost:8000`
- API usa PostgreSQL em `localhost:5433`

## Proxy do Next

Existe proxy em:

- `life-system/apps/web/src/app/api/[...path]/route.ts`

Esse proxy usa `API_BASE_URL` quando configurado. Porém, como `NEXT_PUBLIC_API_BASE_URL` está definido em `apps/web/.env.local`, o frontend local tende a chamar `http://localhost:8000` diretamente no browser.

## Arquivos de configuração relevantes

- Web local: `life-system/apps/web/.env.local`
- API local: `life-system/apps/api/.env.local`
- Compose local: `life-system/docker-compose.yml`
- Config API: `life-system/apps/api/app/config.py`
- Config DB: `life-system/apps/api/app/db.py`
- Cliente HTTP do frontend: `life-system/apps/web/src/lib/api.ts`

## Regra prática

Se o sistema aberto no navegador for o `life-system` em `localhost:3000`, o padrão é:

1. Alterar frontend em `life-system/apps/web`
2. Alterar backend em `life-system/apps/api`
3. Validar API em `localhost:8000`
4. Validar banco local em `localhost:5433`
