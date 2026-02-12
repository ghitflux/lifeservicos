-- ========================================================================
-- CORREÇÃO OPÇÃO 1 (CONSERVADORA - RECOMENDADA)
-- Marca apenas registros SUSPEITOS como NULL para revisão manual
-- ========================================================================
-- ATENÇÃO: FAÇA BACKUP DO BANCO ANTES DE EXECUTAR!
--
-- Backup: pg_dump -h localhost -U postgres lifecalling > backup_antes_correcao.sql
--
-- Como executar:
--   psql -h localhost -U postgres -d lifecalling -f corrigir_dados_historicos_opcao1.sql
--
-- ========================================================================

\echo '========================================================================'
\echo 'CORREÇÃO OPÇÃO 1: Marcar registros SUSPEITOS como NULL'
\echo '========================================================================'
\echo ''

BEGIN;

\echo 'Criando tabela de auditoria...'

-- Criar tabela de auditoria para rastrear correções
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

-- Preview dos registros que serão corrigidos
SELECT
    COUNT(*) as total_a_corrigir,
    COUNT(DISTINCT cpf) as clientes_afetados,
    SUM(CASE WHEN total_parcelas > 24 THEN 1 ELSE 0 END) as com_mais_24_parcelas,
    SUM(CASE WHEN total_parcelas BETWEEN 13 AND 24 THEN 1 ELSE 0 END) as com_13_24_parcelas
FROM payroll_lines
WHERE parcelas_pagas = total_parcelas
  AND status_code = '1'
  AND total_parcelas > 12
  AND created_at < CURRENT_DATE;

\echo ''
\echo 'Inserindo registros na tabela de auditoria...'

-- Inserir na tabela de auditoria ANTES de corrigir
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
    'Duplicação suspeita - total > 12 meses e status = 1 (Lançado e Efetivado)' as motivo_correcao
FROM payroll_lines
WHERE parcelas_pagas = total_parcelas
  AND status_code = '1'
  AND total_parcelas > 12
  AND created_at < CURRENT_DATE;

\echo ''
\echo 'Aplicando correção: Marcando parcelas_pagas como NULL...'

-- Aplicar correção
UPDATE payroll_lines
SET parcelas_pagas = NULL
WHERE parcelas_pagas = total_parcelas
  AND status_code = '1'
  AND total_parcelas > 12
  AND created_at < CURRENT_DATE;

\echo ''
\echo 'Correção aplicada! Estatísticas:'

-- Estatísticas após correção
SELECT
    COUNT(*) as total_corrigidos,
    COUNT(DISTINCT cpf) as clientes_afetados,
    MIN(total_parcelas_antes) as min_parcelas,
    MAX(total_parcelas_antes) as max_parcelas,
    AVG(total_parcelas_antes)::INTEGER as media_parcelas
FROM payroll_lines_correcoes_audit
WHERE corrigido_em >= NOW() - INTERVAL '1 minute';

\echo ''
\echo 'Amostra de registros corrigidos (últimos 10):'
SELECT
    cpf,
    matricula,
    financiamento_code,
    total_parcelas_antes as total,
    parcelas_pagas_antes as pago_antes,
    parcelas_pagas_depois as pago_depois,
    corrigido_em
FROM payroll_lines_correcoes_audit
WHERE corrigido_em >= NOW() - INTERVAL '1 minute'
ORDER BY id DESC
LIMIT 10;

\echo ''
\echo '========================================================================'
\echo 'COMMIT OU ROLLBACK?'
\echo '========================================================================'
\echo ''
\echo 'Revise os resultados acima.'
\echo ''
\echo 'Para CONFIRMAR a correção, execute:'
\echo '  COMMIT;'
\echo ''
\echo 'Para CANCELAR a correção, execute:'
\echo '  ROLLBACK;'
\echo ''
\echo '========================================================================'

-- Aguardar decisão do usuário
-- Descomentar para commit automático: COMMIT;
