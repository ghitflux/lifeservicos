-- ========================================================================
-- SCRIPT DE CORREÇÃO DE DADOS HISTÓRICOS
-- Problema: Parcelas duplicadas incorretamente (total_parcelas = parcelas_pagas)
-- ========================================================================
-- ATENÇÃO: FAÇA BACKUP DO BANCO ANTES DE EXECUTAR QUALQUER CORREÇÃO!
--
-- Como executar:
--   psql -h localhost -U postgres -d lifecalling -f corrigir_dados_historicos.sql
--
-- ========================================================================

\echo '========================================================================'
\echo 'ANÁLISE DE DADOS HISTÓRICOS - DUPLICAÇÃO DE PARCELAS'
\echo '========================================================================'
\echo ''

-- ========================================================================
-- ETAPA 1: ANÁLISE DOS DADOS EXISTENTES
-- ========================================================================

\echo 'ETAPA 1: Analisando dados existentes...'
\echo '------------------------------------------------------------------------'

-- Estatísticas gerais
SELECT
    COUNT(*) as total_registros,
    COUNT(CASE WHEN parcelas_pagas IS NULL THEN 1 END) as sem_pago,
    COUNT(CASE WHEN parcelas_pagas = total_parcelas THEN 1 END) as iguais,
    COUNT(CASE WHEN parcelas_pagas < total_parcelas THEN 1 END) as diferentes,
    COUNT(CASE WHEN parcelas_pagas > total_parcelas THEN 1 END) as inconsistentes
FROM payroll_lines;

\echo ''
\echo 'Distribuição por status:'
SELECT
    status_code,
    status_description,
    COUNT(*) as quantidade,
    COUNT(CASE WHEN parcelas_pagas = total_parcelas THEN 1 END) as com_duplicacao_potencial,
    ROUND(100.0 * COUNT(CASE WHEN parcelas_pagas = total_parcelas THEN 1 END) / COUNT(*), 2) as percentual_duplicacao
FROM payroll_lines
GROUP BY status_code, status_description
ORDER BY quantidade DESC;

\echo ''
\echo '------------------------------------------------------------------------'
\echo 'ETAPA 2: Identificando duplicações SUSPEITAS...'
\echo '------------------------------------------------------------------------'

-- Critérios para considerar duplicação SUSPEITA (não legítima):
-- 1. total_parcelas = parcelas_pagas
-- 2. Status = "1" (Lançado e Efetivado) - esperamos que esteja em andamento
-- 3. total_parcelas > 12 (mais de 1 ano) - improvável que esteja totalmente pago
-- 4. Criado antes da correção (antes de hoje)

\echo ''
\echo 'Registros SUSPEITOS de duplicação incorreta:'
SELECT
    COUNT(*) as total_suspeitos,
    COUNT(DISTINCT cpf) as clientes_afetados,
    COUNT(DISTINCT entity_name) as bancos_afetados
FROM payroll_lines
WHERE parcelas_pagas = total_parcelas
  AND status_code = '1'  -- Lançado e Efetivado
  AND total_parcelas > 12  -- Mais de 1 ano
  AND created_at < CURRENT_DATE;

\echo ''
\echo 'Amostra de 10 registros SUSPEITOS:'
SELECT
    id,
    cpf,
    matricula,
    financiamento_code,
    total_parcelas,
    parcelas_pagas,
    valor_parcela_ref,
    entity_name,
    status_description,
    ref_month || '/' || ref_year as referencia
FROM payroll_lines
WHERE parcelas_pagas = total_parcelas
  AND status_code = '1'
  AND total_parcelas > 12
  AND created_at < CURRENT_DATE
ORDER BY total_parcelas DESC
LIMIT 10;

\echo ''
\echo '------------------------------------------------------------------------'
\echo 'ETAPA 3: Identificando duplicações LEGÍTIMAS...'
\echo '------------------------------------------------------------------------'

-- Critérios para considerar duplicação LEGÍTIMA (totalmente pago):
-- 1. total_parcelas = parcelas_pagas
-- 2. total_parcelas <= 12 (financiamento curto - mais provável estar pago)
-- OU Status != "1" (outros status podem ter PAGO = TOTAL legitimamente)

\echo ''
\echo 'Registros LEGÍTIMOS (provavelmente totalmente pagos):'
SELECT
    COUNT(*) as total_legitimos,
    COUNT(DISTINCT cpf) as clientes_afetados
FROM payroll_lines
WHERE parcelas_pagas = total_parcelas
  AND (
    total_parcelas <= 12  -- Financiamento curto
    OR status_code != '1'  -- Outros status
  );

\echo ''
\echo 'Distribuição de legítimos por total de parcelas:'
SELECT
    total_parcelas,
    COUNT(*) as quantidade
FROM payroll_lines
WHERE parcelas_pagas = total_parcelas
  AND total_parcelas <= 12
GROUP BY total_parcelas
ORDER BY total_parcelas;

\echo ''
\echo '========================================================================'
\echo 'RESUMO DA ANÁLISE'
\echo '========================================================================'
\echo ''
\echo 'Os registros foram categorizados em:'
\echo ''
\echo '1. SUSPEITOS (provável duplicação incorreta):'
\echo '   - total_parcelas = parcelas_pagas'
\echo '   - Status = "1" (Lançado e Efetivado)'
\echo '   - total_parcelas > 12 meses'
\echo '   - Importados antes de hoje'
\echo ''
\echo '2. LEGÍTIMOS (provavelmente totalmente pagos):'
\echo '   - total_parcelas = parcelas_pagas'
\echo '   - total_parcelas <= 12 meses OU status != "1"'
\echo ''
\echo '========================================================================'
\echo 'OPÇÕES DE CORREÇÃO'
\echo '========================================================================'
\echo ''
\echo 'Opção 1 (CONSERVADORA - RECOMENDADA):'
\echo '  Marcar registros SUSPEITOS como NULL para revisão manual'
\echo '  Execute: corrigir_dados_historicos_opcao1.sql'
\echo ''
\echo 'Opção 2 (AGRESSIVA - USAR COM CUIDADO):'
\echo '  Marcar TODOS os registros com duplicação como NULL'
\echo '  Execute: corrigir_dados_historicos_opcao2.sql'
\echo ''
\echo 'Opção 3 (MANUAL):'
\echo '  Revisar casos específicos e corrigir individualmente'
\echo '  Use as queries acima para identificar casos'
\echo ''
\echo '========================================================================'
\echo 'ANÁLISE CONCLUÍDA'
\echo '========================================================================'
