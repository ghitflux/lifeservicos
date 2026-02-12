from __future__ import annotations

import csv
import io
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from time import time
from typing import Any, Dict, Literal, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, case, func, or_
from sqlalchemy.orm import Session

from ..db import SessionLocal
from ..models import (
    Case,
    CaseEvent,
    Client,
    Contract,
    ContractAgent,
    FinanceExpense,
    FinanceIncome,
    ImportBatch,
    now_brt,
    PayrollImportBatch,
    Simulation,
    User,
)
from ..rbac import require_roles

ALLOWED_ROLES = ("admin", "supervisor", "financeiro", "calculista")

r = APIRouter(prefix="/analytics", tags=["analytics"])

ATT_OPEN_STATUSES = {"novo", "disponivel"}
ATT_IN_PROGRESS_STATUSES = {
    "em_atendimento",
    "calculista_pendente",
    "calculo_aprovado",
    "fechamento_aprovado",
    "financeiro_pendente",
}
ACTIVE_CONTRACT_STATUSES = {"ativo"}
# Status que indicam casos finalizados com sucesso
COMPLETED_STATUSES = {"fechamento_aprovado", "contrato_efetivado"}
# Status que indicam casos em processamento ativo
PROCESSING_STATUSES = {"em_atendimento", "calculista_pendente", "calculo_aprovado"}
DEFAULT_LOOKBACK_DAYS = 30

def ttl_cache(ttl_seconds: int):
    def decorator(func):
        cache: Dict[Any, Tuple[float, Any]] = {}

        def wrapper(*args, **kwargs):
            key = (args, tuple(sorted(kwargs.items())))
            now = time()
            entry = cache.get(key)
            if entry:
                cached_at, cached_value = entry
                if now - cached_at < ttl_seconds:
                    return cached_value
            value = func(*args, **kwargs)
            cache[key] = (now, value)
            return value

        return wrapper

    return decorator


def _parse_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    candidate = value.strip()
    if candidate.endswith("Z"):
        candidate = candidate[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(candidate)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid datetime format '{value}'. Use ISO 8601.",
        ) from exc
    if dt.tzinfo:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt.replace(microsecond=0)


def _resolve_period(
    from_str: Optional[str],
    to_str: Optional[str],
) -> Tuple[datetime, datetime]:
    now = now_brt().replace(microsecond=0)
    end = _parse_datetime(to_str) or now
    start = _parse_datetime(from_str) or (end - timedelta(days=DEFAULT_LOOKBACK_DAYS))
    if start > end:
        raise HTTPException(422, detail="'from' must be before 'to'")
    return start, end


def _resolve_period_with_previous(
    from_str: Optional[str],
    to_str: Optional[str],
) -> Tuple[datetime, datetime, datetime, datetime]:
    """
    Resolve período atual e anterior para cálculo de trends.
    Retorna: (start, end, prev_start, prev_end)
    """
    now = now_brt().replace(microsecond=0)
    
    if from_str and to_str:
        start = _parse_datetime(from_str)
        end = _parse_datetime(to_str)
    else:
        # Padrão: mês atual
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if now.month == 12:
            end = now.replace(year=now.year + 1, month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        else:
            end = now.replace(month=now.month + 1, day=1, hour=0, minute=0, second=0, microsecond=0)
    
    if start > end:
        raise HTTPException(422, detail="'from' must be before 'to'")
    
    # Calcular período anterior com a mesma duração
    period_duration = end - start
    prev_end = start
    prev_start = prev_end - period_duration
    
    return start, end, prev_start, prev_end


def _calculate_trend(current: float, previous: float) -> float:
    """
    Calcula a tendência percentual entre dois valores.
    """
    if previous == 0:
        return 100.0 if current > 0 else 0.0
    return round(((current - previous) / previous) * 100, 2)


def _cache_key(dt: datetime) -> str:
    return dt.replace(microsecond=0).isoformat()


def _serialize_dt(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    return dt.replace(microsecond=0, tzinfo=None).isoformat()


def _to_float(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _to_int(value: Any) -> int:
    if value is None:
        return 0
    try:
        return int(value)
    except (TypeError, ValueError):
        return int(round(_to_float(value)))


def _safe_ratio(numerator: Any, denominator: Any) -> float:
    num = _to_float(numerator)
    den = _to_float(denominator)
    if den == 0:
        return 0.0
    return num / den


def _format_money(value: Any) -> str:
    return f"{_to_float(value):.2f}"

@ttl_cache(60)
def _get_kpis_with_trends_cached(start_key: str, end_key: str, prev_start_key: str, prev_end_key: str) -> Dict[str, Any]:
    """
    Calcula KPIs para período atual e anterior, incluindo trends.
    """
    current_kpis = _get_kpis_cached(start_key, end_key)
    previous_kpis = _get_kpis_cached(prev_start_key, prev_end_key)
    
    # Calcular trends para os principais KPIs
    trends = {
        "receita_auto_mtd": _calculate_trend(
            current_kpis.get("receita_auto_mtd", 0),
            previous_kpis.get("receita_auto_mtd", 0)
        ),
        "resultado_mtd": _calculate_trend(
            current_kpis.get("resultado_mtd", 0),
            previous_kpis.get("resultado_mtd", 0)
        ),
        "consultoria_liq_mtd": _calculate_trend(
            current_kpis.get("consultoria_liq_mtd", 0),
            previous_kpis.get("consultoria_liq_mtd", 0)
        ),
        "contracts_mtd": _calculate_trend(
            current_kpis.get("contracts_mtd", 0),
            previous_kpis.get("contracts_mtd", 0)
        ),
        "att_completed": _calculate_trend(
            current_kpis.get("att_completed", 0),
            previous_kpis.get("att_completed", 0)
        ),
        "conv_rate": _calculate_trend(
            current_kpis.get("conv_rate", 0),
            previous_kpis.get("conv_rate", 0)
        ),
        "att_sla_72h": _calculate_trend(
            current_kpis.get("att_sla_72h", 0),
            previous_kpis.get("att_sla_72h", 0)
        ),
        "att_tma_min": _calculate_trend(
            current_kpis.get("att_tma_min", 0),
            previous_kpis.get("att_tma_min", 0)
        ),
    }
    
    # Adicionar trends aos KPIs atuais
    result = current_kpis.copy()
    result["trends"] = trends
    result["previous_period"] = previous_kpis
    
    return result


@ttl_cache(60)
def _get_kpis_cached(start_key: str, end_key: str) -> Dict[str, Any]:
    start = datetime.fromisoformat(start_key)
    end = datetime.fromisoformat(end_key)
    with SessionLocal() as db:
        att_open = (
            db.query(func.count(Case.id))
            .filter(
                Case.status.in_(ATT_OPEN_STATUSES),
                Case.last_update_at.isnot(None),
                Case.last_update_at >= start,
                Case.last_update_at < end,
            )
            .scalar()
            or 0
        )

        att_in_progress = (
            db.query(func.count(Case.id))
            .filter(
                Case.status.in_(ATT_IN_PROGRESS_STATUSES),
                Case.last_update_at.isnot(None),
                Case.last_update_at >= start,
                Case.last_update_at < end,
            )
            .scalar()
            or 0
        )

        sla_ratio = (
            db.query(
                func.avg(
                    case(
                        (Case.last_update_at <= Case.assignment_expires_at, 1),
                        else_=0,
                    )
                )
            )
            .filter(
                Case.assigned_at.isnot(None),
                Case.assignment_expires_at.isnot(None),
                Case.last_update_at.isnot(None),
                Case.assigned_at >= start,
                Case.assigned_at < end,
            )
            .scalar()
        )
        sla_ratio_value = float(sla_ratio) if sla_ratio is not None else 0.0

        # TMA: Tempo médio de atendimento apenas para casos finalizados
        tma_minutes = (
            db.query(
                func.avg(
                    func.extract("epoch", Case.last_update_at - Case.created_at) / 60.0
                )
            )
            .filter(
                Case.last_update_at.isnot(None),
                Case.created_at.isnot(None),
                Case.status.in_(COMPLETED_STATUSES),
                Case.last_update_at >= start,
                Case.last_update_at < end,
            )
            .scalar()
        )
        tma_value = float(tma_minutes) if tma_minutes is not None else 0.0

        sim_created = (
            db.query(func.count(Simulation.id))
            .filter(
                Simulation.created_at >= start,
                Simulation.created_at < end,
            )
            .scalar()
            or 0
        )

        sim_approved = (
            db.query(func.count(Simulation.id))
            .filter(
                Simulation.status == "approved",
                Simulation.updated_at >= start,
                Simulation.updated_at < end,
            )
            .scalar()
            or 0
        )

        conv_rate_value = _safe_ratio(sim_approved, sim_created)

        mtd_start = end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        ytd_start = end.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)

        contracts_mtd = (
            db.query(func.count(Contract.id))
            .filter(
                Contract.status.in_(ACTIVE_CONTRACT_STATUSES),
                Contract.created_at >= mtd_start,
                Contract.created_at < end,
            )
            .scalar()
            or 0
        )

        consultoria_mtd = (
            db.query(func.sum(Simulation.custo_consultoria_liquido))
            .join(Case, Case.last_simulation_id == Simulation.id)
            .join(Contract, Contract.case_id == Case.id)
            .filter(
                Contract.status.in_(ACTIVE_CONTRACT_STATUSES),
                Contract.created_at >= mtd_start,
                Contract.created_at < end,
                Simulation.status == "approved",
            )
            .scalar()
        )
        consultoria_mtd_value = _to_float(consultoria_mtd)

        consultoria_ytd = (
            db.query(func.sum(Simulation.custo_consultoria_liquido))
            .join(Case, Case.last_simulation_id == Simulation.id)
            .join(Contract, Contract.case_id == Case.id)
            .filter(
                Contract.status.in_(ACTIVE_CONTRACT_STATUSES),
                Contract.created_at >= ytd_start,
                Contract.created_at < end,
                Simulation.status == "approved",
            )
            .scalar()
        )
        consultoria_ytd_value = _to_float(consultoria_ytd)

        receita_auto_mtd_value = consultoria_mtd_value * 0.86

        finance_income_mtd = (
            db.query(func.sum(FinanceIncome.amount))
            .filter(
                FinanceIncome.date >= mtd_start,
                FinanceIncome.date < end,
            )
            .scalar()
        )

        # Impostos lançados no período (contabilizados como receita)
        total_tax_mtd = (
            db.query(func.sum(FinanceExpense.amount))
            .filter(
                FinanceExpense.date >= mtd_start,
                FinanceExpense.date < end,
                FinanceExpense.expense_type == "Impostos"
            )
            .scalar()
        )

        # Despesas operacionais (excluindo impostos)
        finance_expense_mtd = (
            db.query(func.sum(FinanceExpense.amount))
            .filter(
                FinanceExpense.date >= mtd_start,
                FinanceExpense.date < end,
                FinanceExpense.expense_type != "Impostos"
            )
            .scalar()
        )

        # Regra de caixa: imposto provisionado entra como receita no mês do lançamento
        # Resultado = Receitas + Impostos - Despesas Operacionais
        resultado_mtd_value = (
            _to_float(finance_income_mtd) +
            _to_float(total_tax_mtd) -
            _to_float(finance_expense_mtd)
        )

        # Novos KPIs mais precisos
        # Casos finalizados no período
        att_completed = (
            db.query(func.count(Case.id))
            .filter(
                Case.status.in_(COMPLETED_STATUSES),
                Case.last_update_at >= start,
                Case.last_update_at < end,
            )
            .scalar()
        )
        
        # Taxa de finalização (casos finalizados / casos criados)
        att_created_period = (
            db.query(func.count(Case.id))
            .filter(
                Case.created_at >= start,
                Case.created_at < end,
            )
            .scalar()
        )
        completion_rate = (
            float(att_completed) / float(att_created_period) 
            if att_created_period and att_created_period > 0 
            else 0.0
        )
        
        # Casos em atraso (SLA vencido)
        att_overdue = (
            db.query(func.count(Case.id))
            .filter(
                Case.assignment_expires_at.isnot(None),
                Case.assignment_expires_at < func.now(),
                Case.status.in_(ATT_IN_PROGRESS_STATUSES),
            )
            .scalar()
        )

    return {
        "att_open": int(att_open),
        "att_in_progress": int(att_in_progress),
        "att_completed": int(att_completed or 0),
        "att_overdue": int(att_overdue or 0),
        "att_sla_72h": round(sla_ratio_value, 4),
        "att_tma_min": round(tma_value, 2),
        "completion_rate": round(completion_rate, 4),
        "sim_created": int(sim_created),
        "sim_approved": int(sim_approved),
        "conv_rate": round(conv_rate_value, 4),
        "contracts_mtd": int(contracts_mtd),
        "consultoria_liq_mtd": round(consultoria_mtd_value, 2),
        "consultoria_liq_ytd": round(consultoria_ytd_value, 2),
        "receita_auto_mtd": round(receita_auto_mtd_value, 2),
        "resultado_mtd": round(resultado_mtd_value, 2),
    }

@ttl_cache(60)
def _get_series_cached(start_key: str, end_key: str, bucket: str) -> Dict[str, Any]:
    start = datetime.fromisoformat(start_key)
    end = datetime.fromisoformat(end_key)
    buckets: Dict[str, Dict[str, Any]] = {}

    def register(period_dt: datetime, key: str, value: Any, as_float: bool = False) -> None:
        iso = _serialize_dt(period_dt)
        if iso is None:
            return
        entry = buckets.setdefault(iso, {"date": iso})
        if as_float:
            entry[key] = round(_to_float(value), 2)
        else:
            entry[key] = _to_int(value)

    with SessionLocal() as db:
        period_cases = func.date_trunc(bucket, Case.created_at).label("period")
        for period, count in (
            db.query(period_cases, func.count(Case.id))
            .filter(
                Case.created_at >= start,
                Case.created_at < end,
            )
            .group_by(period_cases)
            .order_by(period_cases)
        ):
            register(period, "cases_created", count)

        period_sims = func.date_trunc(bucket, Simulation.created_at).label("period")
        for period, count in (
            db.query(period_sims, func.count(Simulation.id))
            .filter(
                Simulation.created_at >= start,
                Simulation.created_at < end,
            )
            .group_by(period_sims)
            .order_by(period_sims)
        ):
            register(period, "simulations_created", count)

        period_sims_approved = func.date_trunc(bucket, Simulation.updated_at).label(
            "period"
        )
        for period, count in (
            db.query(period_sims_approved, func.count(Simulation.id))
            .filter(
                Simulation.status == "approved",
                Simulation.updated_at >= start,
                Simulation.updated_at < end,
            )
            .group_by(period_sims_approved)
            .order_by(period_sims_approved)
        ):
            register(period, "simulations_approved", count)

        period_contracts = func.date_trunc(bucket, Contract.created_at).label("period")
        for period, count in (
            db.query(period_contracts, func.count(Contract.id))
            .filter(
                Contract.status.in_(ACTIVE_CONTRACT_STATUSES),
                Contract.created_at >= start,
                Contract.created_at < end,
            )
            .group_by(period_contracts)
            .order_by(period_contracts)
        ):
            register(period, "contracts_active", count)

        period_income = func.date_trunc(bucket, FinanceIncome.date).label("period")
        for period, total in (
            db.query(period_income, func.coalesce(func.sum(FinanceIncome.amount), 0))
            .filter(
                FinanceIncome.date >= start,
                FinanceIncome.date < end,
            )
            .group_by(period_income)
            .order_by(period_income)
        ):
            register(period, "finance_receita", total, as_float=True)

        # Despesas operacionais (excluindo impostos)
        period_expense = func.date_trunc(bucket, FinanceExpense.date).label("period")
        for period, total in (
            db.query(period_expense, func.coalesce(func.sum(FinanceExpense.amount), 0))
            .filter(
                FinanceExpense.date >= start,
                FinanceExpense.date < end,
                FinanceExpense.expense_type != "Impostos"
            )
            .group_by(period_expense)
            .order_by(period_expense)
        ):
            register(period, "finance_despesas", total, as_float=True)

        # Comissões específicas
        period_commissions = func.date_trunc(bucket, FinanceExpense.date).label("period")
        for period, total in (
            db.query(period_commissions, func.coalesce(func.sum(FinanceExpense.amount), 0))
            .filter(
                FinanceExpense.date >= start,
                FinanceExpense.date < end,
                FinanceExpense.expense_type == "Comissão"
            )
            .group_by(period_commissions)
            .order_by(period_commissions)
        ):
            register(period, "finance_comissoes", total, as_float=True)

        # Impostos específicos (contabilizados como receita)
        period_taxes = func.date_trunc(bucket, FinanceExpense.date).label("period")
        for period, total in (
            db.query(period_taxes, func.coalesce(func.sum(FinanceExpense.amount), 0))
            .filter(
                FinanceExpense.date >= start,
                FinanceExpense.date < end,
                FinanceExpense.expense_type == "Impostos"
            )
            .group_by(period_taxes)
            .order_by(period_taxes)
        ):
            register(period, "finance_impostos", total, as_float=True)

    # Regra de caixa: imposto provisionado entra como receita no mês do lançamento
    for entry in buckets.values():
        receita = entry.get("finance_receita", 0.0)
        despesas = entry.get("finance_despesas", 0.0)
        impostos = entry.get("finance_impostos", 0.0)
        # Resultado = Receitas + Impostos - Despesas Operacionais
        entry["finance_resultado"] = round(
            _to_float(receita) + _to_float(impostos) - _to_float(despesas), 2
        )

    ordered = sorted(buckets.values(), key=lambda item: item["date"])
    return {"bucket": bucket, "series": ordered}

@ttl_cache(60)
def _get_funnel_cached(start_key: str, end_key: str) -> Dict[str, Any]:
    start = datetime.fromisoformat(start_key)
    end = datetime.fromisoformat(end_key)
    with SessionLocal() as db:
        clients_count = (
            db.query(func.count(func.distinct(Case.client_id)))
            .filter(
                Case.created_at >= start,
                Case.created_at < end,
            )
            .scalar()
            or 0
        )
        cases_count = (
            db.query(func.count(Case.id))
            .filter(
                Case.created_at >= start,
                Case.created_at < end,
            )
            .scalar()
            or 0
        )
        simulations_count = (
            db.query(func.count(Simulation.id))
            .filter(
                Simulation.created_at >= start,
                Simulation.created_at < end,
            )
            .scalar()
            or 0
        )
        approved_count = (
            db.query(func.count(Simulation.id))
            .filter(
                Simulation.status == "approved",
                Simulation.updated_at >= start,
                Simulation.updated_at < end,
            )
            .scalar()
            or 0
        )
        disbursed_count = (
            db.query(func.count(CaseEvent.id))
            .filter(
                CaseEvent.type == "finance.disbursed",
                CaseEvent.created_at >= start,
                CaseEvent.created_at < end,
            )
            .scalar()
            or 0
        )
        contracts_count = (
            db.query(func.count(Contract.id))
            .filter(
                Contract.status.in_(ACTIVE_CONTRACT_STATUSES),
                Contract.created_at >= start,
                Contract.created_at < end,
            )
            .scalar()
            or 0
        )

    steps_raw = [
        ("clients", "Clientes", clients_count),
        ("cases", "Casos", cases_count),
        ("simulations", "Simulacoes", simulations_count),
        ("approved", "Simulacoes Aprovadas", approved_count),
        ("disbursed", "Liberacoes", disbursed_count),
        ("contracts", "Contratos", contracts_count),
    ]

    steps = []
    previous_value = None
    for key, label, value in steps_raw:
        conversion = None
        if previous_value not in (None, 0):
            conversion = round(_safe_ratio(value, previous_value), 4)
        steps.append(
            {
                "key": key,
                "label": label,
                "value": int(value),
                "conversion": conversion,
            }
        )
        previous_value = value

    return {"steps": steps}

@ttl_cache(60)
def _get_modules_cached(start_key: str, end_key: str, bucket: str) -> Dict[str, Any]:
    start = datetime.fromisoformat(start_key)
    end = datetime.fromisoformat(end_key)

    def rows_to_series(rows):
        series = []
        for period, count in rows:
            iso = _serialize_dt(period)
            if iso is None:
                continue
            series.append({"date": iso, "value": _to_int(count)})
        return series

    modules: Dict[str, Any] = {}

    with SessionLocal() as db:
        # Atendimento
        period_cases = func.date_trunc(bucket, Case.created_at).label("period")
        atendimento_rows = (
            db.query(period_cases, func.count(Case.id))
            .filter(
                Case.created_at >= start,
                Case.created_at < end,
            )
            .group_by(period_cases)
            .order_by(period_cases)
            .all()
        )
        atendimento_series = rows_to_series(atendimento_rows)
        atendimento_volume = sum(item["value"] for item in atendimento_series)
        atendimento_errors = (
            db.query(func.count(Case.id))
            .filter(
                Case.status.in_(["cancelado", "devolvido_financeiro"]),
                Case.last_update_at.isnot(None),
                Case.last_update_at >= start,
                Case.last_update_at < end,
            )
            .scalar()
            or 0
        )
        atendimento_total = (
            db.query(func.count(Case.id))
            .filter(
                Case.created_at >= start,
                Case.created_at < end,
            )
            .scalar()
            or 0
        )
        atendimento_error_rate = _safe_ratio(atendimento_errors, atendimento_total)
        atendimento_top_rows = (
            db.query(Case.entidade, func.count(Case.id))
            .filter(
                Case.entidade.isnot(None),
                Case.created_at >= start,
                Case.created_at < end,
            )
            .group_by(Case.entidade)
            .order_by(func.count(Case.id).desc())
            .limit(5)
            .all()
        )
        atendimento_top = [
            {"name": bank or "Unknown", "value": _to_int(count)}
            for bank, count in atendimento_top_rows
        ]
        modules["atendimento"] = {
            "series": atendimento_series,
            "metrics": {
                "volume": atendimento_volume,
                "error_rate": round(atendimento_error_rate, 4),
            },
            "top_entities": atendimento_top,
        }

        # Calculista
        period_sim = func.date_trunc(bucket, Simulation.created_at).label("period")
        calculista_rows = (
            db.query(period_sim, func.count(Simulation.id))
            .filter(
                Simulation.created_at >= start,
                Simulation.created_at < end,
            )
            .group_by(period_sim)
            .order_by(period_sim)
            .all()
        )
        calculista_series = rows_to_series(calculista_rows)
        calculista_volume = sum(item["value"] for item in calculista_series)
        calculista_processed = (
            db.query(func.count(Simulation.id))
            .filter(
                Simulation.status.in_(["approved", "rejected"]),
                Simulation.updated_at >= start,
                Simulation.updated_at < end,
            )
            .scalar()
            or 0
        )
        calculista_rejected = (
            db.query(func.count(Simulation.id))
            .filter(
                Simulation.status == "rejected",
                Simulation.updated_at >= start,
                Simulation.updated_at < end,
            )
            .scalar()
            or 0
        )
        calculista_error_rate = _safe_ratio(calculista_rejected, calculista_processed)
        calculista_top_rows = (
            db.query(Case.entidade, func.count(Simulation.id))
            .join(Case, Case.id == Simulation.case_id)
            .filter(
                Simulation.created_at >= start,
                Simulation.created_at < end,
                Case.entidade.isnot(None),
            )
            .group_by(Case.entidade)
            .order_by(func.count(Simulation.id).desc())
            .limit(5)
            .all()
        )
        calculista_top = [
            {"name": bank or "Unknown", "value": _to_int(count)}
            for bank, count in calculista_top_rows
        ]
        modules["calculista"] = {
            "series": calculista_series,
            "metrics": {
                "volume": calculista_volume,
                "error_rate": round(calculista_error_rate, 4),
            },
            "top_entities": calculista_top,
        }

        # Financeiro
        period_finance = func.date_trunc(bucket, CaseEvent.created_at).label("period")
        financeiro_rows = (
            db.query(period_finance, func.count(CaseEvent.id))
            .filter(
                CaseEvent.type == "finance.disbursed",
                CaseEvent.created_at >= start,
                CaseEvent.created_at < end,
            )
            .group_by(period_finance)
            .order_by(period_finance)
            .all()
        )
        financeiro_series = rows_to_series(financeiro_rows)
        financeiro_volume = sum(item["value"] for item in financeiro_series)
        financeiro_cancelled = (
            db.query(func.count(CaseEvent.id))
            .filter(
                CaseEvent.type == "finance.cancelled",
                CaseEvent.created_at >= start,
                CaseEvent.created_at < end,
            )
            .scalar()
            or 0
        )
        financeiro_total_events = (
            db.query(func.count(CaseEvent.id))
            .filter(
                CaseEvent.type.in_(["finance.disbursed", "finance.cancelled"]),
                CaseEvent.created_at >= start,
                CaseEvent.created_at < end,
            )
            .scalar()
            or 0
        )
        financeiro_error_rate = _safe_ratio(
            financeiro_cancelled, financeiro_total_events
        )
        financeiro_top_rows = (
            db.query(Case.entidade, func.count(Contract.id))
            .join(Case, Case.id == Contract.case_id)
            .filter(
                Contract.status.in_(ACTIVE_CONTRACT_STATUSES),
                Contract.created_at >= start,
                Contract.created_at < end,
                Case.entidade.isnot(None),
            )
            .group_by(Case.entidade)
            .order_by(func.count(Contract.id).desc())
            .limit(5)
            .all()
        )
        financeiro_top = [
            {"name": bank or "Unknown", "value": _to_int(count)}
            for bank, count in financeiro_top_rows
        ]
        modules["financeiro"] = {
            "series": financeiro_series,
            "metrics": {
                "volume": financeiro_volume,
                "error_rate": round(financeiro_error_rate, 4),
            },
            "top_entities": financeiro_top,
        }

        # Importacao
        import_series_map: Dict[str, int] = defaultdict(int)

        period_import = func.date_trunc(bucket, ImportBatch.generated_at).label("period")
        for period, count in (
            db.query(period_import, func.count(ImportBatch.id))
            .filter(
                ImportBatch.generated_at.isnot(None),
                ImportBatch.generated_at >= start,
                ImportBatch.generated_at < end,
            )
            .group_by(period_import)
            .order_by(period_import)
        ):
            iso = _serialize_dt(period)
            if iso:
                import_series_map[iso] += _to_int(count)

        period_payroll = func.date_trunc(bucket, PayrollImportBatch.processed_at).label(
            "period"
        )
        for period, count in (
            db.query(period_payroll, func.count(PayrollImportBatch.id))
            .filter(
                PayrollImportBatch.processed_at.isnot(None),
                PayrollImportBatch.processed_at >= start,
                PayrollImportBatch.processed_at < end,
            )
            .group_by(period_payroll)
            .order_by(period_payroll)
        ):
            iso = _serialize_dt(period)
            if iso:
                import_series_map[iso] += _to_int(count)

        import_series = [
            {"date": date, "value": value}
            for date, value in sorted(import_series_map.items(), key=lambda item: item[0])
        ]
        import_volume = sum(item["value"] for item in import_series)

        error_totals = (
            db.query(
                func.coalesce(func.sum(ImportBatch.error_lines), 0),
                func.coalesce(func.sum(ImportBatch.total_lines), 0),
            )
            .filter(
                ImportBatch.generated_at.isnot(None),
                ImportBatch.generated_at >= start,
                ImportBatch.generated_at < end,
            )
            .first()
        )
        error_lines = _to_float(error_totals[0]) if error_totals else 0.0
        total_lines = _to_float(error_totals[1]) if error_totals else 0.0
        import_error_rate = _safe_ratio(error_lines, total_lines)

        import_top_map = defaultdict(int)
        for name, count in (
            db.query(ImportBatch.entity_name, func.count(ImportBatch.id))
            .filter(
                ImportBatch.generated_at.isnot(None),
                ImportBatch.generated_at >= start,
                ImportBatch.generated_at < end,
                ImportBatch.entity_name.isnot(None),
            )
            .group_by(ImportBatch.entity_name)
            .order_by(func.count(ImportBatch.id).desc())
            .limit(5)
        ):
            import_top_map[name or "Unknown"] += _to_int(count)
        for name, count in (
            db.query(PayrollImportBatch.entidade_name, func.count(PayrollImportBatch.id))
            .filter(
                PayrollImportBatch.processed_at.isnot(None),
                PayrollImportBatch.processed_at >= start,
                PayrollImportBatch.processed_at < end,
                PayrollImportBatch.entidade_name.isnot(None),
            )
            .group_by(PayrollImportBatch.entidade_name)
            .order_by(func.count(PayrollImportBatch.id).desc())
            .limit(5)
        ):
            import_top_map[name or "Unknown"] += _to_int(count)

        import_top = [
            {"name": name, "value": count}
            for name, count in sorted(
                import_top_map.items(), key=lambda item: item[1], reverse=True
            )[:5]
        ]

        modules["importacao"] = {
            "series": import_series,
            "metrics": {
                "volume": import_volume,
                "error_rate": round(import_error_rate, 4),
            },
            "top_entities": import_top,
        }

    return {"bucket": bucket, "modules": modules}

@ttl_cache(30)
def _get_health_cached() -> Dict[str, Any]:
    now = now_brt().replace(microsecond=0)
    horizon = now + timedelta(hours=2)
    with SessionLocal() as db:
        available = (
            db.query(func.count(Case.id))
            .filter(Case.status.in_(ATT_OPEN_STATUSES))
            .scalar()
            or 0
        )
        assigned = (
            db.query(func.count(Case.id))
            .filter(
                Case.assigned_user_id.isnot(None),
                Case.assignment_expires_at.isnot(None),
                Case.assignment_expires_at > now,
            )
            .scalar()
            or 0
        )
        expiring = (
            db.query(func.count(Case.id))
            .filter(
                Case.assigned_user_id.isnot(None),
                Case.assignment_expires_at.isnot(None),
                Case.assignment_expires_at > now,
                Case.assignment_expires_at <= horizon,
            )
            .scalar()
            or 0
        )
        expired = (
            db.query(func.count(Case.id))
            .filter(
                Case.assigned_user_id.isnot(None),
                Case.assignment_expires_at.isnot(None),
                Case.assignment_expires_at <= now,
            )
            .scalar()
            or 0
        )
        scheduler_last_run = (
            db.query(func.max(CaseEvent.created_at))
            .filter(CaseEvent.type == "case.auto_expired")
            .scalar()
        )
        scheduler_processed = (
            db.query(func.count(CaseEvent.id))
            .filter(
                CaseEvent.type == "case.auto_expired",
                CaseEvent.created_at >= now - timedelta(days=1),
            )
            .scalar()
            or 0
        )

    return {
        "generated_at": _serialize_dt(now),
        "queue": {
            "available": int(available),
            "assigned": int(assigned),
            "expiring": int(expiring),
            "expired": int(expired),
        },
        "scheduler": {
            "pending_jobs": int(expired),
            "processed_last_24h": int(scheduler_processed),
            "last_run_at": _serialize_dt(scheduler_last_run),
        },
        "errors": {
            "http_4xx": 0,
            "http_5xx": 0,
            "note": "TODO: instrument HTTP error aggregation/log ingestion.",
        },
    }

def _build_cases_export(
    db: Session, start: datetime, end: datetime
) -> Tuple[list[dict], list[str]]:
    rows = (
        db.query(
            Case.id,
            Case.status,
            Case.created_at,
            Case.last_update_at,
            Case.entidade,
            Client.name.label("client_name"),
            Client.cpf.label("client_cpf"),
            User.name.label("assigned_to"),
            Contract.status.label("contract_status"),
            Contract.total_amount.label("contract_total"),
        )
        .join(Client, Client.id == Case.client_id)
        .outerjoin(User, User.id == Case.assigned_user_id)
        .outerjoin(Contract, Contract.case_id == Case.id)
        .filter(
            Case.created_at >= start,
            Case.created_at < end,
        )
        .order_by(Case.created_at)
        .all()
    )
    data = [
        {
            "case_id": row.id,
            "status": row.status,
            "created_at": _serialize_dt(row.created_at),
            "last_update_at": _serialize_dt(row.last_update_at),
            "entidade": row.entidade or "",
            "client_name": row.client_name,
            "client_cpf": row.client_cpf,
            "assigned_to": row.assigned_to or "",
            "contract_status": row.contract_status or "",
            "contract_total": _format_money(row.contract_total),
        }
        for row in rows
    ]
    columns = [
        "case_id",
        "status",
        "created_at",
        "last_update_at",
        "entidade",
        "client_name",
        "client_cpf",
        "assigned_to",
        "contract_status",
        "contract_total",
    ]
    return data, columns


def _build_simulations_export(
    db: Session, start: datetime, end: datetime
) -> Tuple[list[dict], list[str]]:
    rows = (
        db.query(
            Simulation.id,
            Simulation.case_id,
            Simulation.status,
            Simulation.created_at,
            Simulation.updated_at,
            Simulation.total_financiado,
            Simulation.valor_liquido,
            Simulation.custo_consultoria_liquido,
            User.name.label("created_by"),
        )
        .outerjoin(User, User.id == Simulation.created_by)
        .filter(
            Simulation.created_at >= start,
            Simulation.created_at < end,
        )
        .order_by(Simulation.created_at)
        .all()
    )
    data = [
        {
            "simulation_id": row.id,
            "case_id": row.case_id,
            "status": row.status,
            "created_at": _serialize_dt(row.created_at),
            "updated_at": _serialize_dt(row.updated_at),
            "total_financiado": _format_money(row.total_financiado),
            "valor_liquido": _format_money(row.valor_liquido),
            "consultoria_liquida": _format_money(row.custo_consultoria_liquido),
            "created_by": row.created_by or "",
        }
        for row in rows
    ]
    columns = [
        "simulation_id",
        "case_id",
        "status",
        "created_at",
        "updated_at",
        "total_financiado",
        "valor_liquido",
        "consultoria_liquida",
        "created_by",
    ]
    return data, columns


def _build_contracts_export(
    db: Session, start: datetime, end: datetime
) -> Tuple[list[dict], list[str]]:
    rows = (
        db.query(
            Contract.id,
            Contract.case_id,
            Contract.status,
            Contract.total_amount,
            Contract.disbursed_at,
            Contract.created_at,
            Case.entidade,
        )
        .join(Case, Case.id == Contract.case_id)
        .filter(
            Contract.created_at >= start,
            Contract.created_at < end,
        )
        .order_by(Contract.created_at)
        .all()
    )
    data = [
        {
            "contract_id": row.id,
            "case_id": row.case_id,
            "status": row.status,
            "created_at": _serialize_dt(row.created_at),
            "disbursed_at": _serialize_dt(row.disbursed_at),
            "total_amount": _format_money(row.total_amount),
            "entidade": row.entidade or "",
        }
        for row in rows
    ]
    columns = [
        "contract_id",
        "case_id",
        "status",
        "created_at",
        "disbursed_at",
        "total_amount",
        "entidade",
    ]
    return data, columns


def _build_finance_series_export(
    start_key: str, end_key: str
) -> Tuple[list[dict], list[str]]:
    series_data = _get_series_cached(start_key, end_key, "day")["series"]
    rows = [
        {
            "date": item["date"],
            "finance_receita": _format_money(item.get("finance_receita", 0.0)),
            "finance_despesas": _format_money(item.get("finance_despesas", 0.0)),
            "finance_resultado": _format_money(item.get("finance_resultado", 0.0)),
        }
        for item in series_data
    ]
    columns = ["date", "finance_receita", "finance_despesas", "finance_resultado"]
    return rows, columns


def _build_funnel_export(
    start_key: str, end_key: str
) -> Tuple[list[dict], list[str]]:
    funnel_data = _get_funnel_cached(start_key, end_key)["steps"]
    rows = [
        {
            "stage": step["label"],
            "value": step["value"],
            "conversion": step["conversion"] if step["conversion"] is not None else "",
        }
        for step in funnel_data
    ]
    columns = ["stage", "value", "conversion"]
    return rows, columns

@r.get("/kpis")
def get_kpis(
    from_: Optional[str] = Query(None, alias="from"),
    to_: Optional[str] = Query(None, alias="to"),
    include_trends: bool = Query(True, description="Include trend calculations"),
    user=Depends(require_roles(*ALLOWED_ROLES)),
):
    if include_trends:
        start, end, prev_start, prev_end = _resolve_period_with_previous(from_, to_)
        data = _get_kpis_with_trends_cached(
            _cache_key(start), 
            _cache_key(end),
            _cache_key(prev_start),
            _cache_key(prev_end)
        )
        data["range"] = {
            "from": _serialize_dt(start), 
            "to": _serialize_dt(end),
            "prev_from": _serialize_dt(prev_start),
            "prev_to": _serialize_dt(prev_end)
        }
    else:
        start, end = _resolve_period(from_, to_)
        data = _get_kpis_cached(_cache_key(start), _cache_key(end))
        data["range"] = {"from": _serialize_dt(start), "to": _serialize_dt(end)}
    
    return data


@r.get("/series")
def get_series(
    from_: Optional[str] = Query(None, alias="from"),
    to_: Optional[str] = Query(None, alias="to"),
    bucket: Literal["day", "week", "month"] = Query("day"),
    user=Depends(require_roles(*ALLOWED_ROLES)),
):
    start, end = _resolve_period(from_, to_)
    data = _get_series_cached(_cache_key(start), _cache_key(end), bucket)
    data["range"] = {"from": _serialize_dt(start), "to": _serialize_dt(end)}
    return data


@r.get("/funnel")
def get_funnel(
    from_: Optional[str] = Query(None, alias="from"),
    to_: Optional[str] = Query(None, alias="to"),
    user=Depends(require_roles(*ALLOWED_ROLES)),
):
    start, end = _resolve_period(from_, to_)
    data = _get_funnel_cached(_cache_key(start), _cache_key(end))
    data["range"] = {"from": _serialize_dt(start), "to": _serialize_dt(end)}
    return data


@r.get("/by-module")
def get_by_module(
    from_: Optional[str] = Query(None, alias="from"),
    to_: Optional[str] = Query(None, alias="to"),
    bucket: Literal["day", "week", "month"] = Query("day"),
    user=Depends(require_roles(*ALLOWED_ROLES)),
):
    start, end = _resolve_period(from_, to_)
    data = _get_modules_cached(_cache_key(start), _cache_key(end), bucket)
    data["range"] = {"from": _serialize_dt(start), "to": _serialize_dt(end)}
    return data


@r.get("/health")
def get_health(user=Depends(require_roles(*ALLOWED_ROLES))):
    return _get_health_cached()


@r.get("/kpis/individual")
def get_individual_kpis(
    user_id: Optional[int] = Query(None),
    from_: Optional[str] = Query(None, alias="from"),
    to_: Optional[str] = Query(None, alias="to"),
    user=Depends(require_roles(*ALLOWED_ROLES)),
):
    """
    Retorna KPIs da esteira individual para um usuário específico ou todos os usuários.
    """
    start, end = _resolve_period(from_, to_)
    
    with SessionLocal() as db:
        # Base query para casos do usuário
        base_query = db.query(Case)
        if user_id:
            base_query = base_query.filter(Case.assigned_to == user_id)
        
        # Casos abertos
        att_open = base_query.filter(
            Case.status.in_(ATT_OPEN_STATUSES)
        ).count()
        
        # Casos em andamento
        att_in_progress = base_query.filter(
            Case.status.in_(ATT_IN_PROGRESS_STATUSES)
        ).count()
        
        # Casos finalizados no período
        att_completed = base_query.filter(
            Case.status.in_(COMPLETED_STATUSES),
            Case.last_update_at >= start,
            Case.last_update_at < end,
        ).count()
        
        # Casos em atraso
        att_overdue = base_query.filter(
            Case.assignment_expires_at.isnot(None),
            Case.assignment_expires_at < func.now(),
            Case.status.in_(ATT_IN_PROGRESS_STATUSES),
        ).count()
        
        # TMA individual
        tma_minutes = base_query.filter(
            Case.last_update_at.isnot(None),
            Case.created_at.isnot(None),
            Case.status.in_(COMPLETED_STATUSES),
            Case.last_update_at >= start,
            Case.last_update_at < end,
        ).with_entities(
            func.avg(func.extract("epoch", Case.last_update_at - Case.created_at) / 60.0)
        ).scalar()
        
        tma_value = float(tma_minutes) if tma_minutes is not None else 0.0
        
        # Taxa de finalização individual
        att_created_period = base_query.filter(
            Case.created_at >= start,
            Case.created_at < end,
        ).count()
        
        completion_rate = (
            float(att_completed) / float(att_created_period) 
            if att_created_period and att_created_period > 0 
            else 0.0
        )
        
        # Simulações criadas pelo usuário
        sim_query = db.query(Simulation)
        if user_id:
            sim_query = sim_query.filter(Simulation.created_by == user_id)
            
        sim_created = sim_query.filter(
            Simulation.created_at >= start,
            Simulation.created_at < end,
        ).count()
        
        # Simulações aprovadas
        sim_approved = sim_query.filter(
            Simulation.created_at >= start,
            Simulation.created_at < end,
            Simulation.status == "aprovado",
        ).count()
        
        # Taxa de conversão individual
        conv_rate_value = (
            float(sim_approved) / float(sim_created) 
            if sim_created and sim_created > 0 
            else 0.0
        )
        
        return {
            "user_id": user_id,
            "period": {"from": _serialize_dt(start), "to": _serialize_dt(end)},
            "att_open": att_open,
            "att_in_progress": att_in_progress,
            "att_completed": att_completed,
            "att_overdue": att_overdue,
            "att_tma_min": round(tma_value, 2),
            "completion_rate": round(completion_rate, 4),
            "sim_created": sim_created,
            "sim_approved": sim_approved,
            "conv_rate": round(conv_rate_value, 4),
        }


DatasetLiteral = Literal[
    "cases",
    "simulations",
    "contracts",
    "finance_series",
    "funnel",
]


@r.get("/agent-cases/{agent_id}")
def get_agent_cases(
    agent_id: int,
    from_: Optional[str] = Query(None, alias="from"),
    to_: Optional[str] = Query(None, alias="to"),
    status: Optional[str] = Query(None, description="Filter by case status"),
    user=Depends(require_roles(*ALLOWED_ROLES)),
):
    """
    Retorna todos os casos atribuídos a um agente específico.
    Permite filtrar por período e status.
    """
    start, end = _resolve_period(from_, to_)

    with SessionLocal() as db:
        # Verificar se o agente existe
        agent = db.query(User).filter(User.id == agent_id).first()
        if not agent:
            raise HTTPException(404, detail="Agent not found")

        # Query base de casos do agente
        # Considerar casos criados ou atualizados dentro do período para não perder movimentações
        time_filter = or_(
            and_(Case.created_at >= start, Case.created_at < end),
            and_(Case.last_update_at.isnot(None), Case.last_update_at >= start, Case.last_update_at < end),
        )

        query = (
            db.query(
                Case.id,
                Case.status,
                Case.created_at,
                Case.last_update_at,
                Client.name.label("client_name"),
                Client.cpf,
                Simulation.custo_consultoria_liquido,
            )
            .join(Client, Client.id == Case.client_id)
            .outerjoin(Simulation, Simulation.id == Case.last_simulation_id)
            .filter(
                Case.assigned_user_id == agent_id,
                time_filter,
            )
        )

        # Filtrar por status se fornecido
        if status:
            query = query.filter(Case.status == status)

        cases = query.order_by(Case.created_at.desc()).all()

        # Formatar resposta
        cases_data = [
            {
                "id": case.id,
                "status": case.status,
                "client_name": case.client_name,
                "client_cpf": case.cpf,
                "created_at": _serialize_dt(case.created_at),
                "last_update_at": _serialize_dt(case.last_update_at),
                "consultoria_liquida": float(case.custo_consultoria_liquido) if case.custo_consultoria_liquido else 0.0,
                "duration_hours": (
                    (case.last_update_at - case.created_at).total_seconds() / 3600
                    if case.last_update_at
                    else None
                ),
            }
            for case in cases
        ]

        return {
            "agent": {
                "id": agent.id,
                "name": agent.name,
                "email": agent.email,
            },
            "period": {"from": _serialize_dt(start), "to": _serialize_dt(end)},
            "total_cases": len(cases_data),
            "cases": cases_data,
        }


@r.get("/agent-metrics")
def get_agent_metrics(
    from_: Optional[str] = Query(None, alias="from"),
    to_: Optional[str] = Query(None, alias="to"),
    user=Depends(require_roles(*ALLOWED_ROLES)),
):
    """
    Retorna métricas detalhadas por agente (role=atendente).
    Inclui: TMA, casos efetivados, em atendimento, cancelados,
    consultoria líquida gerada e métricas de SLA (48h úteis).
    """
    start, end = _resolve_period(from_, to_)

    with SessionLocal() as db:
        # Buscar todos os atendentes
        agents = db.query(User).filter(User.role == "atendente", User.active == True).all()

        # SLA em horas úteis (48h = 2 dias úteis)
        sla_hours = 48

        agent_metrics_list = []
        total_cases_within_sla = 0
        total_cases_outside_sla = 0

        for agent in agents:
            # Casos atribuídos ao agente no período (considera criação OU última atualização no range)
            time_filter = or_(
                and_(Case.created_at >= start, Case.created_at < end),
                and_(Case.last_update_at.isnot(None), Case.last_update_at >= start, Case.last_update_at < end),
            )
            agent_cases = db.query(Case).filter(
                Case.assigned_user_id == agent.id,
                time_filter,
            )

            # Casos efetivados
            cases_efetivados = agent_cases.filter(
                Case.status == "contrato_efetivado"
            ).count()

            # Casos em atendimento (PROCESSING_STATUSES)
            cases_em_atendimento = agent_cases.filter(
                Case.status.in_(PROCESSING_STATUSES)
            ).count()

            # Casos cancelados/encerrados
            cases_cancelados = agent_cases.filter(
                Case.status.in_(["cancelado", "encerrado", "rejeitado"])
            ).count()

            # TMA (Tempo Médio de Atendimento) em minutos
            tma_result = agent_cases.filter(
                Case.last_update_at.isnot(None),
                Case.created_at.isnot(None),
                Case.status.in_(COMPLETED_STATUSES),
            ).with_entities(
                func.avg(func.extract("epoch", Case.last_update_at - Case.created_at) / 60.0)
            ).scalar()

            tma_minutes = float(tma_result) if tma_result else 0.0

            # Valor de consultoria líquida do agente (baseado no percentual do ContractAgent)
            consultoria_agente_result = (
                db.query(
                    func.sum(
                        Contract.consultoria_valor_liquido * ContractAgent.percentual / 100
                    )
                )
                .join(ContractAgent, ContractAgent.contract_id == Contract.id)
                .join(Case, Case.id == Contract.case_id)
                .filter(
                    ContractAgent.user_id == agent.id,
                    Contract.status.in_(["ativo", "encerrado"]),
                    Case.created_at >= start,
                    Case.created_at < end,
                )
                .scalar()
            )

            consultoria_liquida_agente = float(consultoria_agente_result) if consultoria_agente_result else 0.0

            # Percentual médio do agente nos contratos
            percentual_medio_result = (
                db.query(func.avg(ContractAgent.percentual))
                .join(Contract, Contract.id == ContractAgent.contract_id)
                .join(Case, Case.id == Contract.case_id)
                .filter(
                    ContractAgent.user_id == agent.id,
                    Contract.status.in_(["ativo", "encerrado"]),
                    Case.created_at >= start,
                    Case.created_at < end,
                )
                .scalar()
            )

            percentual_medio = float(percentual_medio_result) if percentual_medio_result else 0.0

            # Calcular SLA (48h úteis)
            # Casos dentro do SLA
            cases_within_sla = 0
            cases_outside_sla = 0

            all_agent_cases = agent_cases.all()
            for case in all_agent_cases:
                if case.created_at and case.last_update_at:
                    # Calcular diferença em horas (simplificado - não conta fins de semana)
                    delta_hours = (case.last_update_at - case.created_at).total_seconds() / 3600

                    # Ajustar para horas úteis (aproximação: remover ~33% para fins de semana)
                    business_hours = delta_hours * 0.67

                    if business_hours <= sla_hours:
                        cases_within_sla += 1
                    else:
                        cases_outside_sla += 1

            total_cases_within_sla += cases_within_sla
            total_cases_outside_sla += cases_outside_sla

            # Total de casos do agente
            total_cases = agent_cases.count()

            agent_metrics_list.append({
                "agent_id": agent.id,
                "agent_name": agent.name,
                "agent_email": agent.email,
                "tma_minutes": round(tma_minutes, 2),
                "cases_efetivados": cases_efetivados,
                "cases_em_atendimento": cases_em_atendimento,
                "cases_cancelados": cases_cancelados,
                "consultoria_liquida": round(consultoria_liquida_agente, 2),
                "percentual_medio": round(percentual_medio, 2),
                "total_cases": total_cases,
                "sla_within": cases_within_sla,
                "sla_outside": cases_outside_sla,
                "sla_percentage": round((cases_within_sla / total_cases * 100) if total_cases > 0 else 0, 2),
            })

        return {
            "period": {"from": _serialize_dt(start), "to": _serialize_dt(end)},
            "sla_hours": sla_hours,
            "total_sla": {
                "within_sla": total_cases_within_sla,
                "outside_sla": total_cases_outside_sla,
                "total_cases": total_cases_within_sla + total_cases_outside_sla,
                "percentage_within_sla": round(
                    (total_cases_within_sla / (total_cases_within_sla + total_cases_outside_sla) * 100)
                    if (total_cases_within_sla + total_cases_outside_sla) > 0
                    else 0,
                    2
                ),
            },
            "agents": agent_metrics_list,
        }


@r.get("/export.csv")
def export_csv(
    dataset: DatasetLiteral,
    from_: Optional[str] = Query(None, alias="from"),
    to_: Optional[str] = Query(None, alias="to"),
    user=Depends(require_roles(*ALLOWED_ROLES)),
):
    start, end = _resolve_period(from_, to_)
    start_key, end_key = _cache_key(start), _cache_key(end)

    if dataset == "cases":
        with SessionLocal() as db:
            data, columns = _build_cases_export(db, start, end)
    elif dataset == "simulations":
        with SessionLocal() as db:
            data, columns = _build_simulations_export(db, start, end)
    elif dataset == "contracts":
        with SessionLocal() as db:
            data, columns = _build_contracts_export(db, start, end)
    elif dataset == "finance_series":
        data, columns = _build_finance_series_export(start_key, end_key)
    elif dataset == "funnel":
        data, columns = _build_funnel_export(start_key, end_key)
    else:
        raise HTTPException(400, detail="Unsupported dataset.")

    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=columns)
    writer.writeheader()
    for row in data:
        writer.writerow(row)
    buffer.seek(0)

    filename = f"{dataset}-{start.date()}-{end.date()}.csv"
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@r.get("/sla-cases")
def get_sla_cases(
    from_: Optional[str] = Query(None, alias="from"),
    to_: Optional[str] = Query(None, alias="to"),
    sla_filter: Optional[str] = Query(None, description="Filter by SLA: within, outside"),
    status: Optional[str] = Query(None, description="Filter by case status"),
    limit: Optional[int] = Query(200, ge=1, le=500, description="Limit returned cases to avoid heavy payloads"),
    user=Depends(require_roles(*ALLOWED_ROLES)),
):
    """
    Retorna casos filtrados por SLA (dentro ou fora do SLA de 48h úteis).
    Permite filtrar por período e status.
    """
    start, end = _resolve_period(from_, to_)
    sla_hours = 48

    print(f"\n=== DEBUG SLA CASES ===")
    print(f"Period: {start} to {end}")
    print(f"SLA Filter: {sla_filter}")
    print(f"Status Filter: {status}")
    print(f"Limit: {limit}")

    applied_limit = min(limit or 200, 500)
    with SessionLocal() as db:
        # Query base de casos - inclui criação OU última atualização dentro do período
        time_filter = or_(
            and_(Case.created_at >= start, Case.created_at < end),
            and_(Case.last_update_at.isnot(None), Case.last_update_at >= start, Case.last_update_at < end),
        )

        query = (
            db.query(
                Case.id,
                Case.status,
                Case.created_at,
                Case.last_update_at,
                Case.assigned_user_id,
                Client.name.label("client_name"),
                Client.cpf,
                User.name.label("agent_name"),
                Simulation.custo_consultoria_liquido,
            )
            .join(Client, Client.id == Case.client_id)
            .outerjoin(User, User.id == Case.assigned_user_id)
            .outerjoin(Simulation, Simulation.id == Case.last_simulation_id)
            .filter(time_filter)
        )

        ordered_query = query.order_by(
            func.coalesce(Case.last_update_at, Case.created_at).desc()
        )
        total_time_filtered = ordered_query.count()
        print(f"Total cases from DB (after time filter): {total_time_filtered}")

        # Calcular SLA para cada caso e filtrar
        def _is_within_sla(created_at, last_update_at):
            """Calcula se o caso está dentro do SLA de 48h úteis"""
            if not created_at:
                return False

            # Se não tem last_update_at, usar datetime atual (caso em andamento)
            end_time = last_update_at if last_update_at else datetime.utcnow()

            current = created_at
            business_hours = 0

            # Calcular horas úteis entre created_at e end_time
            while current < end_time:
                # Pular fins de semana (sábado=5, domingo=6)
                if current.weekday() < 5:  # Segunda a Sexta
                    business_hours += 1
                current += timedelta(hours=1)

                # Parar se já ultrapassou o SLA
                if business_hours > sla_hours:
                    break

            return business_hours <= sla_hours

        cases_data = []
        within_count = 0
        outside_count = 0
        total_filtered_cases = 0

        for case in ordered_query.yield_per(200):
            within_sla = _is_within_sla(case.created_at, case.last_update_at)

            if within_sla:
                within_count += 1
            else:
                outside_count += 1

            # Aplicar filtro de SLA se fornecido
            if sla_filter == "within" and not within_sla:
                continue
            elif sla_filter == "outside" and within_sla:
                continue

            # Aplicar filtro de status DEPOIS do filtro de SLA
            if status and case.status != status:
                continue

            total_filtered_cases += 1

            # Respeitar limite de carga útil, mas continuar contando totais
            if len(cases_data) >= applied_limit:
                continue

            cases_data.append({
                "id": case.id,
                "status": case.status,
                "client_name": case.client_name,
                "client_cpf": case.cpf,
                "agent_name": case.agent_name,
                "created_at": _serialize_dt(case.created_at),
                "last_update_at": _serialize_dt(case.last_update_at),
                "consultoria_liquida": float(case.custo_consultoria_liquido) if case.custo_consultoria_liquido else 0.0,
                "duration_hours": (
                    (case.last_update_at - case.created_at).total_seconds() / 3600
                    if case.last_update_at
                    else None
                ),
                "within_sla": within_sla,
            })

        print(f"Cases within SLA: {within_count}")
        print(f"Cases outside SLA: {outside_count}")
        print(f"Cases returned after filters (capped to {applied_limit}): {len(cases_data)}")
        print(f"=== END DEBUG ===\n")

        return {
            "period": {"from": _serialize_dt(start), "to": _serialize_dt(end)},
            "total_cases": total_filtered_cases,
            "sla_filter": sla_filter,
            "cases": cases_data,
            "limit": applied_limit,
            "returned_cases": len(cases_data),
        }
