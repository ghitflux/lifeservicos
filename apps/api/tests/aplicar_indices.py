"""
Script para aplicar índices de performance diretamente no PostgreSQL.
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
    print("APLICAÇÃO DE ÍNDICES DE PERFORMANCE - BUSCA POR NOME E CPF")
    print("=" * 80)
    print()

    # Obter URL do banco
    try:
        db_url = settings.db_uri
        print(f"[OK] URL do banco obtida")
        print()
    except Exception as e:
        print(f"[ERRO] Não foi possível obter configuração do banco: {e}")
        sys.exit(1)

    # Conectar ao banco com SQLAlchemy
    try:
        # Para CREATE INDEX CONCURRENTLY, precisamos de isolation_level AUTOCOMMIT
        engine = create_engine(
            db_url,
            isolation_level="AUTOCOMMIT"
        )
        conn = engine.connect()
        print(f"[OK] Conectado ao banco")
        print()
    except Exception as e:
        print(f"[ERRO] Não foi possível conectar ao banco: {e}")
        sys.exit(1)

    try:
        # 1. Verificar índices existentes
        print("Verificando índices existentes...")
        print("-" * 80)
        result = conn.execute(text("""
            SELECT schemaname, tablename, indexname
            FROM pg_indexes
            WHERE tablename IN ('clients', 'cases')
              AND (indexname LIKE 'idx_client%' OR indexname LIKE 'idx_case_client%')
            ORDER BY tablename, indexname
        """))
        existing = result.fetchall()
        if existing:
            for row in existing:
                print(f"  {row[1]}.{row[2]}")
        else:
            print("  Nenhum índice encontrado")
        print()

        # 2. Criar extensão pg_trgm
        print("Criando extensão pg_trgm (se não existir)...")
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
        print("[OK] Extensão pg_trgm pronta")
        print()

        # 3. Criar índices
        indices = [
            {
                'name': 'idx_client_name_trgm',
                'sql': 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_client_name_trgm ON clients USING GIN (name gin_trgm_ops)',
                'desc': 'GIN trigram em clients.name (otimiza ILIKE "%nome%")'
            },
            {
                'name': 'idx_client_cpf',
                'sql': 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_client_cpf ON clients (cpf)',
                'desc': 'B-tree em clients.cpf (otimiza busca por CPF)'
            },
            {
                'name': 'idx_case_client_id',
                'sql': 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_case_client_id ON cases (client_id)',
                'desc': 'B-tree em cases.client_id (otimiza JOIN)'
            }
        ]

        for idx in indices:
            print(f"Criando índice: {idx['name']}")
            print(f"  Descrição: {idx['desc']}")
            try:
                conn.execute(text(idx['sql']))
                print(f"  [OK] {idx['name']} criado com sucesso")
            except Exception as e:
                if 'already exists' in str(e).lower() or 'duplicate' in str(e).lower():
                    print(f"  [INFO] {idx['name']} já existe")
                else:
                    print(f"  [ERRO] Falha ao criar {idx['name']}: {e}")
            print()

        # 4. Atualizar estatísticas
        print("Atualizando estatísticas das tabelas...")
        conn.execute(text("ANALYZE clients"))
        conn.execute(text("ANALYZE cases"))
        print("[OK] Estatísticas atualizadas")
        print()

        # 5. Verificar índices criados
        print("=" * 80)
        print("ÍNDICES CRIADOS COM SUCESSO!")
        print("=" * 80)
        print()
        print("Verificando índices e tamanhos:")
        print("-" * 80)
        result = conn.execute(text("""
            SELECT
                tablename,
                indexname,
                pg_size_pretty(pg_relation_size(indexrelid)) as index_size
            FROM pg_stat_user_indexes
            WHERE tablename IN ('clients', 'cases')
              AND (indexname LIKE 'idx_client%' OR indexname LIKE 'idx_case_client%')
            ORDER BY tablename, indexname
        """))
        indices_info = result.fetchall()
        for row in indices_info:
            print(f"  {row[0]}.{row[1]}: {row[2]}")
        print()

        print("=" * 80)
        print("PRÓXIMOS PASSOS")
        print("=" * 80)
        print()
        print("1. Testar performance de busca:")
        print("   python tests/test_search_performance_python.py")
        print()
        print("2. Testar no frontend:")
        print("   - Buscar por nome: 'Silva'")
        print("   - Buscar por CPF: '123'")
        print("   - Verificar tempo de resposta < 500ms")
        print()

    except Exception as e:
        print(f"[ERRO] Erro durante execução: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
