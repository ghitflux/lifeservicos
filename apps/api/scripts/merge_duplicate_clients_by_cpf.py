#!/usr/bin/env python3
"""
Varre e unifica clientes duplicados por CPF.

Regras:
- Um único cliente canônico por CPF.
- Se existir caso já atendido, ele define o cliente/caso principal.
- Casos novos duplicados são removidos.
- Casos já atendidos não são colapsados automaticamente entre si.

Uso:
  python3 scripts/merge_duplicate_clients_by_cpf.py
  python3 scripts/merge_duplicate_clients_by_cpf.py --cpf 82071799372
  python3 scripts/merge_duplicate_clients_by_cpf.py --apply
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable
from sqlalchemy import func

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.db import SessionLocal  # noqa: E402
from app.models import (  # noqa: E402
    Attachment,
    Case,
    CaseEvent,
    Client,
    ClientAddress,
    ClientPhone,
    ClientSiapeInfo,
    Comment,
    CommissionPayout,
    Contract,
    ContractAttachment,
    FinanceExpense,
    FinanceIncome,
    Payment,
    Simulation,
)

IGNORED_CASE_EVENT_TYPES = {
    "case.created",
    "case.payroll_updated",
}

CLIENT_DATA_FIELDS = [
    "name",
    "matricula",
    "orgao",
    "cargo",
    "telefone_preferencial",
    "numero_cliente",
    "observacoes",
    "banco",
    "agencia",
    "conta",
    "chave_pix",
    "tipo_chave_pix",
    "orgao_pgto_code",
    "orgao_pgto_name",
    "status_desconto",
    "status_legenda",
    "cpf_matricula",
]


@dataclass
class GroupStats:
    cpf: str
    duplicate_clients: int = 0
    moved_cases: int = 0
    deleted_new_cases: int = 0
    deleted_clients: int = 0
    merged_phones: int = 0
    merged_addresses: int = 0
    merged_siape_infos: int = 0
    kept_attended_cases: int = 0
    kept_new_case: int = 0


def is_truthy_text(value: str | None) -> bool:
    return bool(value and str(value).strip())


def unique_tags(values: Iterable[str] | None) -> list[str]:
    result: list[str] = []
    for value in values or []:
        if value and value not in result:
            result.append(value)
    return result


def client_completeness_score(client: Client) -> tuple:
    filled = sum(1 for field in CLIENT_DATA_FIELDS if getattr(client, field, None))
    created_at = client.created_at or datetime.min
    return (filled, created_at, client.id)


def case_priority(case: Case, flags: dict[str, bool]) -> tuple:
    last_update = case.last_update_at or case.created_at or datetime.min
    created_at = case.created_at or datetime.min
    return (
        int(flags["has_contract"]),
        int(case.status != "novo"),
        int(flags["attended"]),
        int(case.assigned_user_id is not None),
        int(case.assigned_at is not None),
        int(flags["has_simulation"]),
        int(flags["has_comment"]),
        int(flags["has_attachment"]),
        int(flags["has_meaningful_event"]),
        int(flags["history_non_empty"]),
        last_update,
        created_at,
        case.id,
    )


def load_case_flags(db, cases: list[Case]) -> dict[int, dict[str, bool]]:
    case_ids = [case.id for case in cases]
    if not case_ids:
        return {}

    contract_case_ids = {
        case_id for (case_id,) in db.query(Contract.case_id).filter(Contract.case_id.in_(case_ids)).all()
    }
    simulation_case_ids = {
        case_id for (case_id,) in db.query(Simulation.case_id).filter(Simulation.case_id.in_(case_ids)).all()
    }
    attachment_case_ids = {
        case_id for (case_id,) in db.query(Attachment.case_id).filter(Attachment.case_id.in_(case_ids)).all()
    }
    comment_case_ids = {
        case_id
        for (case_id,) in (
            db.query(Comment.case_id)
            .filter(Comment.case_id.in_(case_ids), Comment.deleted_at.is_(None))
            .all()
        )
    }
    event_case_ids = {
        case_id
        for (case_id,) in (
            db.query(CaseEvent.case_id)
            .filter(
                CaseEvent.case_id.in_(case_ids),
                ~CaseEvent.type.in_(IGNORED_CASE_EVENT_TYPES),
            )
            .distinct()
            .all()
        )
    }

    flags_by_case: dict[int, dict[str, bool]] = {}
    for case in cases:
        history_non_empty = case.assignment_history not in (None, [], {})
        has_contract = case.id in contract_case_ids
        has_simulation = case.id in simulation_case_ids
        has_attachment = case.id in attachment_case_ids
        has_comment = case.id in comment_case_ids
        has_meaningful_event = case.id in event_case_ids
        attended = any(
            [
                case.status != "novo",
                case.assigned_user_id is not None,
                case.assigned_at is not None,
                history_non_empty,
                has_contract,
                has_simulation,
                has_attachment,
                has_comment,
                has_meaningful_event,
            ]
        )
        flags_by_case[case.id] = {
            "history_non_empty": history_non_empty,
            "has_contract": has_contract,
            "has_simulation": has_simulation,
            "has_attachment": has_attachment,
            "has_comment": has_comment,
            "has_meaningful_event": has_meaningful_event,
            "attended": attended,
        }

    return flags_by_case


def choose_keeper_client(clients: list[Client], cases: list[Case], flags_by_case: dict[int, dict[str, bool]]) -> tuple[Client, list[Case], list[Case]]:
    attended_cases = [case for case in cases if flags_by_case.get(case.id, {}).get("attended")]
    new_cases = [case for case in cases if case not in attended_cases]

    keeper_case = None
    if attended_cases:
        keeper_case = max(attended_cases, key=lambda case: case_priority(case, flags_by_case[case.id]))
    elif new_cases:
        keeper_case = max(new_cases, key=lambda case: case_priority(case, flags_by_case[case.id]))

    if keeper_case is not None:
        keeper_client = next((client for client in clients if client.id == keeper_case.client_id), None)
        if keeper_client is not None:
            return keeper_client, attended_cases, new_cases

    keeper_client = max(clients, key=client_completeness_score)
    return keeper_client, attended_cases, new_cases


def merge_client_data(keeper: Client, duplicate: Client) -> None:
    if not keeper.name and duplicate.name:
        keeper.name = duplicate.name

    for field in CLIENT_DATA_FIELDS:
        if not getattr(keeper, field, None) and getattr(duplicate, field, None):
            setattr(keeper, field, getattr(duplicate, field))

    keeper.source_tags = unique_tags([*(keeper.source_tags or []), *(duplicate.source_tags or [])])


def merge_client_relations(db, keeper: Client, duplicate: Client, stats: GroupStats) -> None:
    existing_phones = {
        phone for (phone,) in db.query(ClientPhone.phone).filter(ClientPhone.client_id == keeper.id).all()
    }
    keeper_has_primary_phone = (
        db.query(ClientPhone.id)
        .filter(ClientPhone.client_id == keeper.id, ClientPhone.is_primary.is_(True))
        .first()
        is not None
    )

    for phone in db.query(ClientPhone).filter(ClientPhone.client_id == duplicate.id).all():
        if phone.phone in existing_phones:
            db.delete(phone)
            continue
        if phone.is_primary and keeper_has_primary_phone:
            phone.is_primary = False
        elif phone.is_primary:
            keeper_has_primary_phone = True
        phone.client_id = keeper.id
        existing_phones.add(phone.phone)
        stats.merged_phones += 1

    for address in db.query(ClientAddress).filter(ClientAddress.client_id == duplicate.id).all():
        address.client_id = keeper.id
        stats.merged_addresses += 1

    for siape_info in db.query(ClientSiapeInfo).filter(ClientSiapeInfo.client_id == duplicate.id).all():
        siape_info.client_id = keeper.id
        stats.merged_siape_infos += 1

    moved_cases = (
        db.query(Case)
        .filter(Case.client_id == duplicate.id)
        .update({Case.client_id: keeper.id}, synchronize_session=False)
    )
    stats.moved_cases += moved_cases


def delete_case_cascade(db, case: Case) -> None:
    commission = db.query(CommissionPayout).filter_by(case_id=case.id).first()
    if commission:
        if commission.expense_id:
            expense = db.query(FinanceExpense).filter_by(id=commission.expense_id).first()
            if expense:
                db.delete(expense)
        db.delete(commission)

    contract = db.query(Contract).filter_by(case_id=case.id).first()
    if contract:
        incomes_to_delete = []
        incomes_to_delete.extend(
            db.query(FinanceIncome)
            .filter(FinanceIncome.income_name.like(f"%Contrato #{contract.id}%"))
            .all()
        )
        unique_incomes = {income.id: income for income in incomes_to_delete}.values()
        for income in unique_incomes:
            db.delete(income)

        for attachment in db.query(ContractAttachment).filter_by(contract_id=contract.id).all():
            db.delete(attachment)

        db.query(Payment).filter_by(contract_id=contract.id).delete()
        db.delete(contract)

    db.query(ContractAttachment).filter_by(case_id=case.id).delete()

    if case.last_simulation_id:
        case.last_simulation_id = None
        db.flush()

    db.query(Simulation).filter_by(case_id=case.id).delete()
    db.query(Attachment).filter_by(case_id=case.id).delete()
    db.query(Comment).filter_by(case_id=case.id).delete()
    db.query(CaseEvent).filter_by(case_id=case.id).delete()
    db.delete(case)


def process_cpf(db, cpf: str, apply: bool) -> GroupStats:
    clients = (
        db.query(Client)
        .filter(Client.cpf == cpf)
        .order_by(Client.created_at.asc().nullsfirst(), Client.id.asc())
        .all()
    )
    stats = GroupStats(cpf=cpf, duplicate_clients=max(0, len(clients) - 1))

    if len(clients) <= 1:
        return stats

    client_ids = [client.id for client in clients]
    cases = db.query(Case).filter(Case.client_id.in_(client_ids)).order_by(Case.id.asc()).all()
    flags_by_case = load_case_flags(db, cases)
    keeper_client, attended_cases, new_cases = choose_keeper_client(clients, cases, flags_by_case)

    stats.kept_attended_cases = len(attended_cases)
    stats.kept_new_case = 1 if not attended_cases and new_cases else 0

    for duplicate in clients:
        if duplicate.id == keeper_client.id:
            continue
        merge_client_data(keeper_client, duplicate)
        merge_client_relations(db, keeper_client, duplicate, stats)
        db.flush()
        if apply:
            db.delete(duplicate)
        stats.deleted_clients += 1

    db.flush()

    cases_after_merge = (
        db.query(Case)
        .filter(Case.client_id == keeper_client.id)
        .order_by(Case.id.asc())
        .all()
    )
    flags_after_merge = load_case_flags(db, cases_after_merge)
    attended_after_merge = [case for case in cases_after_merge if flags_after_merge.get(case.id, {}).get("attended")]

    keeper_case_id = None
    if attended_after_merge:
        keeper_case = max(attended_after_merge, key=lambda case: case_priority(case, flags_after_merge[case.id]))
        keeper_case_id = keeper_case.id
        for case in cases_after_merge:
            if case.id == keeper_case_id:
                continue
            if not flags_after_merge.get(case.id, {}).get("attended"):
                if apply:
                    delete_case_cascade(db, case)
                stats.deleted_new_cases += 1
    else:
        if cases_after_merge:
            keeper_case = max(cases_after_merge, key=lambda case: case_priority(case, flags_after_merge[case.id]))
            keeper_case_id = keeper_case.id
            for case in cases_after_merge:
                if case.id == keeper_case_id:
                    continue
                if apply:
                    delete_case_cascade(db, case)
                stats.deleted_new_cases += 1

    if not apply:
        db.rollback()

    return stats


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cpf", help="Processa apenas um CPF específico")
    parser.add_argument("--limit", type=int, help="Limita a quantidade de CPFs processados")
    parser.add_argument("--apply", action="store_true", help="Aplica as mudanças na base")
    args = parser.parse_args()

    with SessionLocal() as db:
        duplicate_cpfs_query = (
            db.query(Client.cpf)
            .group_by(Client.cpf)
            .having(func.count(Client.id) > 1)
            .order_by(Client.cpf.asc())
        )
        if args.cpf:
            duplicate_cpfs_query = duplicate_cpfs_query.filter(Client.cpf == args.cpf)
        if args.limit:
            duplicate_cpfs_query = duplicate_cpfs_query.limit(args.limit)

        duplicate_cpfs = [cpf for (cpf,) in duplicate_cpfs_query.all()]
        if not duplicate_cpfs:
            print("Nenhum CPF duplicado encontrado para os filtros informados.")
            return 0

        aggregate = Counter()
        for cpf in duplicate_cpfs:
            stats = process_cpf(db, cpf, apply=args.apply)
            aggregate.update(
                {
                    "cpfs_processados": 1,
                    "duplicate_clients": stats.duplicate_clients,
                    "moved_cases": stats.moved_cases,
                    "deleted_new_cases": stats.deleted_new_cases,
                    "deleted_clients": stats.deleted_clients,
                    "merged_phones": stats.merged_phones,
                    "merged_addresses": stats.merged_addresses,
                    "merged_siape_infos": stats.merged_siape_infos,
                    "groups_with_attended_cases": 1 if stats.kept_attended_cases else 0,
                    "groups_without_attended_cases": 1 if (not stats.kept_attended_cases and stats.kept_new_case) else 0,
                }
            )
            if args.apply:
                db.commit()

        mode = "APPLY" if args.apply else "DRY-RUN"
        print(f"[{mode}] Resultado do merge por CPF")
        for key in sorted(aggregate):
            print(f"{key}={aggregate[key]}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
