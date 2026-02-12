-- ========================================================================
-- APLICAÇÃO MANUAL DOS ÍNDICES DE PERFORMANCE
-- ========================================================================
-- Execute este script diretamente no PostgreSQL para criar os índices
-- sem usar Alembic (evita problema de transação)
--
-- Como executar:
--   psql -h localhost -U postgres -d lifecalling -f aplicar_indices_manual.sql
--
-- Tempo estimado: 20-50 segundos (CONCURRENTLY não bloqueia tabelas)
-- ========================================================================

\echo '========================================================================'
\echo 'APLICAÇÃO DE ÍNDICES DE PERFORMANCE - BUSCA POR NOME E CPF'
\echo '========================================================================'
\echo ''

\echo 'Verificando índices existentes...'
\echo '------------------------------------------------------------------------'
SELECT
    schemaname,
    tablename,
    indexname
FROM pg_indexes
WHERE tablename IN ('clients', 'cases')
  AND indexname LIKE 'idx_client%' OR indexname LIKE 'idx_case_client%'
ORDER BY tablename, indexname;

\echo ''
\echo 'Criando extensão pg_trgm (se não existir)...'
CREATE EXTENSION IF NOT EXISTS pg_trgm;

\echo ''
\echo 'Criando índice GIN trigram em clients.name...'
\echo '(Otimiza buscas ILIKE "%nome%")'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_client_name_trgm
ON clients USING GIN (name gin_trgm_ops);

\echo ''
\echo 'Criando índice B-tree em clients.cpf...'
\echo '(Otimiza buscas por CPF)'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_client_cpf
ON clients (cpf);

\echo ''
\echo 'Criando índice B-tree em cases.client_id...'
\echo '(Otimiza JOIN cases -> clients)'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_case_client_id
ON cases (client_id);

\echo ''
\echo 'Atualizando estatísticas das tabelas...'
ANALYZE clients;
ANALYZE cases;

\echo ''
\echo '========================================================================'
\echo 'ÍNDICES CRIADOS COM SUCESSO!'
\echo '========================================================================'
\echo ''

\echo 'Verificando índices criados:'
\echo '------------------------------------------------------------------------'
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE tablename IN ('clients', 'cases')
  AND (indexname LIKE 'idx_client%' OR indexname LIKE 'idx_case_client%')
ORDER BY tablename, indexname;

\echo ''
\echo '========================================================================'
\echo 'PRÓXIMOS PASSOS'
\echo '========================================================================'
\echo ''
\echo '1. Testar performance de busca:'
\echo '   psql -h localhost -U postgres -d lifecalling -f test_search_performance.sql'
\echo ''
\echo '2. Testar no frontend:'
\echo '   - Buscar por nome: "Silva"'
\echo '   - Buscar por CPF: "123"'
\echo '   - Verificar tempo de resposta < 500ms'
\echo ''
\echo '3. Monitorar uso dos índices:'
\echo '   SELECT indexname, idx_scan FROM pg_stat_user_indexes'
\echo '   WHERE tablename IN (''clients'', ''cases'');'
\echo ''
\echo '========================================================================'
