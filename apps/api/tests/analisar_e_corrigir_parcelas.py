"""
Script para analisar e corrigir dados históricos de parcelas duplicadas.

Uso:
    # Apenas análise (não faz correção)
    python analisar_e_corrigir_parcelas.py --analise

    # Correção conservadora (recomendada)
    python analisar_e_corrigir_parcelas.py --corrigir --opcao=1

    # Correção agressiva (cuidado!)
    python analisar_e_corrigir_parcelas.py --corrigir --opcao=2 --confirmar
"""

import sys
import argparse
from datetime import datetime
from pathlib import Path

# Adicionar pasta app ao path
api_path = Path(__file__).parent.parent
sys.path.insert(0, str(api_path))

# Importar configuração do banco
try:
    from sqlalchemy import create_engine, text
    from app.config import settings
except ImportError:
    print("[ERRO] Não foi possível importar dependências.")
    print("Certifique-se de estar no ambiente virtual correto.")
    sys.exit(1)


def analisar_dados(engine):
    """Analisa os dados existentes e exibe estatísticas."""
    print("=" * 80)
    print("ANÁLISE DE DADOS HISTÓRICOS - DUPLICAÇÃO DE PARCELAS")
    print("=" * 80)
    print()

    with engine.connect() as conn:
        # Estatísticas gerais
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

        print("ESTATÍSTICAS GERAIS:")
        print(f"  Total de registros: {stats[0]:,}")
        print(f"  Sem PAGO (NULL): {stats[1]:,} ({100*stats[1]/stats[0]:.1f}%)")
        print(f"  TOTAL = PAGO: {stats[2]:,} ({100*stats[2]/stats[0]:.1f}%)")
        print(f"  PAGO < TOTAL: {stats[3]:,} ({100*stats[3]/stats[0]:.1f}%)")
        print(f"  PAGO > TOTAL: {stats[4]:,} ({100*stats[4]/stats[0]:.1f}%)")
        print()

        # Registros suspeitos
        result = conn.execute(text("""
            SELECT
                COUNT(*) as total_suspeitos,
                COUNT(DISTINCT cpf) as clientes_afetados
            FROM payroll_lines
            WHERE parcelas_pagas = total_parcelas
              AND status_code = '1'
              AND total_parcelas > 12
              AND created_at < CURRENT_DATE
        """))
        suspeitos = result.fetchone()

        print("REGISTROS SUSPEITOS (provável duplicação incorreta):")
        print(f"  Critério: total = pago, status = 1, total > 12 meses")
        print(f"  Total: {suspeitos[0]:,}")
        print(f"  Clientes afetados: {suspeitos[1]:,}")
        print()

        # Registros legítimos
        result = conn.execute(text("""
            SELECT
                COUNT(*) as total_legitimos,
                COUNT(DISTINCT cpf) as clientes_afetados
            FROM payroll_lines
            WHERE parcelas_pagas = total_parcelas
              AND (total_parcelas <= 12 OR status_code != '1')
        """))
        legitimos = result.fetchone()

        print("REGISTROS LEGÍTIMOS (provavelmente totalmente pagos):")
        print(f"  Critério: total = pago, total <= 12 meses OU status != 1")
        print(f"  Total: {legitimos[0]:,}")
        print(f"  Clientes afetados: {legitimos[1]:,}")
        print()

        # Amostra de suspeitos
        result = conn.execute(text("""
            SELECT
                cpf,
                matricula,
                financiamento_code,
                total_parcelas,
                parcelas_pagas,
                entity_name,
                status_description
            FROM payroll_lines
            WHERE parcelas_pagas = total_parcelas
              AND status_code = '1'
              AND total_parcelas > 12
            ORDER BY total_parcelas DESC
            LIMIT 5
        """))

        print("AMOSTRA DE REGISTROS SUSPEITOS (5 primeiros):")
        for row in result:
            print(f"  CPF: {row[0]}, Matrícula: {row[1]}, FIN: {row[2]}")
            print(f"    Total: {row[3]}, Pago: {row[4]} (DUPLICADO)")
            print(f"    Banco: {row[5]}")
            print(f"    Status: {row[6]}")
            print()


def corrigir_opcao1(engine, dry_run=True):
    """Correção conservadora: apenas registros suspeitos."""
    print("=" * 80)
    print("CORREÇÃO OPÇÃO 1: Marcar registros SUSPEITOS como NULL")
    print("=" * 80)
    print()

    if dry_run:
        print("[DRY RUN] Nenhuma alteração será feita no banco.")
        print()

    with engine.begin() as conn:
        # Criar tabela de auditoria
        conn.execute(text("""
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
            )
        """))

        # Contar registros a serem corrigidos
        result = conn.execute(text("""
            SELECT COUNT(*) FROM payroll_lines
            WHERE parcelas_pagas = total_parcelas
              AND status_code = '1'
              AND total_parcelas > 12
              AND created_at < CURRENT_DATE
        """))
        total = result.scalar()

        print(f"Registros a serem corrigidos: {total:,}")
        print()

        if total == 0:
            print("Nenhum registro encontrado para correção.")
            return

        if dry_run:
            print("[DRY RUN] Simulação concluída. Nenhuma alteração foi feita.")
            print()
            print("Para aplicar a correção, execute:")
            print("  python analisar_e_corrigir_parcelas.py --corrigir --opcao=1 --confirmar")
            return

        # Inserir na auditoria
        conn.execute(text("""
            INSERT INTO payroll_lines_correcoes_audit (
                payroll_line_id, cpf, matricula, financiamento_code,
                total_parcelas_antes, parcelas_pagas_antes, parcelas_pagas_depois,
                motivo_correcao
            )
            SELECT
                id, cpf, matricula, financiamento_code,
                total_parcelas, parcelas_pagas, NULL,
                'Duplicação suspeita - correção automática opção 1'
            FROM payroll_lines
            WHERE parcelas_pagas = total_parcelas
              AND status_code = '1'
              AND total_parcelas > 12
              AND created_at < CURRENT_DATE
        """))

        # Aplicar correção
        result = conn.execute(text("""
            UPDATE payroll_lines
            SET parcelas_pagas = NULL
            WHERE parcelas_pagas = total_parcelas
              AND status_code = '1'
              AND total_parcelas > 12
              AND created_at < CURRENT_DATE
        """))

        print(f"[SUCESSO] {result.rowcount:,} registros corrigidos!")
        print(f"Timestamp: {datetime.now()}")
        print()
        print("Auditoria salva em: payroll_lines_correcoes_audit")


def main():
    parser = argparse.ArgumentParser(
        description="Analisar e corrigir dados históricos de parcelas duplicadas"
    )
    parser.add_argument(
        "--analise",
        action="store_true",
        help="Apenas analisar dados (não corrige)"
    )
    parser.add_argument(
        "--corrigir",
        action="store_true",
        help="Aplicar correção"
    )
    parser.add_argument(
        "--opcao",
        type=int,
        choices=[1, 2],
        help="Opção de correção (1=conservadora, 2=agressiva)"
    )
    parser.add_argument(
        "--confirmar",
        action="store_true",
        help="Confirmar correção (sem este flag, faz apenas dry-run)"
    )

    args = parser.parse_args()

    # Validações
    if not args.analise and not args.corrigir:
        parser.print_help()
        print()
        print("[ERRO] Especifique --analise ou --corrigir")
        sys.exit(1)

    if args.corrigir and not args.opcao:
        print("[ERRO] Especifique --opcao=1 ou --opcao=2")
        sys.exit(1)

    # Conectar ao banco
    try:
        db_url = settings.db_uri
        engine = create_engine(db_url)
    except Exception as e:
        print(f"[ERRO] Não foi possível conectar ao banco: {e}")
        sys.exit(1)

    # Executar ação
    if args.analise:
        analisar_dados(engine)
    elif args.corrigir:
        if args.opcao == 1:
            corrigir_opcao1(engine, dry_run=not args.confirmar)
        elif args.opcao == 2:
            print("[AVISO] Opção 2 não implementada neste script.")
            print("Use o arquivo SQL: corrigir_dados_historicos_opcao2.sql")
            sys.exit(1)


if __name__ == "__main__":
    main()
