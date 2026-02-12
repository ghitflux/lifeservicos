"""add client search performance indexes

Revision ID: client_search_perf_001
Revises: esteira_perf_001
Create Date: 2025-01-24 12:00:00.000000

Otimiza buscas por nome e CPF no módulo de atendimento.

Índices adicionados:
- idx_client_name_trgm: Acelera buscas ILIKE '%nome%' (GIN trigram)
- idx_client_cpf: Acelera buscas por CPF (B-tree)
- idx_case_client_id: Acelera JOIN cases -> clients (B-tree FK)
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'client_search_perf_001'
down_revision = '2e60ba3b87ac'  # add_analysis_fields_to_mobile_simulations
branch_labels = None
depends_on = None


def upgrade():
    """
    Adiciona índices para otimizar buscas por nome e CPF de clientes.

    NOTA: Em desenvolvimento, cria índices normalmente (sem CONCURRENTLY).
    Para produção, use o script SQL: apply_indexes_production.sql
    """

    # 1. Habilitar extensão pg_trgm (se ainda não estiver habilitada)
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    # 2. Índice GIN trigram para busca por nome (ILIKE '%nome%')
    op.create_index(
        'idx_client_name_trgm',
        'clients',
        ['name'],
        unique=False,
        postgresql_using='gin',
        postgresql_ops={'name': 'gin_trgm_ops'}
    )

    # 3. Índice B-tree para busca por CPF
    op.create_index('idx_client_cpf', 'clients', ['cpf'], unique=False)

    # 4. Índice B-tree para foreign key cases.client_id
    op.create_index('idx_case_client_id', 'cases', ['client_id'], unique=False)

    # 5. Atualizar estatísticas das tabelas (otimizador de query)
    op.execute("ANALYZE clients")
    op.execute("ANALYZE cases")


def downgrade():
    """Remove os índices criados."""

    # Remover índices em ordem reversa
    op.drop_index('idx_case_client_id', table_name='cases')
    op.drop_index('idx_client_cpf', table_name='clients')
    op.drop_index('idx_client_name_trgm', table_name='clients')

    # Nota: Não removemos pg_trgm extension pois pode ser usada por outros índices
