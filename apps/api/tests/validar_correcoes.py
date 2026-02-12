"""
Script para validar correções aplicadas.
"""

import sys
from pathlib import Path

# Adicionar pasta app ao path
api_path = Path(__file__).parent.parent
sys.path.insert(0, str(api_path))

try:
    from sqlalchemy import create_engine, text
    from app.config import settings
except ImportError as e:
    print(f"[ERRO] Não foi possível importar dependências: {e}")
    sys.exit(1)


def main():
    print("=" * 80)
    print("VALIDAÇÃO DAS CORREÇÕES APLICADAS")
    print("=" * 80)
    print()

    # Conectar ao banco
    try:
        db_url = settings.db_uri
        engine = create_engine(db_url)
        conn = engine.connect()
    except Exception as e:
        print(f"[ERRO] Não foi possível conectar ao banco: {e}")
        sys.exit(1)

    try:
        # 1. Verificar índices criados
        print("1. ÍNDICES DE PERFORMANCE")
        print("-" * 80)
        result = conn.execute(text("""
            SELECT
                tablename,
                indexname
            FROM pg_indexes
            WHERE tablename IN ('clients', 'cases')
              AND (indexname LIKE 'idx_client%' OR indexname LIKE 'idx_case_client%')
            ORDER BY tablename, indexname
        """))
        indices = result.fetchall()

        idx_names = {row[1] for row in indices}

        print(f"Índices encontrados: {len(indices)}")
        for row in indices:
            print(f"  [{row[0]}] {row[1]}")

        # Verificar se índices críticos existem
        critical = ['idx_client_name_trgm', 'idx_client_cpf', 'idx_case_client_id']
        missing = [i for i in critical if i not in idx_names]

        if missing:
            print(f"\n[AVISO] Índices faltantes: {', '.join(missing)}")
        else:
            print(f"\n[OK] Todos os índices críticos foram criados!")
        print()

        # 2. Verificar estatísticas gerais após correção
        print("2. ESTATÍSTICAS GERAIS PÓS-CORREÇÃO")
        print("-" * 80)
        result = conn.execute(text("""
            SELECT
                COUNT(*) as total_registros,
                COUNT(CASE WHEN parcelas_pagas IS NULL THEN 1 END) as sem_pago,
                COUNT(CASE WHEN parcelas_pagas = total_parcelas THEN 1 END) as iguais,
                COUNT(CASE WHEN parcelas_pagas < total_parcelas THEN 1 END) as diferentes,
                COUNT(CASE WHEN parcelas_pagas > total_parcelas THEN 1 END) as inconsistentes
            FROM payroll_lines
        """))
        stats = result.fetchone()

        print(f"Total de registros: {stats[0]:,}")
        print(f"Sem PAGO (NULL): {stats[1]:,} ({100*stats[1]/stats[0]:.1f}%)")
        print(f"TOTAL = PAGO: {stats[2]:,} ({100*stats[2]/stats[0]:.1f}%)")
        print(f"PAGO < TOTAL: {stats[3]:,} ({100*stats[3]/stats[0]:.1f}%)")
        print(f"PAGO > TOTAL: {stats[4]:,} ({100*stats[4]/stats[0]:.1f}%)")
        print()

        # 3. Verificar registros suspeitos remanescentes
        print("3. REGISTROS SUSPEITOS REMANESCENTES")
        print("-" * 80)
        result = conn.execute(text("""
            SELECT COUNT(*) as total_suspeitos
            FROM payroll_lines
            WHERE parcelas_pagas = total_parcelas
              AND status_code = '1'
              AND total_parcelas > 12
        """))
        suspeitos = result.scalar()

        print(f"Registros suspeitos ainda com duplicação: {suspeitos}")
        if suspeitos == 0:
            print("[OK] Nenhum registro suspeito remanescente!")
        else:
            print(f"[AVISO] Ainda existem {suspeitos} registros suspeitos")
        print()

        # 4. Verificar tabela de auditoria
        print("4. AUDITORIA DAS CORREÇÕES")
        print("-" * 80)
        result = conn.execute(text("""
            SELECT
                COUNT(*) as total_corrigidos,
                COUNT(DISTINCT cpf) as clientes_afetados,
                MIN(total_parcelas_antes) as min_parcelas,
                MAX(total_parcelas_antes) as max_parcelas
            FROM payroll_lines_correcoes_audit
        """))
        audit = result.fetchone()

        print(f"Total de registros corrigidos: {audit[0]:,}")
        print(f"Clientes afetados: {audit[1]:,}")
        print(f"Parcelas: mín={audit[2]}, máx={audit[3]}")
        print()

        # 5. Amostra de registros corrigidos
        print("5. AMOSTRA DE REGISTROS CORRIGIDOS (últimos 5)")
        print("-" * 80)
        result = conn.execute(text("""
            SELECT
                cpf,
                matricula,
                financiamento_code,
                total_parcelas_antes,
                parcelas_pagas_antes,
                parcelas_pagas_depois,
                corrigido_em
            FROM payroll_lines_correcoes_audit
            ORDER BY id DESC
            LIMIT 5
        """))
        samples = result.fetchall()

        for row in samples:
            print(f"CPF: {row[0]}, Matrícula: {row[1]}, FIN: {row[2]}")
            print(f"  ANTES: Total={row[3]}, Pago={row[4]} (DUPLICADO)")
            print(f"  DEPOIS: Total={row[3]}, Pago={row[5]} (NULL)")
            print(f"  Corrigido em: {row[6]}")
            print()

        # 6. Resumo final
        print("=" * 80)
        print("RESUMO DA VALIDAÇÃO")
        print("=" * 80)
        print()
        print(f"[OK] Índices de performance: {'CRIADOS' if not missing else 'PARCIAIS'}")
        print(f"[OK] Registros corrigidos: {audit[0]:,}")
        print(f"[OK] Registros NULL pós-correção: {stats[1]:,} (antes: 0)")
        print(f"[OK] Duplicações suspeitas remanescentes: {suspeitos}")
        print()

        if missing:
            print("[ATENÇÃO] Alguns índices não foram criados. Execute novamente:")
            print("  python tests/aplicar_indices.py")
            print()

        if suspeitos > 0:
            print(f"[ATENÇÃO] Ainda existem {suspeitos} registros suspeitos.")
            print("Considere investigar manualmente ou executar correção novamente.")
            print()

        print("=" * 80)
        print("VALIDAÇÃO CONCLUÍDA!")
        print("=" * 80)

    except Exception as e:
        print(f"[ERRO] Erro durante validação: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
