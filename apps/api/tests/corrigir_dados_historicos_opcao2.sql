-- ========================================================================
-- CORREÇÃO OPÇÃO 2 (AGRESSIVA - USAR COM CUIDADO)
-- Marca TODOS os registros com total = pago como NULL
-- ========================================================================
-- ATENÇÃO: Esta opção é AGRESSIVA e pode corrigir dados legítimos!
-- Use apenas se tiver certeza de que a maioria dos casos é duplicação.
--
-- BACKUP OBRIGATÓRIO: pg_dump -h localhost -U postgres lifecalling > backup_antes_correcao.sql
--
-- Como executar:
--   psql -h localhost -U postgres -d lifecalling -f corrigir_dados_historicos_opcao2.sql
--
-- ========================================================================

\echo '========================================================================'
\echo 'CORREÇÃO OPÇÃO 2: Marcar TODOS total = pago como NULL'
\echo '========================================================================'
\echo ''
\echo 'ATENÇÃO: Esta opção é AGRESSIVA!'
\echo 'Vai marcar como NULL mesmo casos que podem ser legítimos.'
\echo ''

BEGIN;

\echo 'Criando tabela de auditoria (se não existir)...'

CREATE TABLE IF NOT EXISTS payroll_lines_correcoes_audit (
    id SERIAL PRIMARY KEY,
    payroll_line_id INTEGER NOT NULL,
    cpf VARCHAR(14),
    matricula VARCHAR(32),
    financiamento_code VARCHAR(16),
    total_parcelas_antes INTEGER,
    parcelas_pagas_antes INTEGER,
    parcelas_pagas_depois INTEGER,
    motivo_correcao VARCHAR(255),
    corrigido_em TIMESTAMP DEFAULT NOW()
);

\echo ''
\echo 'Registros que serão corrigidos (PREVIEW):'

SELECT
    COUNT(*) as total_a_corrigir,
    COUNT(DISTINCT cpf) as clientes_afetados,
    SUM(CASE WHEN total_parcelas <= 12 THEN 1 ELSE 0 END) as potencialmente_legitimos,
    SUM(CASE WHEN total_parcelas > 12 THEN 1 ELSE 0 END) as provavelmente_suspeitos
FROM payroll_lines
WHERE parcelas_pagas = total_parcelas
  AND parcelas_pagas IS NOT NULL
  AND created_at < CURRENT_DATE;

\echo ''
\echo 'AVISO: Vai corrigir até casos com total_parcelas <= 12'
\echo '       que podem ser financiamentos totalmente pagos legítimos!'
\echo ''
\echo 'Inserindo na auditoria...'

INSERT INTO payroll_lines_correcoes_audit (
    payroll_line_id,
    cpf,
    matricula,
    financiamento_code,
    total_parcelas_antes,
    parcelas_pagas_antes,
    parcelas_pagas_depois,
    motivo_correcao
)
SELECT
    id,
    cpf,
    matricula,
    financiamento_code,
    total_parcelas,
    parcelas_pagas,
    NULL as parcelas_pagas_depois,
    'Correção em massa - total = pago (pode incluir casos legítimos)' as motivo_correcao
FROM payroll_lines
WHERE parcelas_pagas = total_parcelas
  AND parcelas_pagas IS NOT NULL
  AND created_at < CURRENT_DATE;

\echo ''
\echo 'Aplicando correção...'

UPDATE payroll_lines
SET parcelas_pagas = NULL
WHERE parcelas_pagas = total_parcelas
  AND parcelas_pagas IS NOT NULL
  AND created_at < CURRENT_DATE;

\echo ''
\echo 'Estatísticas:'

SELECT
    COUNT(*) as total_corrigidos,
    COUNT(DISTINCT cpf) as clientes_afetados
FROM payroll_lines_correcoes_audit
WHERE corrigido_em >= NOW() - INTERVAL '1 minute';

\echo ''
\echo '========================================================================'
\echo 'ATENÇÃO: REVISE OS RESULTADOS!'
\echo '========================================================================'
\echo ''
\echo 'Para CONFIRMAR: COMMIT;'
\echo 'Para CANCELAR: ROLLBACK;'
\echo ''
\echo '========================================================================'
