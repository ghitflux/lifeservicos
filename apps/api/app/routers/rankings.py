from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy import func, case, or_
from ..db import get_db
from ..rbac import require_roles
from ..models import User, Case, Contract, Client
from datetime import datetime, timedelta, date
import io
import csv
import math

r = APIRouter(prefix="/rankings", tags=["rankings"])


# Util: parse datas
# Retorna: (start_date, end_date_exclusive, prev_start, prev_end_exclusive)
# end_date_exclusive é o dia seguinte (para usar em .between(start, end_exclusive))
def _parse_range(from_: str | None, to: str | None):
    if not from_ or not to:
        # mês atual por padrão
        today = date.today()
        start = today.replace(day=1)
        end_exclusive = today + timedelta(days=1)  # Dia seguinte (para between)
    else:
        start = datetime.fromisoformat(from_.replace("Z", "+00:00")).date()
        end_date = datetime.fromisoformat(to.replace("Z", "+00:00")).date()
        end_exclusive = end_date + timedelta(days=1)  # Dia seguinte (para between incluir todo o dia final)

    # Período anterior para trend - mesma duração
    span = (end_exclusive - start).days or 1
    prev_start = start - timedelta(days=span)
    prev_end_exclusive = start  # Sem +1, pois já temos exclusive

    return start, end_exclusive, prev_start, prev_end_exclusive


# Util: calcular consultoria líquida por usuário
def _calcular_consultoria_liquida_por_usuario(
    db: Session,
    start_date: date | None = None,
    end_date: date | None = None,
    user_id: int | None = None
) -> dict[int, float]:
    """
    Calcula consultoria líquida por usuário diferenciando receitas
    líquidas (novas) das brutas (antigas).

    Lógica:
    - Receitas LÍQUIDAS: Já deduzidas (imposto e comissão) - somar direto
    - Receitas BRUTAS: Precisam dedução - somar e deduzir despesas

    Retorna dict {user_id: valor_liquido}
    """
    from ..models import FinanceIncome, FinanceExpense

    # Query de receitas LÍQUIDAS (JÁ deduzidas - não deduzir novamente)
    receitas_liquidas_q = (
        db.query(
            FinanceIncome.agent_user_id,
            func.coalesce(
                func.sum(FinanceIncome.amount), 0
            ).label("receitas_liquidas")
        )
        .filter(FinanceIncome.agent_user_id.isnot(None))
        .filter(
            (FinanceIncome.income_type.in_([
                "Consultoria Líquida - Atendente",
                "Consultoria Líquida - Atendente 1",
                "Consultoria Líquida - Atendente 2",
                "Consultoria Líquida - Balcão",
                "Consultoria Líquida",
                "Contrato Mobile"
            ])) |
            (FinanceIncome.origin == "mobile")  # ✅ Incluir TODAS as receitas com origin='mobile'
        )
    )

    if user_id:
        receitas_liquidas_q = receitas_liquidas_q.filter(
            FinanceIncome.agent_user_id == user_id
        )

    if start_date and end_date:
        receitas_liquidas_q = receitas_liquidas_q.filter(
            FinanceIncome.date.between(start_date, end_date)
        )

    receitas_liquidas_results = receitas_liquidas_q.group_by(
        FinanceIncome.agent_user_id
    ).all()

    # Query de receitas BRUTAS (precisam dedução de despesas)
    receitas_brutas_q = (
        db.query(
            FinanceIncome.agent_user_id,
            func.coalesce(
                func.sum(FinanceIncome.amount), 0
            ).label("receitas_brutas")
        )
        .filter(FinanceIncome.agent_user_id.isnot(None))
        .filter(FinanceIncome.income_type.in_([
            "Consultoria Bruta - Atendente",
            "Consultoria Bruta - Balcão",
            "Consultoria - Atendente",
            "Consultoria - Balcão"
        ]))
    )

    if user_id:
        receitas_brutas_q = receitas_brutas_q.filter(
            FinanceIncome.agent_user_id == user_id
        )

    if start_date and end_date:
        receitas_brutas_q = receitas_brutas_q.filter(
            FinanceIncome.date.between(start_date, end_date)
        )

    receitas_brutas_results = receitas_brutas_q.group_by(
        FinanceIncome.agent_user_id
    ).all()

    # Query de despesas (apenas para receitas brutas)
    expense_q = (
        db.query(
            FinanceExpense.agent_user_id,
            func.coalesce(
                func.sum(FinanceExpense.amount), 0
            ).label("despesas")
        )
        .filter(FinanceExpense.agent_user_id.isnot(None))
        .filter(FinanceExpense.expense_type.in_(["Impostos", "Comissão"]))
    )

    if user_id:
        expense_q = expense_q.filter(
            FinanceExpense.agent_user_id == user_id
        )

    if start_date and end_date:
        expense_q = expense_q.filter(
            FinanceExpense.date.between(start_date, end_date)
        )

    expense_results = expense_q.group_by(
        FinanceExpense.agent_user_id
    ).all()

    # Construir resultado
    resultado = {}

    # 1. Adicionar receitas LÍQUIDAS (sem dedução)
    for r in receitas_liquidas_results:
        resultado[r.agent_user_id] = float(r.receitas_liquidas or 0)

    # 2. Adicionar receitas BRUTAS - deduzir despesas
    receitas_brutas_map = {
        r.agent_user_id: float(r.receitas_brutas or 0)
        for r in receitas_brutas_results
    }
    despesas_map = {
        r.agent_user_id: float(r.despesas or 0)
        for r in expense_results
    }

    for user_id_bruta, receita_bruta in receitas_brutas_map.items():
        despesa = despesas_map.get(user_id_bruta, 0)
        liquida_bruta = receita_bruta - despesa

        if user_id_bruta in resultado:
            resultado[user_id_bruta] += liquida_bruta
        else:
            resultado[user_id_bruta] = liquida_bruta

    return resultado


@r.get("/agents")
def ranking_agents(
    from_: str | None = Query(None, alias="from"),
    to: str | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=500),
    agent_id: int | None = Query(
        None, description="Filtrar por ID do atendente"
    ),
    db: Session = Depends(get_db),
    user=Depends(
        require_roles(
            "admin", "supervisor", "financeiro", "calculista", "atendente"
        )
    ),
):
    """
    Ranking por atendente - TODOS os usuários do sistema:
    - contratos fechados (count)
    - soma consultoria líquida
    - ticket médio
    - trend (comparado ao período anterior de mesma duração)
    """

    start, end, prev_start, prev_end = _parse_range(from_, to)

    # Buscar usuários com role "atendente" + Balcão (role admin, aparece no ranking)
    all_users_q = db.query(User).filter(
        or_(User.role == "atendente", User.name == "Balcão")
    )
    if agent_id:
        all_users_q = all_users_q.filter(User.id == agent_id)

    all_users = all_users_q.offset((page-1)*per_page).limit(per_page).all()
    total_users = all_users_q.count()

    # ✅ NOVA LÓGICA: Contar contratos considerando distribuição proporcional
    # Se existir ContractAgent, usar percentual (contrato compartilhado)
    # Se não existir, usar lógica legada (1 contrato completo)

    from ..models import ContractAgent

    # Query base de contratos no período
    contracts_base_q = db.query(Contract).filter(Contract.status == "ativo")

    if from_ and to:
        contracts_base_q = contracts_base_q.filter(
            func.coalesce(
                Contract.signed_at, Contract.disbursed_at, Contract.created_at
            ).between(start, end)
        )

    all_contracts = contracts_base_q.all()

    # Mapear contratos por usuário (considerando distribuição)
    contracts_map = {}

    for contract in all_contracts:
        # Verificar se tem distribuição em ContractAgent
        agents = db.query(ContractAgent).filter(
            ContractAgent.contract_id == contract.id
        ).all()

        if agents:
            # TEM DISTRIBUIÇÃO: contar proporcionalmente
            for agent in agents:
                user_id = agent.user_id
                # AJUSTE: Contar cada contrato como 1 inteiro (não proporcional)
                percentual_frac = 1.0  # Sempre 1 contrato inteiro

                if user_id not in contracts_map:
                    contracts_map[user_id] = {"qtd": 0.0}

                contracts_map[user_id]["qtd"] += percentual_frac
        else:
            # SEM DISTRIBUIÇÃO (legado): usar agent_user_id ou assigned_user_id
            # Conta 1 contrato completo para o atendente
            case = db.query(Case).filter(Case.id == contract.case_id).first()
            owner_id = contract.agent_user_id or (case.assigned_user_id if case else None)

            if owner_id:
                if owner_id not in contracts_map:
                    contracts_map[owner_id] = {"qtd": 0.0}

                contracts_map[owner_id]["qtd"] += 1.0

    # ✅ AJUSTE: Arredondar contratos para INTEIRO (sempre para cima se houver fração)
    for user_id in contracts_map:
        # Se tem pelo menos uma fração de contrato, arredondar para cima
        contracts_map[user_id]["qtd"] = math.ceil(contracts_map[user_id]["qtd"])

    # Buscar consultoria líquida por atendente (NOVO: com dedução de despesas)
    consultoria_liquida_map = _calcular_consultoria_liquida_por_usuario(
        db,
        start_date=start if (from_ and to) else None,
        end_date=end if (from_ and to) else None,
        user_id=agent_id
    )

    # Mesclar dados de contratos e consultoria líquida
    for user_id in contracts_map:
        contracts_map[user_id]["consult_sum"] = consultoria_liquida_map.get(user_id, 0)

    # Período anterior para trend - quantidade de contratos (COM DISTRIBUIÇÃO)
    prev_contracts_base_q = db.query(Contract).filter(Contract.status == "ativo")

    if from_ and to:
        prev_contracts_base_q = prev_contracts_base_q.filter(
            func.coalesce(
                Contract.signed_at, Contract.disbursed_at, Contract.created_at
            ).between(prev_start, prev_end)
        )

    prev_contracts = prev_contracts_base_q.all()

    # Mapear contratos do período anterior por usuário (considerando distribuição)
    prev_map = {}

    for contract in prev_contracts:
        # Verificar se tem distribuição em ContractAgent
        agents = db.query(ContractAgent).filter(
            ContractAgent.contract_id == contract.id
        ).all()

        if agents:
            # TEM DISTRIBUIÇÃO: contar proporcionalmente
            for agent in agents:
                user_id = agent.user_id
                percentual_frac = float(agent.percentual) / 100.0

                if user_id not in prev_map:
                    prev_map[user_id] = {"qtd": 0.0}

                prev_map[user_id]["qtd"] += percentual_frac
        else:
            # SEM DISTRIBUIÇÃO (legado)
            case = db.query(Case).filter(Case.id == contract.case_id).first()
            owner_id = contract.agent_user_id or (case.assigned_user_id if case else None)

            if owner_id:
                if owner_id not in prev_map:
                    prev_map[owner_id] = {"qtd": 0.0}

                prev_map[owner_id]["qtd"] += 1.0

    # ✅ AJUSTE: Arredondar contratos para INTEIRO (sempre para cima se houver fração)
    for user_id in prev_map:
        prev_map[user_id]["qtd"] = math.ceil(prev_map[user_id]["qtd"])

    # Buscar consultoria líquida do período anterior (NOVO: com dedução de despesas)
    prev_consultoria_map = _calcular_consultoria_liquida_por_usuario(
        db,
        start_date=prev_start if (from_ and to) else None,
        end_date=prev_end if (from_ and to) else None,
        user_id=agent_id
    )

    # Mesclar dados de contratos e consultoria líquida do período anterior
    for user_id in prev_map:
        prev_map[user_id]["consult_sum"] = prev_consultoria_map.get(user_id, 0)

    # buscar metas (se existir campo User.settings)
    targets_map = {}
    for u in all_users:
        if hasattr(u, "settings") and isinstance(u.settings, dict):
            targets = u.settings.get("targets", {})
            targets_map[u.id] = {
                "contratos": int(targets.get("contracts", 0) or 0),
                "consultoria": float(targets.get("consultoria", 15000.0) or 15000.0)
            }
        else:
            targets_map[u.id] = {"contratos": 0, "consultoria": 15000.0}

    items = []
    for user in all_users:
        # Dados do período atual (pode ser 0 se não tiver contratos)
        current_data = contracts_map.get(user.id, {"qtd": 0, "consult_sum": 0})
        prev_data = prev_map.get(user.id, {"qtd": 0, "consult_sum": 0})

        # trend
        trend_contracts = 0
        trend_consult = 0
        if prev_data["qtd"] > 0:
            trend_contracts = (
                (current_data["qtd"] - prev_data["qtd"]) / prev_data["qtd"]
            ) * 100
        if prev_data["consult_sum"] > 0:
            trend_consult = (
                (current_data["consult_sum"] - prev_data["consult_sum"])
                / prev_data["consult_sum"]
            ) * 100

        # ticket médio
        ticket_medio = (
            current_data["consult_sum"] / current_data["qtd"]
            if current_data["qtd"] > 0
            else 0
        )

        # metas (buscar do settings ou usar padrão)
        meta_contratos = targets_map.get(user.id, {}).get("contratos", 0)
        meta_consultoria = targets_map.get(user.id, {}).get(
            "consultoria", 15000.0
        )

        # atingimento
        atingimento_contratos = (
            (current_data["qtd"] / meta_contratos * 100)
            if meta_contratos > 0
            else 0
        )
        atingimento_consultoria = (
            (current_data["consult_sum"] / meta_consultoria * 100)
            if meta_consultoria > 0
            else 0
        )

        items.append({
            "user_id": user.id,
            "name": user.name,
            "contracts": current_data["qtd"],
            "consultoria_liq": current_data["consult_sum"],
            "ticket_medio": ticket_medio,
            "trend_contracts": round(trend_contracts, 2),
            "trend_consult": round(trend_consult, 2),
            "meta_contratos": meta_contratos,
            "meta_consultoria": meta_consultoria,
            "atingimento_contratos": round(atingimento_contratos, 2),
            "atingimento_consultoria": round(atingimento_consultoria, 2)
        })

    # Ordenar por consultoria líquida (maior primeiro)
    items.sort(key=lambda x: x["consultoria_liq"], reverse=True)

    return {
        "items": items,
        "pagination": {
            "page": page,
            "per_page": per_page,
            "total": total_users,
            "pages": (total_users + per_page - 1) // per_page
        }
    }


@r.get("/agents/targets")
def get_targets(
    from_: str | None = Query(None, alias="from"),
    to: str | None = None,
    db: Session = Depends(get_db),
    user=Depends(
        require_roles(
            "admin", "supervisor", "financeiro", "calculista", "atendente"
        )
    ),
):
    """
    Lê metas salvas para cada atendente.
    Preferência: usar campo JSON existente em User (ex.: User.settings['targets']).
    Se não existir, retornar vazio (frontend trata como 0).
    """

    # Buscar atendentes + Balcão
    rows = db.query(User).filter(
        or_(User.role == "atendente", User.name == "Balcão")
    ).all()
    items = []
    for u in rows:
        meta = {}
        if hasattr(u, "settings") and isinstance(u.settings, dict):
            meta = (u.settings or {}).get("targets", {})

        # Meta padrão: R$ 15.000/mês de consultoria líquida
        meta_consultoria = float(meta.get("consultoria", 0) or 0.0)
        if meta_consultoria == 0:
            meta_consultoria = 15000.00  # Meta padrão

        items.append({
            "user_id": u.id,
            "name": u.name,
            "meta_contratos": int(meta.get("contracts", 0) or 0),
            "meta_consultoria": meta_consultoria,
        })
    return {"items": items}


@r.post("/agents/targets")
def set_targets(
    payload: dict,
    db: Session = Depends(get_db),
    user=Depends(require_roles("admin", "supervisor")),
):
    """
    Atualiza metas por atendente:
    payload = { items: [{user_id, meta_contratos, meta_consultoria}, ...] }
    Persistir em User.settings['targets'] sem criar migração.
    """
    items = payload.get("items", [])
    updated = []
    for it in items:
        u = db.get(User, it["user_id"])
        if not u:
            continue
        if not hasattr(u, "settings") or not isinstance(u.settings, dict):
            u.settings = {}
        u.settings.setdefault("targets", {})
        u.settings["targets"]["contracts"] = int(
            it.get("meta_contratos", 0) or 0
        )
        u.settings["targets"]["consultoria"] = float(
            it.get("meta_consultoria", 0) or 0.0
        )
        updated.append(u.id)
    db.commit()
    return {"updated": updated}


@r.get("/teams")
def ranking_teams(
    from_: str | None = Query(None, alias="from"),
    to: str | None = None,
    db: Session = Depends(get_db),
    user=Depends(
        require_roles(
            "admin", "supervisor", "financeiro", "calculista", "atendente"
        )
    ),
):
    # Como não há User.department explícito, agregamos por User.role
    start, end, *_ = _parse_range(from_, to)
    owner_user_id = case(
        (Contract.created_by.isnot(None), Contract.created_by),
        else_=Case.assigned_user_id
    )

    # Contar contratos por role
    contracts_q = (
        db.query(
            func.coalesce(User.role, "Sem Time").label("team"),
            func.count(Contract.id).label("contracts")
        )
        .join(Case, Case.id == Contract.case_id, isouter=True)
        .join(User, User.id == owner_user_id)
        .group_by(func.coalesce(User.role, "Sem Time"))
    )

    # Aplicar filtro de data apenas se especificado
    if from_ and to:
        contracts_q = contracts_q.filter(
            func.coalesce(
                Contract.signed_at, Contract.disbursed_at, Contract.created_at
            ).between(start, end)
        )

    contracts_data = contracts_q.all()

    # Buscar consultoria líquida por usuário (NOVO: com dedução de despesas)
    consultoria_map = _calcular_consultoria_liquida_por_usuario(
        db,
        start_date=start if (from_ and to) else None,
        end_date=end if (from_ and to) else None
    )

    # Agrupar consultoria por role/team
    team_consultoria = {}
    for user_id, consultoria_liq in consultoria_map.items():
        user_obj = db.get(User, user_id)
        if user_obj:
            team = user_obj.role or "Sem Time"
            team_consultoria[team] = team_consultoria.get(team, 0) + consultoria_liq

    # Mesclar contratos e consultoria por team
    teams_map = {}
    for r in contracts_data:
        teams_map[r.team] = {
            "contracts": int(r.contracts or 0),
            "consultoria_liq": team_consultoria.get(r.team, 0)
        }

    # Adicionar teams com consultoria mas sem contratos
    for team, consult_sum in team_consultoria.items():
        if team not in teams_map:
            teams_map[team] = {"contracts": 0, "consultoria_liq": consult_sum}

    # Ordenar por consultoria líquida
    items = [
        {
            "team": team,
            "contracts": data["contracts"],
            "consultoria_liq": data["consultoria_liq"]
        }
        for team, data in sorted(
            teams_map.items(),
            key=lambda x: x[1]["consultoria_liq"],
            reverse=True
        )
    ]

    return {"items": items}


@r.get("/export.csv")
def export_csv(
    kind: str,
    from_: str | None = Query(None, alias="from"),
    to: str | None = None,
    db: Session = Depends(get_db),
    user=Depends(
        require_roles(
            "admin", "supervisor", "financeiro", "calculista", "atendente"
        )
    ),
):
    # gere CSV em memória conforme 'agents' ou 'teams'
    start, end, prev_start, prev_end = _parse_range(from_, to)

    output = io.StringIO()
    writer = csv.writer(output)

    if kind == "agents":
        owner_user_id = case(
            (Contract.created_by.isnot(None), Contract.created_by),
            else_=Case.assigned_user_id
        )
        # Contar contratos por atendente
        contracts_rows = (
            db.query(
                owner_user_id.label("user_id"),
                func.count(Contract.id).label("qtd")
            )
            .join(Case, Case.id == Contract.case_id)
            .filter(
                Contract.status == "ativo",
                func.date(Contract.signed_at).between(start, end)
            )
            .group_by(owner_user_id)
        ).all()

        # Buscar consultoria líquida por atendente (NOVO: com dedução de despesas)
        consultoria_map = _calcular_consultoria_liquida_por_usuario(
            db,
            start_date=start,
            end_date=end
        )

        # Mesclar dados de contratos e consultoria
        rows_map = {}
        for r in contracts_rows:
            rows_map[r.user_id] = {"qtd": int(r.qtd or 0), "consult_sum": 0}

        # Adicionar consultoria líquida
        for user_id in rows_map:
            rows_map[user_id]["consult_sum"] = consultoria_map.get(user_id, 0)

        # Adicionar usuários com consultoria mas sem contratos
        for user_id, consult_sum in consultoria_map.items():
            if user_id not in rows_map:
                rows_map[user_id] = {"qtd": 0, "consult_sum": consult_sum}

        # Ordenar por consultoria líquida
        sorted_users = sorted(
            rows_map.items(),
            key=lambda x: x[1]["consult_sum"],
            reverse=True
        )

        # Criar objetos compatíveis com o código original
        class RowResult:
            def __init__(self, user_id, qtd, consult_sum):
                self.user_id = user_id
                self.qtd = qtd
                self.consult_sum = consult_sum

        rows = [
            RowResult(uid, data["qtd"], data["consult_sum"])
            for uid, data in sorted_users
        ]

        # Período anterior - contratos
        prev_contracts = (
            db.query(
                owner_user_id.label("user_id"),
                func.count(Contract.id).label("qtd")
            )
            .join(Case, Case.id == Contract.case_id)
            .filter(
                Contract.status == "ativo",
                func.date(Contract.signed_at).between(prev_start, prev_end)
            )
            .group_by(owner_user_id)
        ).all()

        # Período anterior - consultoria líquida (NOVO: com dedução de despesas)
        prev_consultoria_map = _calcular_consultoria_liquida_por_usuario(
            db,
            start_date=prev_start,
            end_date=prev_end
        )

        prev_map = {}
        for r in prev_contracts:
            prev_map[r.user_id] = {"qtd": int(r.qtd or 0), "consult_sum": 0}

        # Adicionar consultoria líquida do período anterior
        for user_id in prev_map:
            prev_map[user_id]["consult_sum"] = prev_consultoria_map.get(user_id, 0)

        # Adicionar usuários com consultoria mas sem contratos no período anterior
        for user_id, consult_sum in prev_consultoria_map.items():
            if user_id not in prev_map:
                prev_map[user_id] = {"qtd": 0, "consult_sum": consult_sum}

        # cabeçalho
        writer.writerow([
            "user_id", "name", "contracts", "consultoria_liq", "ticket_medio",
            "trend_contracts", "trend_consult", "meta_contratos", "meta_consultoria",
            "atingimento_contratos", "atingimento_consultoria"
        ])

        # metas por usuário - atendentes + Balcão
        user_targets: dict[int, dict] = {}
        for u in db.query(User).filter(
            or_(User.role == "atendente", User.name == "Balcão")
        ).all():
            meta = {}
            if hasattr(u, "settings") and isinstance(
                getattr(u, "settings"), dict
            ):
                meta = (u.settings or {}).get("targets", {})
            user_targets[u.id] = {
                "contracts": int(meta.get("contracts", 0) or 0),
                "consultoria": float(meta.get("consultoria", 0.0) or 0.0),
            }

        for r0 in rows:
            uid = r0.user_id
            consult = float(r0.consult_sum or 0)
            qtd = int(r0.qtd or 0)
            ticket = (consult / qtd) if qtd else 0.0
            prevd = prev_map.get(uid, {"qtd": 0, "consult_sum": 0.0})
            targets = user_targets.get(uid, {"contracts": 0, "consultoria": 0.0})
            ating_cont = (
                (qtd / targets["contracts"]) if targets["contracts"] else 0.0
            )
            ating_cons = (
                (consult / targets["consultoria"]) if targets["consultoria"] else 0.0
            )

            writer.writerow([
                uid,
                (db.get(User, uid).name if uid else "—"),
                qtd,
                round(consult, 2),
                round(ticket, 2),
                qtd - prevd["qtd"],
                round(consult - prevd["consult_sum"], 2),
                targets["contracts"],
                round(targets["consultoria"], 2),
                round(ating_cont, 4),
                round(ating_cons, 4),
            ])

    elif kind == "teams":
        owner_user_id = case(
            (Contract.created_by.isnot(None), Contract.created_by),
            else_=Case.assigned_user_id
        )

        # Contar contratos por team
        contracts_rows = (
            db.query(
                func.coalesce(User.role, "Sem Time").label("team"),
                func.count(Contract.id).label("contracts")
            )
            .join(Case, Case.id == Contract.case_id)
            .join(User, User.id == owner_user_id)
            .filter(
                Contract.status == "ativo",
                func.date(Contract.signed_at).between(start, end)
            )
            .group_by(func.coalesce(User.role, "Sem Time"))
        ).all()

        # Buscar consultoria líquida por usuário (NOVO: com dedução de despesas)
        consultoria_map = _calcular_consultoria_liquida_por_usuario(
            db,
            start_date=start,
            end_date=end
        )

        # Agrupar consultoria por team
        team_consultoria = {}
        for user_id, consultoria_liq in consultoria_map.items():
            user_obj = db.get(User, user_id)
            if user_obj:
                team = user_obj.role or "Sem Time"
                team_consultoria[team] = team_consultoria.get(team, 0) + consultoria_liq

        # Mesclar contratos e consultoria
        teams_map = {}
        for r in contracts_rows:
            teams_map[r.team] = {
                "contracts": int(r.contracts or 0),
                "consultoria_liq": team_consultoria.get(r.team, 0)
            }

        # Adicionar teams com consultoria mas sem contratos
        for team, consult_sum in team_consultoria.items():
            if team not in teams_map:
                teams_map[team] = {"contracts": 0, "consultoria_liq": consult_sum}

        # Ordenar por consultoria líquida
        sorted_teams = sorted(
            teams_map.items(),
            key=lambda x: x[1]["consultoria_liq"],
            reverse=True
        )

        writer.writerow(["team", "contracts", "consultoria_liq"])
        for team, data in sorted_teams:
            writer.writerow([
                team,
                data["contracts"],
                round(data["consultoria_liq"], 2)
            ])
    else:
        raise HTTPException(
            status_code=400, detail="kind deve ser 'agents' ou 'teams'"
        )

    csv_data = output.getvalue()
    return Response(content=csv_data, media_type="text/csv")


@r.get("/podium")
def get_podium(
    from_: str | None = Query(None, alias="from"),
    to: str | None = None,
    db: Session = Depends(get_db),
    user=Depends(
        require_roles(
            "admin", "supervisor", "financeiro", "calculista", "atendente"
        )
    ),
):
    """
    Retorna Top 3 usuários por volume de consultoria líquida e contratos efetivados.
    Apenas contratos com status="ativo" são considerados.
    """
    start, end, prev_start, prev_end = _parse_range(from_, to)

    # Estratégia para encontrar o atendente dono do contrato
    owner_user_id = case(
        (Contract.agent_user_id.isnot(None), Contract.agent_user_id),
        else_=Case.assigned_user_id
    )

    # Query para contar contratos por atendente
    contracts_query = (
        db.query(
            owner_user_id.label("user_id"),
            func.count(Contract.id).label("contracts")
        )
        .join(Case, Case.id == Contract.case_id, isouter=True)
        .join(User, User.id == owner_user_id)
        .filter(Contract.status == "ativo")
        .filter(or_(User.role == "atendente", User.name == "Balcão"))
    )  # Filtrar atendentes + Balcão ANTES do limit

    if from_ and to:
        contracts_query = contracts_query.filter(
            func.coalesce(
                Contract.signed_at, Contract.disbursed_at, Contract.created_at
            ).between(start, end)
        )

    contracts_data = contracts_query.group_by(owner_user_id).all()

    # Buscar consultoria líquida por atendente (NOVO: com dedução de despesas)
    consultoria_liquida_map = _calcular_consultoria_liquida_por_usuario(
        db,
        start_date=start if (from_ and to) else None,
        end_date=end if (from_ and to) else None
    )

    # Criar mapa mesclando contratos e consultoria líquida
    podium_map = {}
    for r in contracts_data:
        podium_map[r.user_id] = {"contracts": int(r.contracts or 0), "consultoria_liq": 0}

    # Adicionar consultoria líquida para usuários com contratos
    for user_id in podium_map:
        podium_map[user_id]["consultoria_liq"] = consultoria_liquida_map.get(user_id, 0)

    # Adicionar consultoria líquida para usuários SEM contratos (mas com receitas)
    for user_id, consultoria_liq in consultoria_liquida_map.items():
        if user_id not in podium_map:
            # Verificar se é atendente ou Balcão
            user_obj = db.get(User, user_id)
            if user_obj and (user_obj.role == "atendente" or user_obj.name == "Balcão"):
                podium_map[user_id] = {"contracts": 0, "consultoria_liq": consultoria_liq}

    # Ordenar por consultoria líquida
    sorted_users = sorted(
        podium_map.items(),
        key=lambda x: x[1]["consultoria_liq"],
        reverse=True
    )

    # Formatar Top 3 - garantir que sempre tenha 3 posições quando houver dados suficientes
    podium = []
    position = 1
    for user_id, data in sorted_users:
        if position > 3:  # Limitar a 3 posições
            break
        user_obj = db.get(User, user_id)
        if user_obj and (user_obj.role == "atendente" or user_obj.name == "Balcão"):  # Atendentes + Balcão
            podium.append({
                "position": position,
                "user_id": user_id,
                "name": user_obj.name,
                "contracts": data["contracts"],
                "consultoria_liq": data["consultoria_liq"]
            })
            position += 1

    return {
        "period": {"from": str(start), "to": str(end)},
        "podium": podium
    }


@r.get("/agents/{user_id}/contracts")
def get_user_contracts(
    user_id: int,
    from_: str | None = Query(None, alias="from"),
    to: str | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    user=Depends(
        require_roles(
            "admin", "supervisor", "atendente"
        )
    ),
):
    """
    Lista todos os contratos efetivados de um usuário específico.

    Permissões:
    - Atendente: apenas próprios contratos (user_id == current_user.id)
    - Admin/Supervisor: qualquer user_id

    Retorna:
    - Lista de contratos com dados do cliente
    - Totalizadores (qtd contratos, soma consultoria)
    - Paginação
    """

    # Verificar permissão: atendente só pode ver próprios contratos
    if user.role == "atendente" and user.id != user_id:
        raise HTTPException(
            status_code=403,
            detail="Você só pode visualizar seus próprios contratos"
        )

    # Verificar se usuário existe
    target_user = db.get(User, user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    start, end, _, _ = _parse_range(from_, to)

    # ✅ NOVA LÓGICA: Buscar contratos considerando ContractAgent (distribuição)
    from ..models import ContractAgent

    # Buscar contratos onde o usuário está em ContractAgent OU é o agent_user_id/assigned_user_id
    # Subconsulta: IDs de contratos onde o usuário está em ContractAgent
    contract_ids_from_agents = (
        db.query(ContractAgent.contract_id)
        .filter(ContractAgent.user_id == user_id)
        .subquery()
    )

    # Importar operadores SQL
    from sqlalchemy import or_, and_

    # Query base: contratos do usuário (via ContractAgent OU agent_user_id/assigned_user_id)
    base_query = (
        db.query(Contract, Case, Client)
        .join(Case, Case.id == Contract.case_id)
        .join(Client, Client.id == Case.client_id)
        .filter(Contract.status == "ativo")
        .filter(
            or_(
                # Contrato compartilhado (via ContractAgent)
                Contract.id.in_(contract_ids_from_agents),
                # Contrato legado (via agent_user_id ou assigned_user_id)
                and_(
                    ~Contract.id.in_(
                        db.query(ContractAgent.contract_id).distinct()
                    ),
                    func.coalesce(Contract.agent_user_id, Case.assigned_user_id) == user_id
                )
            )
        )
    )

    # Aplicar filtro de data
    if from_ and to:
        base_query = base_query.filter(
            func.coalesce(
                Contract.signed_at, Contract.disbursed_at, Contract.created_at
            ).between(start, end)
        )

    # Contar total de contratos
    total_count = base_query.count()

    # Aplicar paginação e ordenação
    contracts_query = base_query.order_by(
        Contract.signed_at.desc().nulls_last(),
        Contract.created_at.desc()
    ).offset((page - 1) * per_page).limit(per_page)

    # Buscar contratos
    results = contracts_query.all()

    # Calcular totalizadores (mesma lógica de filtro que base_query)
    summary_query = (
        db.query(Contract, Case)
        .join(Case, Case.id == Contract.case_id)
        .filter(Contract.status == "ativo")
        .filter(
            or_(
                # Contrato compartilhado (via ContractAgent)
                Contract.id.in_(contract_ids_from_agents),
                # Contrato legado (via agent_user_id ou assigned_user_id)
                and_(
                    ~Contract.id.in_(
                        db.query(ContractAgent.contract_id).distinct()
                    ),
                    func.coalesce(Contract.agent_user_id, Case.assigned_user_id) == user_id
                )
            )
        )
    )

    if from_ and to:
        summary_query = summary_query.filter(
            func.coalesce(
                Contract.signed_at, Contract.disbursed_at, Contract.created_at
            ).between(start, end)
        )

    summary_contracts = summary_query.all()

    # Calcular totais considerando distribuição proporcional
    total_contracts = 0.0
    total_consultoria = 0.0

    for contract, case_obj in summary_contracts:
        # Buscar percentual do usuário neste contrato
        agent_record = db.query(ContractAgent).filter(
            ContractAgent.contract_id == contract.id,
            ContractAgent.user_id == user_id
        ).first()

        # AJUSTE: Contar cada contrato como 1 inteiro, não proporcional
        # A consultoria já é calculada proporcionalmente via FinanceIncome
        if agent_record:
            # Contrato compartilhado - contar proporcionalmente
            percentual_frac = float(agent_record.percentual) / 100.0
            total_contracts += percentual_frac

            # Consultoria proporcional (usar receita real do FinanceIncome)
            # A consultoria_valor_liquido do contrato é o valor TOTAL
            # Mas a receita já foi distribuída corretamente no FinanceIncome
        else:
            # Contrato legado - contar 100%
            total_contracts += 1.0

    # Buscar consultoria líquida real do FinanceIncome (já distribuída)
    consultoria_map = _calcular_consultoria_liquida_por_usuario(
        db,
        start_date=start if (from_ and to) else None,
        end_date=end if (from_ and to) else None,
        user_id=user_id
    )
    total_consultoria = consultoria_map.get(user_id, 0)

    # ✅ AJUSTE: Arredondar contratos para INTEIRO (sempre para cima se houver fração)
    total_contracts = math.ceil(total_contracts) if total_contracts > 0 else 0
    ticket_medio = (total_consultoria / total_contracts) if total_contracts > 0 else 0

    # Formatar itens
    items = []
    for contract, case_obj, client in results:
        # Buscar percentual do usuário neste contrato
        agent_record = db.query(ContractAgent).filter(
            ContractAgent.contract_id == contract.id,
            ContractAgent.user_id == user_id
        ).first()

        percentual_usuario = float(agent_record.percentual) if agent_record else 100.0

        # Consultoria proporcional do usuário
        consultoria_proporcional = float(contract.consultoria_valor_liquido or 0) * (percentual_usuario / 100.0)

        items.append({
            "contract_id": contract.id,
            "case_id": case_obj.id,
            "client_id": client.id,
            "client_name": client.name,
            "client_cpf": client.cpf,
            "signed_at": (
                contract.signed_at.isoformat() if contract.signed_at else None
            ),
            "disbursed_at": (
                contract.disbursed_at.isoformat()
                if contract.disbursed_at
                else None
            ),
            "consultoria_valor_liquido": float(
                contract.consultoria_valor_liquido or 0
            ),
            "consultoria_proporcional": round(consultoria_proporcional, 2),  # Valor proporcional do usuário
            "percentual_usuario": percentual_usuario,  # Percentual do usuário neste contrato
            "total_amount": float(contract.total_amount or 0),
            "installments": contract.installments or 0,
            "status": contract.status,
            "case_status": case_obj.status  # Status do caso
        })

    return {
        "items": items,
        "summary": {
            "total_contracts": total_contracts,
            "total_consultoria": round(total_consultoria, 2),
            "ticket_medio": round(ticket_medio, 2)
        },
        "pagination": {
            "page": page,
            "per_page": per_page,
            "total": total_count,
            "pages": (total_count + per_page - 1) // per_page
        }
    }


@r.get("/kpis")
def get_rankings_kpis(
    from_: str | None = Query(None, alias="from"),
    to: str | None = None,
    user_id: int | None = Query(
        None, description="Filtrar por ID do usuário específico"
    ),
    db: Session = Depends(get_db),
    user=Depends(
        require_roles(
            "admin", "supervisor", "financeiro", "calculista", "atendente"
        )
    ),
):
    """
    KPIs agregados do módulo Rankings:
    - Se user_id fornecido: retorna KPIs individuais do usuário
    - Caso contrário: KPIs agregados de todos os usuários
    """
    start, end, prev_start, prev_end = _parse_range(from_, to)

    # Estratégia para encontrar o atendente dono do contrato
    owner_user_id = case(
        (Contract.agent_user_id.isnot(None), Contract.agent_user_id),
        else_=Case.assigned_user_id
    )

    # Se user_id fornecido, retornar KPIs individuais
    if user_id:
        # Buscar dados do usuário específico
        user_obj = db.get(User, user_id)
        if not user_obj:
            raise HTTPException(
                status_code=404, detail="Usuário não encontrado"
            )

        # Contratos do usuário no período
        user_contracts_query = (
            db.query(Contract)
            .join(Case, Case.id == Contract.case_id, isouter=True)
            .filter(Contract.status == "ativo")
        )

        # Aplicar filtro de usuário
        user_contracts_query = user_contracts_query.filter(
            func.coalesce(
                Contract.agent_user_id, Case.assigned_user_id
            ) == user_id
        )

        if from_ and to:
            user_contracts_query = user_contracts_query.filter(
                func.coalesce(
                    Contract.signed_at, Contract.disbursed_at, Contract.created_at
                ).between(start, end)
            )

        # Calcular métricas do usuário - quantidade de contratos
        user_contracts = user_contracts_query.count()

        # Buscar consultoria líquida do usuário (NOVO: com dedução de despesas)
        consultoria_map = _calcular_consultoria_liquida_por_usuario(
            db,
            start_date=start if (from_ and to) else None,
            end_date=end if (from_ and to) else None,
            user_id=user_id
        )
        user_consultoria = consultoria_map.get(user_id, 0)

        # Buscar meta do usuário
        meta = {}
        if hasattr(user_obj, "settings") and isinstance(
            user_obj.settings, dict
        ):
            meta = (user_obj.settings or {}).get("targets", {})
        meta_contratos = int(meta.get("contracts", 0) or 0)
        meta_consultoria = float(meta.get("consultoria", 0) or 10000.0)
        if meta_consultoria == 0:
            meta_consultoria = 10000.0

        # Calcular progresso
        progresso_contratos = (
            (user_contracts / meta_contratos * 100)
            if meta_contratos > 0
            else 0
        )
        progresso_consultoria = (
            (user_consultoria / meta_consultoria * 100)
            if meta_consultoria > 0
            else 0
        )

        return {
            "period": {"from": str(start), "to": str(end)},
            "user_id": user_id,
            "name": user_obj.name,
            "kpis": {
                "contracts": user_contracts,
                "consultoria_liq": round(user_consultoria, 2),
                "meta_contratos": meta_contratos,
                "meta_consultoria": round(meta_consultoria, 2),
                "progresso_contratos": round(progresso_contratos, 1),
                "progresso_consultoria": round(progresso_consultoria, 1),
                "falta_contratos": max(0, meta_contratos - user_contracts),
                "falta_consultoria": max(
                    0, round(meta_consultoria - user_consultoria, 2)
                )
            }
        }

    # KPIs agregados (todos os usuários)
    # Estratégia para encontrar o atendente dono do contrato
    owner_user_id = case(
        (Contract.agent_user_id.isnot(None), Contract.agent_user_id),
        else_=Case.assigned_user_id
    )

    # Query base para contratos no período
    base_q = (
        db.query(Contract)
        .join(Case, Case.id == Contract.case_id, isouter=True)
    )

    if from_ and to:
        base_q = base_q.filter(
            func.coalesce(Contract.signed_at, Contract.disbursed_at, Contract.created_at).between(start, end)
        )

    # Total de contratos no período
    total_contracts = base_q.count()

    # Consultoria líquida total (NOVO: com dedução de despesas)
    consultoria_map_agregado = _calcular_consultoria_liquida_por_usuario(
        db,
        start_date=start if (from_ and to) else None,
        end_date=end if (from_ and to) else None
    )
    total_consultoria = sum(consultoria_map_agregado.values())

    # Ticket médio geral
    ticket_medio_geral = (total_consultoria / total_contracts) if total_contracts > 0 else 0

    # Atendentes únicos no período
    atendentes_query = (db.query(func.distinct(owner_user_id))
                       .join(Case, Case.id == Contract.case_id, isouter=True))

    if from_ and to:
        atendentes_query = atendentes_query.filter(
            func.coalesce(Contract.signed_at, Contract.disbursed_at, Contract.created_at).between(start, end)
        )

    total_atendentes = atendentes_query.count()

    # Performance por atendente - quantidade de contratos
    contracts_perf_query = (db.query(
        owner_user_id.label("user_id"),
        func.count(Contract.id).label("qtd")
    )
    .join(Case, Case.id == Contract.case_id, isouter=True)
    .group_by(owner_user_id))

    if from_ and to:
        contracts_perf_query = contracts_perf_query.filter(
            func.coalesce(Contract.signed_at, Contract.disbursed_at, Contract.created_at).between(start, end)
        )

    contracts_perf_results = contracts_perf_query.all()

    # Performance por atendente - consultoria líquida (NOVO: usando função helper)
    # Reutilizar o mapa já calculado acima
    consultoria_perf_map = consultoria_map_agregado

    # Mesclar resultados de contratos e consultoria líquida
    performance_map = {}
    for r in contracts_perf_results:
        performance_map[r.user_id] = {"qtd": int(r.qtd or 0), "consult_sum": 0}

    # Adicionar consultoria líquida para usuários com contratos
    for user_id in performance_map:
        performance_map[user_id]["consult_sum"] = consultoria_perf_map.get(user_id, 0)

    # Adicionar consultoria líquida para usuários SEM contratos (mas com receitas)
    for user_id, consult_sum in consultoria_perf_map.items():
        if user_id not in performance_map:
            performance_map[user_id] = {"qtd": 0, "consult_sum": consult_sum}

    # Criar lista de tuplas compatível com o código original
    class PerfResult:
        def __init__(self, user_id, qtd, consult_sum):
            self.user_id = user_id
            self.qtd = qtd
            self.consult_sum = consult_sum

    performance_results = [PerfResult(uid, data["qtd"], data["consult_sum"]) for uid, data in performance_map.items()]

    # Calcular atendentes que atingiram meta (R$ 15.000 padrão)
    meta_default = 15000.0
    atendentes_meta_atingida = 0
    top_performer = None
    max_consultoria = 0

    # Buscar metas personalizadas dos usuários - atendentes + Balcão
    user_targets = {}
    for u in db.query(User).filter(
        or_(User.role == "atendente", User.name == "Balcão")
    ).all():
        meta = {}
        if hasattr(u, "settings") and isinstance(u.settings, dict):
            meta = (u.settings or {}).get("targets", {})
        meta_consultoria = float(meta.get("consultoria", 0) or 0.0)
        if meta_consultoria == 0:
            meta_consultoria = meta_default
        user_targets[u.id] = meta_consultoria

    for perf in performance_results:
        if not perf.user_id:
            continue

        consultoria = float(perf.consult_sum or 0)
        meta_usuario = user_targets.get(perf.user_id, meta_default)

        # Verificar se atingiu meta
        if consultoria >= meta_usuario:
            atendentes_meta_atingida += 1

        # Verificar se é o top performer
        if consultoria > max_consultoria:
            max_consultoria = consultoria
            user = db.get(User, perf.user_id)
            top_performer = {
                "user_id": perf.user_id,
                "name": user.name if user else "—",
                "consultoria_liq": consultoria,
                "contracts": int(perf.qtd or 0)
            }

    # Período anterior para comparação - quantidade de contratos
    prev_query = (db.query(Contract)
                  .join(Case, Case.id == Contract.case_id, isouter=True))

    if from_ and to:
        prev_query = prev_query.filter(
            func.coalesce(Contract.signed_at, Contract.disbursed_at, Contract.created_at).between(prev_start, prev_end)
        )

    prev_total_contracts = prev_query.count()

    # Período anterior - consultoria líquida (NOVO: com dedução de despesas)
    prev_consultoria_map = _calcular_consultoria_liquida_por_usuario(
        db,
        start_date=prev_start if (from_ and to) else None,
        end_date=prev_end if (from_ and to) else None
    )
    prev_total_consultoria = sum(prev_consultoria_map.values())

    # Calcular trends
    trend_contracts = total_contracts - prev_total_contracts
    trend_consultoria = total_consultoria - prev_total_consultoria
    trend_contracts_percent = (trend_contracts / prev_total_contracts * 100) if prev_total_contracts > 0 else 0
    trend_consultoria_percent = (trend_consultoria / prev_total_consultoria * 100) if prev_total_consultoria > 0 else 0

    return {
        "period": {"from": str(start), "to": str(end)},
        "kpis": {
            "total_atendentes": total_atendentes,
            "total_contracts": total_contracts,
            "total_consultoria": round(total_consultoria, 2),
            "ticket_medio_geral": round(ticket_medio_geral, 2),
            "atendentes_meta_atingida": atendentes_meta_atingida,
            "percentual_meta_atingida": round((atendentes_meta_atingida / total_atendentes * 100) if total_atendentes > 0 else 0, 1),
            "top_performer": top_performer,
            "trends": {
                "contracts": trend_contracts,
                "contracts_percent": round(trend_contracts_percent, 1),
                "consultoria": round(trend_consultoria, 2),
                "consultoria_percent": round(trend_consultoria_percent, 1)
            }
        }
    }
