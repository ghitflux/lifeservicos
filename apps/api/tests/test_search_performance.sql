-- ========================================================================
-- TESTE DE PERFORMANCE - BUSCA POR NOME E CPF
-- ========================================================================
-- Execute este script ANTES e DEPOIS da migration para comparar
--
-- Como executar:
--   psql -h localhost -U postgres -d lifecalling -f test_search_performance.sql
--
-- ========================================================================

\echo '========================================================================'
\echo 'TESTE DE PERFORMANCE - BUSCA DE CLIENTES'
\echo '========================================================================'
\echo ''

-- Configurar ambiente
SET work_mem = '16MB';
SET random_page_cost = 1.1;

-- Limpar cache de queries
DISCARD PLANS;

\echo 'TESTE 1: Busca por nome parcial (cenário mais crítico)'
\echo '------------------------------------------------------------------------'
EXPLAIN (ANALYZE, BUFFERS, TIMING)
SELECT c.id, c.status, c.created_at, cl.name, cl.cpf
FROM cases c
JOIN clients cl ON cl.id = c.client_id
WHERE cl.name ILIKE '%Silva%'
ORDER BY c.created_at DESC
LIMIT 20;

\echo ''
\echo 'TESTE 2: Busca por CPF parcial'
\echo '------------------------------------------------------------------------'
EXPLAIN (ANALYZE, BUFFERS, TIMING)
SELECT c.id, c.status, c.created_at, cl.name, cl.cpf
FROM cases c
JOIN clients cl ON cl.id = c.client_id
WHERE cl.cpf ILIKE '%123%'
ORDER BY c.created_at DESC
LIMIT 20;

\echo ''
\echo 'TESTE 3: Busca combinada (nome OU CPF)'
\echo '------------------------------------------------------------------------'
EXPLAIN (ANALYZE, BUFFERS, TIMING)
SELECT c.id, c.status, c.created_at, cl.name, cl.cpf
FROM cases c
JOIN clients cl ON cl.id = c.client_id
WHERE (cl.name ILIKE '%João%' OR cl.cpf ILIKE '%456%')
ORDER BY c.created_at DESC
LIMIT 20;

\echo ''
\echo 'TESTE 4: JOIN sem filtro (baseline para JOIN performance)'
\echo '------------------------------------------------------------------------'
EXPLAIN (ANALYZE, BUFFERS, TIMING)
SELECT c.id, c.status, c.created_at, cl.name, cl.cpf
FROM cases c
JOIN clients cl ON cl.id = c.client_id
WHERE c.status = 'novo'
ORDER BY c.created_at DESC
LIMIT 20;

\echo ''
\echo '========================================================================'
\echo 'ESTATÍSTICAS DE ÍNDICES'
\echo '========================================================================'
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan as scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE tablename IN ('clients', 'cases')
ORDER BY tablename, indexname;

\echo ''
\echo '========================================================================'
\echo 'TAMANHO DOS ÍNDICES'
\echo '========================================================================'
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE tablename IN ('clients', 'cases')
ORDER BY pg_relation_size(indexrelid) DESC;

\echo ''
\echo '========================================================================'
\echo 'CACHE HIT RATIO (deve ser > 95%)'
\echo '========================================================================'
SELECT
    schemaname,
    tablename,
    indexname,
    idx_blks_read as disk_reads,
    idx_blks_hit as cache_hits,
    CASE
        WHEN (idx_blks_read + idx_blks_hit) = 0 THEN 0
        ELSE round(100.0 * idx_blks_hit / (idx_blks_read + idx_blks_hit), 2)
    END as cache_hit_ratio
FROM pg_statio_user_indexes
WHERE tablename IN ('clients', 'cases')
ORDER BY cache_hit_ratio ASC;

\echo ''
\echo '========================================================================'
\echo 'TESTE CONCLUÍDO'
\echo '========================================================================'
\echo ''
\echo 'INTERPRETAÇÃO DOS RESULTADOS:'
\echo ''
\echo 'ANTES da migration (sem índices):'
\echo '  - Deve mostrar "Seq Scan on clients" (sequential scan - lento)'
\echo '  - Execution Time: ~2000-5000ms (2-5 segundos)'
\echo '  - Buffers: alto número de shared hit/read'
\echo ''
\echo 'DEPOIS da migration (com índices):'
\echo '  - Deve mostrar "Bitmap Index Scan on idx_client_name_trgm" (rápido)'
\echo '  - Execution Time: ~200-500ms (3-10x mais rápido!)'
\echo '  - Buffers: número muito menor de shared hit/read'
\echo ''
\echo 'GANHO ESPERADO: 3-10x de melhoria de performance'
\echo '========================================================================'
