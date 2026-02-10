import asyncio
from datetime import datetime, timedelta
from pathlib import Path
import sys

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Adicionar pasta app ao path
api_path = Path(__file__).parent.parent
sys.path.insert(0, str(api_path))

from app.db import Base
from app.models import (
    User,
    Client,
    Case,
    Contract,
    CaseEvent,
    FinanceIncome,
    FinanceExpense,
    ExternalClientIncome,
)
from app.routers import finance


class DummyUser:
    def __init__(self, user_id: int):
        self.id = user_id


def _build_test_session(monkeypatch):
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(
        engine,
        tables=[
            User.__table__,
            Client.__table__,
            Case.__table__,
            Contract.__table__,
            CaseEvent.__table__,
            FinanceIncome.__table__,
            FinanceExpense.__table__,
            ExternalClientIncome.__table__,
        ],
    )
    TestSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    monkeypatch.setattr(finance, "SessionLocal", TestSessionLocal)

    async def _noop_broadcast(*args, **kwargs):
        return None

    monkeypatch.setattr(finance.eventbus, "broadcast", _noop_broadcast)
    return TestSessionLocal


def _seed_user_client_case_contract(session):
    user = User(
        id=1,
        name="Financeiro Teste",
        email="financeiro.teste@example.com",
        password_hash="hash",
        role="financeiro",
        active=True,
    )
    client = Client(
        id=1,
        name="Cliente Teste",
        cpf="12345678901",
        matricula="MAT123",
        created_by=1,
    )
    case = Case(
        id=1,
        client_id=1,
        assigned_user_id=1,
        status="contrato_efetivado",
        source="manual",
    )
    contract = Contract(
        id=1,
        case_id=1,
        status="ativo",
        signed_at=datetime.now(),
        created_by=1,
        agent_user_id=1,
    )

    session.add_all([user, client, case, contract])
    session.commit()
    return user, client, case, contract


def test_finance_metrics_uses_new_kpi_rules(monkeypatch):
    TestSessionLocal = _build_test_session(monkeypatch)

    with TestSessionLocal() as session:
        _, _, _, _ = _seed_user_client_case_contract(session)

        now = datetime.now()

        # Receitas consultoria = 1500; receita manual = 200; receita total = 1700
        session.add_all(
            [
                FinanceIncome(
                    date=now,
                    income_type="Consultoria Líquida - Atendente",
                    income_name="Consultoria Líquida 70% - Cliente Teste (Contrato #1)",
                    amount=1000,
                    created_by=1,
                    agent_user_id=1,
                    client_cpf="12345678901",
                    client_name="Cliente Teste",
                ),
                FinanceIncome(
                    date=now,
                    income_type="Consultoria Líquida - Balcão",
                    income_name="Consultoria Líquida 30% - Cliente Teste (Contrato #1)",
                    amount=500,
                    created_by=1,
                    agent_user_id=1,
                    client_cpf="12345678901",
                    client_name="Cliente Teste",
                ),
                FinanceIncome(
                    date=now,
                    income_type="Receita Manual",
                    income_name="Receita avulsa",
                    amount=200,
                    created_by=1,
                    agent_user_id=1,
                    client_cpf="12345678901",
                    client_name="Cliente Teste",
                ),
            ]
        )

        # Despesas não-imposto = 300; despesa imposto = 100 (deve ser ignorada no card Despesas)
        session.add_all(
            [
                FinanceExpense(
                    date=now,
                    month=now.month,
                    year=now.year,
                    expense_type="Operacional",
                    expense_name="Infraestrutura",
                    amount=300,
                    created_by=1,
                    agent_user_id=1,
                    client_cpf="12345678901",
                    client_name="Cliente Teste",
                ),
                FinanceExpense(
                    date=now,
                    month=now.month,
                    year=now.year,
                    expense_type="Impostos",
                    expense_name="Imposto antigo",
                    amount=100,
                    created_by=1,
                    agent_user_id=1,
                    client_cpf="12345678901",
                    client_name="Cliente Teste",
                ),
            ]
        )
        session.commit()

    start_date = (datetime.now() - timedelta(days=1)).date().isoformat()
    end_date = (datetime.now() + timedelta(days=1)).date().isoformat()

    data = finance.finance_metrics(start_date=start_date, end_date=end_date, user=DummyUser(1))

    assert data["totalRevenue"] == 1700.0
    assert data["totalTax"] == 238.0  # 14% da receita total
    assert data["totalExpenses"] == 300.0  # sem impostos cadastrados
    assert data["totalConsultoriaLiq"] == 1200.0  # consultoria(1500) - despesas(300)
    assert data["netProfit"] == 1162.0  # receita(1700) - despesas(300) - impostos(238)


def test_reopen_case_removes_generated_incomes_and_expenses(monkeypatch):
    TestSessionLocal = _build_test_session(monkeypatch)

    with TestSessionLocal() as session:
        _, _, case, contract = _seed_user_client_case_contract(session)

        now = datetime.now()

        # Receitas geradas automaticamente (devem ser removidas)
        income_old = FinanceIncome(
            date=now,
            income_type="Consultoria Líquida",
            income_name="Contrato #1 - Cliente Teste",
            amount=120,
            created_by=1,
            agent_user_id=1,
            client_cpf="12345678901",
            client_name="Cliente Teste",
        )
        income_new = FinanceIncome(
            date=now,
            income_type="Consultoria Líquida - Atendente 1",
            income_name="Consultoria Líquida 70% - Cliente Teste (Contrato #1)",
            amount=80,
            created_by=1,
            agent_user_id=1,
            client_cpf="12345678901",
            client_name="Cliente Teste",
        )
        income_case_ref = FinanceIncome(
            date=now,
            income_type="Consultoria - Balcão",
            income_name="Ajuste consultoria - Caso #1",
            amount=20,
            created_by=1,
            agent_user_id=1,
            client_cpf="12345678901",
            client_name="Cliente Teste",
        )

        # Receita manual (não deve ser removida)
        income_manual = FinanceIncome(
            date=now,
            income_type="Receita Manual",
            income_name="Contrato #1 - Receita manual",
            amount=500,
            created_by=1,
            agent_user_id=1,
            client_cpf="12345678901",
            client_name="Cliente Teste",
        )

        tax_expense = FinanceExpense(
            date=now,
            month=now.month,
            year=now.year,
            expense_type="Impostos",
            expense_name="Imposto sobre consultoria bruta - Contrato #1",
            amount=14,
            created_by=1,
            agent_user_id=1,
            client_cpf="12345678901",
            client_name="Cliente Teste",
        )
        broker_expense = FinanceExpense(
            date=now,
            month=now.month,
            year=now.year,
            expense_type="Comissão",
            expense_name="Comissão Corretor - Fulano (Contrato #1)",
            amount=30,
            created_by=1,
            agent_user_id=1,
            client_cpf="12345678901",
            client_name="Cliente Teste",
        )
        expense_case_ref = FinanceExpense(
            date=now,
            month=now.month,
            year=now.year,
            expense_type="Comissão",
            expense_name="Comissão extra - Caso #1",
            amount=10,
            created_by=1,
            agent_user_id=1,
            client_cpf="12345678901",
            client_name="Cliente Teste",
        )
        unrelated_expense = FinanceExpense(
            date=now,
            month=now.month,
            year=now.year,
            expense_type="Comissão",
            expense_name="Comissão outro contrato #999",
            amount=99,
            created_by=1,
            agent_user_id=1,
            client_cpf="12345678901",
            client_name="Cliente Teste",
        )

        session.add_all(
            [
                income_old,
                income_new,
                income_case_ref,
                income_manual,
                tax_expense,
                broker_expense,
                expense_case_ref,
                unrelated_expense,
            ]
        )
        session.flush()

        contract.imposto_expense_id = tax_expense.id
        contract.corretor_expense_id = broker_expense.id
        contract.status = "ativo"
        case.status = "contrato_efetivado"

        session.commit()

    result = asyncio.run(finance.reopen_case(case_id=1, user=DummyUser(1)))

    assert result["success"] is True
    assert result["new_status"] == "financeiro_pendente"
    assert result["deleted_incomes"] == 3
    assert result["deleted_expenses"] == 3

    with TestSessionLocal() as session:
        case_db = session.get(Case, 1)
        contract_db = session.get(Contract, 1)

        remaining_incomes = session.query(FinanceIncome).all()
        remaining_expenses = session.query(FinanceExpense).all()

        assert case_db.status == "financeiro_pendente"
        assert contract_db.status == "em_revisao"
        assert contract_db.imposto_expense_id is None
        assert contract_db.corretor_expense_id is None

        # Mantém apenas a receita manual
        assert len(remaining_incomes) == 1
        assert remaining_incomes[0].income_type == "Receita Manual"

        # Mantém apenas despesa não relacionada ao contrato/caso
        assert len(remaining_expenses) == 1
        assert "#999" in remaining_expenses[0].expense_name
