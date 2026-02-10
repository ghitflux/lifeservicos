from fastapi import (  # pyright: ignore[reportMissingImports]
    APIRouter,
    Depends,
    HTTPException,
    UploadFile,
    File,
)
from fastapi.responses import Response  # pyright: ignore[reportMissingImports]
from pydantic import BaseModel  # pyright: ignore[reportMissingImports]
from datetime import datetime
from sqlalchemy.orm import joinedload  # pyright: ignore[reportMissingImports]
from ..db import SessionLocal
from ..models import Case, CaseEvent, Contract, now_brt, MobileSimulation, FinanceIncome, FinanceExpense, User
from ..rbac import require_roles
from ..events import eventbus
from ..config import settings
import io
import csv
import os
import shutil
from decimal import Decimal

r = APIRouter(prefix="/finance", tags=["finance"])


@r.get("/queue")
def queue(user=Depends(require_roles("admin", "supervisor", "financeiro"))):
    from sqlalchemy.orm import (  # pyright: ignore[reportMissingImports]
        joinedload
    )
    from ..models import Simulation, Attachment, ContractAttachment
    with SessionLocal() as db:
        # Buscar todos os casos relevantes para o módulo financeiro
        # Inclui: pendentes (enviados pelo calculista), efetivados e cancelados
        # 'fechamento_aprovado' removido - casos chegam após calculista
        financial_statuses = [
            "financeiro_pendente",
            "contrato_efetivado",
            "contrato_cancelado",
            "caso_cancelado"
        ]
        rows = db.query(Case).options(
            joinedload(Case.client),
            joinedload(Case.last_simulation)
        ).filter(Case.status.in_(financial_statuses)).order_by(
            Case.last_update_at.desc()
        ).all()

        items = []
        for c in rows:
            # Buscar simulação aprovada
            simulation_data = None
            if c.last_simulation_id:
                sim = db.get(Simulation, c.last_simulation_id)
                if sim and sim.status == "approved":
                    simulation_data = {
                        "id": sim.id,
                        "status": sim.status,
                        "totals": {
                            "valorParcelaTotal": float(
                                sim.valor_parcela_total or 0
                            ),
                            "saldoTotal": float(
                                sim.saldo_total or 0
                            ),
                            "liberadoTotal": float(
                                sim.liberado_total or 0
                            ),
                            "seguroObrigatorio": float(sim.seguro or 0),
                            "totalFinanciado": float(
                                sim.total_financiado or 0
                            ),
                            "valorLiquido": float(sim.valor_liquido or 0),
                            "custoConsultoria": float(
                                sim.custo_consultoria or 0
                            ),
                            "liberadoCliente": float(
                                sim.liberado_cliente or 0
                            )
                        },
                        "banks": sim.banks_json,
                        "prazo": sim.prazo,
                        "percentualConsultoria": float(
                            sim.percentual_consultoria or 0
                        )
                    }

            item = {
                "id": c.id,
                "client_id": c.client_id,
                "status": c.status,
                "assigned_user_id": c.assigned_user_id,
                "client": {
                    "id": c.client.id,
                    "name": c.client.name,
                    "cpf": c.client.cpf,
                    "matricula": c.client.matricula,
                    "banco": c.client.banco,
                    "agencia": c.client.agencia,
                    "conta": c.client.conta,
                    "chave_pix": c.client.chave_pix,
                    "tipo_chave_pix": c.client.tipo_chave_pix
                },
                "simulation": simulation_data
            }

            # Buscar contrato se existir para incluir anexos
            contract = db.query(Contract).filter(
                Contract.case_id == c.id
            ).first()
            if contract:
                contract_attachments = db.query(ContractAttachment).filter(
                    ContractAttachment.contract_id == contract.id
                ).all()
                item["contract"] = {
                    "id": contract.id,
                    "total_amount": (
                        float(contract.total_amount)
                        if contract.total_amount
                        else 0
                    ),
                    "installments": contract.installments,
                    "disbursed_at": (
                        contract.disbursed_at.isoformat()
                        if contract.disbursed_at
                        else None
                    ),
                    "status": contract.status,
                    "consultoria_liquida": (
                        float(contract.consultoria_valor_liquido)
                        if contract.consultoria_valor_liquido
                        else None
                    ),
                    "consultoria_bruta": (
                        float(contract.consultoria_bruta)
                        if contract.consultoria_bruta
                        else None
                    ),
                    "imposto_percentual": (
                        float(contract.imposto_percentual)
                        if contract.imposto_percentual
                        else None
                    ),
                    "attachments": [
                        {
                            "id": a.id,
                            "filename": a.filename,
                            "size": a.size,
                            "mime": a.mime,
                            "mime_type": a.mime,
                            "uploaded_at": (
                                a.created_at.isoformat()
                                if a.created_at
                                else None
                            )
                        } for a in contract_attachments
                    ]
                }
            else:
                item["contract"] = None

            case_attachments = db.query(Attachment).filter(
                Attachment.case_id == c.id
            ).order_by(Attachment.created_at.desc()).all()
            item["attachments"] = [
                {
                    "id": att.id,
                    "filename": os.path.basename(att.path),
                    "size": att.size,
                    "mime": att.mime,
                    "mime_type": att.mime,
                    "uploaded_at": (
                        att.created_at.isoformat()
                        if att.created_at
                        else None
                    )
                }
                for att in case_attachments
            ]

            items.append(item)

        return {"items": items}


# =================== Mobile Finance ===================
def serialize_mobile_simulation(sim: MobileSimulation):
    def to_float(val):
        return float(val) if val is not None else 0.0

    return {
        "id": sim.id,
        "status": sim.status,
        "user": {
            "id": sim.user.id,
            "name": sim.user.name,
            "email": sim.user.email
        },
        "requested_amount": to_float(sim.requested_amount),
        "total_amount": to_float(sim.total_amount),
        "installments": sim.installments,
        "created_at": sim.created_at.isoformat() if sim.created_at else None,
        "document": {
            "filename": sim.document_filename,
            "type": sim.document_type,
            "url": sim.document_url
        },
        "banks": sim.banks_json or [],
        "percentual_consultoria": to_float(sim.percentual_consultoria),
        "seguro": to_float(sim.seguro)
    }

class MobileDisburseIn(BaseModel):
    consultoria_bruta: float | None = None
    imposto_percentual: float | None = None
    tem_corretor: bool | None = None
    corretor_nome: str | None = None
    corretor_comissao_valor: float | None = None
    percentual_atendente: float | None = None
    atendente_user_id: int | None = None
    # Novos campos para suportar até 2 agentes
    atendente1_user_id: int | None = None
    percentual_atendente1: float | None = None
    atendente2_user_id: int | None = None
    percentual_atendente2: float | None = None


@r.get("/mobile/queue")
def finance_mobile_queue(user=Depends(require_roles("admin", "supervisor", "financeiro"))):
    """Fila de simulações mobile enviadas ao financeiro para ação financeira."""
    with SessionLocal() as db:
        sims = (
            db.query(MobileSimulation)
            .filter(MobileSimulation.status.in_(["financeiro_pendente"]))
            .options(joinedload(MobileSimulation.user))
            .order_by(MobileSimulation.created_at.desc())
            .all()
        )
        return {"items": [serialize_mobile_simulation(s) for s in sims]}

def _get_balcao_user_id(db, fallback_user_id: int | None = None) -> int | None:
    balcao_user = db.query(User).filter(User.email == 'balcao@lifecalling.com', User.active == True).first()
    if balcao_user:
        return balcao_user.id
    return fallback_user_id


def _create_mobile_income(db, sim: MobileSimulation, current_user):
    # Não atribuir ao cliente; preferir balcão, senão quem estiver processando
    balcao_user_id = _get_balcao_user_id(db, current_user.id)

    amount = sim.total_amount or sim.requested_amount or Decimal("0")
    income = FinanceIncome(
        date=now_brt(),
        income_type="Contrato Mobile",
        income_name=f"Contrato Mobile {sim.id}",
        amount=amount,
        created_by=current_user.id,
        agent_user_id=balcao_user_id,
        client_name=sim.user.name if sim.user else None,
        client_cpf=getattr(sim.user, "cpf", None),
        origin="mobile"
    )
    db.add(income)
    return income


@r.post("/mobile/{simulation_id}/approve")
def finance_mobile_approve(simulation_id: str, user=Depends(require_roles("admin", "supervisor", "financeiro"))):
    """Marca simulação mobile como aprovada no financeiro e cria receita."""
    with SessionLocal() as db:
        sim = db.query(MobileSimulation).options(joinedload(MobileSimulation.user)).filter(MobileSimulation.id == simulation_id).first()
        if not sim:
            raise HTTPException(status_code=404, detail="Simulação não encontrada")

        sim.status = "financeiro_pendente"
        income = _create_mobile_income(db, sim, user)
        db.commit()
        return {"message": "Simulação mobile enviada ao financeiro", "income_id": income.id, "simulation": serialize_mobile_simulation(sim)}


@r.post("/mobile/{simulation_id}/cancel")
def finance_mobile_cancel(simulation_id: str, user=Depends(require_roles("admin", "supervisor", "financeiro"))):
    """Cancela simulação mobile na fila financeira."""
    with SessionLocal() as db:
        sim = db.query(MobileSimulation).filter(MobileSimulation.id == simulation_id).first()
        if not sim:
            raise HTTPException(status_code=404, detail="Simulação não encontrada")
        sim.status = "financeiro_cancelado"
        db.commit()
        return {"message": "Simulação mobile cancelada", "simulation": serialize_mobile_simulation(sim)}


@r.post("/mobile/{simulation_id}/disburse")
def finance_mobile_disburse(
    simulation_id: str,
    payload: MobileDisburseIn | None = None,
    user=Depends(require_roles("admin", "supervisor", "financeiro"))
):
    """Marca simulação mobile como contrato efetivado e registra receita."""
    with SessionLocal() as db:
        sim = db.query(MobileSimulation).options(joinedload(MobileSimulation.user)).filter(MobileSimulation.id == simulation_id).first()
        if not sim:
            raise HTTPException(status_code=404, detail="Simulação não encontrada")

        sim.status = "contrato_efetivado"

        bruto = Decimal(str(payload.consultoria_bruta)) if payload and payload.consultoria_bruta is not None else (sim.total_amount or sim.requested_amount or Decimal("0"))
        imposto_percentual = Decimal(str(payload.imposto_percentual)) if payload and payload.imposto_percentual is not None else Decimal("14")
        imposto_valor = (bruto * imposto_percentual / Decimal("100")).quantize(Decimal("0.01"))
        liquido = (bruto - imposto_valor).quantize(Decimal("0.01"))

        # Usuário balcão para contratos mobile (fallback: atendente 1 -> atendente 2 -> usuário atual)
        balcao_user_id = _get_balcao_user_id(
            db,
            payload.atendente1_user_id
            or payload.atendente2_user_id
            or user.id
        )

        # Criar despesa de imposto (se houver valor)
        if imposto_valor > 0:
            tax_expense = FinanceExpense(
                description=f"Imposto sobre consultoria bruta - Contrato Mobile #{sim.id}",
                amount=imposto_valor,
                expense_type="Impostos",
                expense_name=f"Imposto sobre consultoria bruta - Contrato Mobile #{sim.id}",
                date=now_brt(),
                month=now_brt().month,
                year=now_brt().year,
                created_by=user.id,
                agent_user_id=balcao_user_id,
                client_cpf=getattr(sim.user, "cpf", None) if sim.user else None,
                client_name=sim.user.name if sim.user else None,
                origin="mobile"
            )
            db.add(tax_expense)

        def add_income(amount: Decimal, name_suffix: str, agent_id: int | None = None):
            inc = FinanceIncome(
                date=now_brt(),
                income_type="Contrato Mobile",
                income_name=f"Contrato Mobile {sim.id} {name_suffix}".strip(),
                amount=amount,
                created_by=user.id,
                agent_user_id=agent_id or balcao_user_id,  # Balcão/house account padrão
                client_name=sim.user.name if sim.user else None,
                client_cpf=getattr(sim.user, "cpf", None),
                origin="mobile"
            )
            db.add(inc)
            return inc

        # Distribuição de receitas (suporte para até 2 agentes)
        # Nova lógica: atendente1_user_id, percentual_atendente1, atendente2_user_id, percentual_atendente2
        # Compatibilidade: atendente_user_id, percentual_atendente
        
        if payload:
            # Usar novos campos se disponíveis
            if payload.atendente1_user_id or payload.atendente2_user_id:
                percentual1 = Decimal(str(payload.percentual_atendente1 or 0))
                percentual2 = Decimal(str(payload.percentual_atendente2 or 0))
                percentual_balcao = Decimal('100') - percentual1 - percentual2
                
                # Criar receitas para cada agente
                if payload.atendente1_user_id and percentual1 > 0:
                    valor1 = (liquido * percentual1 / Decimal('100')).quantize(Decimal('0.01'))
                    add_income(valor1, '(Atendente 1)', payload.atendente1_user_id)
                
                if payload.atendente2_user_id and percentual2 > 0:
                    valor2 = (liquido * percentual2 / Decimal('100')).quantize(Decimal('0.01'))
                    add_income(valor2, '(Atendente 2)', payload.atendente2_user_id)
                
                # Balcão recebe o restante
                if percentual_balcao > 0:
                    valor_balcao = (liquido * percentual_balcao / Decimal('100')).quantize(Decimal('0.01'))
                    add_income(valor_balcao, '(Balcão)', balcao_user_id)
                    
            # Compatibilidade com campos antigos
            elif payload.percentual_atendente and payload.atendente_user_id:
                atendente_percent = Decimal(str(payload.percentual_atendente)) / Decimal('100')
                atendente_valor = (liquido * atendente_percent).quantize(Decimal('0.01'))
                balcao_valor = (liquido - atendente_valor).quantize(Decimal('0.01'))
                add_income(atendente_valor, '(Atendente)', payload.atendente_user_id)
                add_income(balcao_valor, '(Balcão)', balcao_user_id)
            else:
                # Sem distribuição - todo valor vai para o balcão
                add_income(liquido, '', balcao_user_id)
        else:
            add_income(liquido, '', balcao_user_id)

        # Criar despesa de comissão de corretor (com nome e CPF do cliente)
        if payload and payload.tem_corretor and payload.corretor_comissao_valor:
            try:
                val = Decimal(str(payload.corretor_comissao_valor))
                exp = FinanceExpense(
                    date=now_brt(),
                    month=now_brt().month,
                    year=now_brt().year,
                    expense_type="Comissão Corretor - Mobile",
                    expense_name=payload.corretor_nome or "Comissão Corretor",
                    description=f"Comissão de corretor - {payload.corretor_nome or 'Corretor'} - Contrato Mobile #{sim.id}",
                    amount=val,
                    created_by=user.id,
                    agent_user_id=balcao_user_id,
                    client_name=sim.user.name if sim.user else None,
                    client_cpf=getattr(sim.user, "cpf", None) if sim.user else None,
                    origin="mobile"
                )
                db.add(exp)
            except Exception:
                pass

        # Criar Case e Contract para integração com Rankings
        mobile_user = sim.user
        print(f"[DEBUG] mobile_user: {mobile_user}")
        print(f"[DEBUG] mobile_user.cpf: {getattr(mobile_user, 'cpf', 'ATTR_NOT_FOUND') if mobile_user else 'USER_IS_NONE'}")

        if mobile_user and hasattr(mobile_user, 'cpf') and mobile_user.cpf:
            # Buscar ou criar Cliente
            from ..models import Client, Case, Contract, ContractAgent

            print(f"[DEBUG] Criando Contract para mobile user CPF: {mobile_user.cpf}")

            # Buscar cliente por CPF (remover formatação se houver)
            cpf_numbers = ''.join(c for c in mobile_user.cpf if c.isdigit())
            client = db.query(Client).filter(Client.cpf == cpf_numbers).first()

            if not client:
                # Criar cliente básico
                print(f"[DEBUG] Cliente não encontrado, criando novo cliente")
                client = Client(
                    name=mobile_user.name or "Cliente Mobile",
                    cpf=cpf_numbers,
                    matricula=f"MOBILE_{mobile_user.id}",  # Matrícula obrigatória
                    telefone_preferencial=getattr(mobile_user, "phone", None),
                    created_by=user.id
                )
                db.add(client)
                db.flush()
                print(f"[DEBUG] Cliente criado: {client.id}")
            else:
                print(f"[DEBUG] Cliente encontrado: {client.id}")

            # Determinar atendente responsável
            atendente_responsavel = balcao_user_id
            if payload:
                if payload.atendente1_user_id:
                    atendente_responsavel = payload.atendente1_user_id
                elif payload.atendente_user_id:
                    atendente_responsavel = payload.atendente_user_id

            # Criar Case para o contrato mobile
            case = Case(
                client_id=client.id,
                status="contrato_efetivado",
                assigned_user_id=atendente_responsavel
            )
            db.add(case)
            db.flush()

            # Criar Contract vinculado ao Case
            contract = Contract(
                case_id=case.id,
                status="ativo",
                total_amount=float(bruto),
                installments=sim.installments or 0,
                disbursed_at=now_brt(),
                signed_at=now_brt(),
                created_at=now_brt(),
                created_by=user.id,
                agent_user_id=atendente_responsavel,
                consultoria_valor_liquido=float(liquido),
                consultoria_bruta=float(bruto),
                imposto_percentual=float(imposto_percentual),
                imposto_valor=float(imposto_valor),
                tem_corretor=payload.tem_corretor if payload else False,
                corretor_nome=payload.corretor_nome if payload and payload.tem_corretor else None,
                corretor_comissao_valor=float(payload.corretor_comissao_valor) if payload and payload.tem_corretor and payload.corretor_comissao_valor else None
            )
            db.add(contract)
            db.flush()

            # Criar registros em ContractAgent para distribuição
            if payload:
                if payload.atendente1_user_id or payload.atendente2_user_id:
                    # Nova lógica com até 2 agentes
                    percentual1 = float(payload.percentual_atendente1 or 0)
                    percentual2 = float(payload.percentual_atendente2 or 0)

                    if payload.atendente1_user_id and percentual1 > 0:
                        agent1 = ContractAgent(
                            contract_id=contract.id,
                            user_id=payload.atendente1_user_id,
                            percentual=percentual1,
                            is_primary=True
                        )
                        db.add(agent1)

                    if payload.atendente2_user_id and percentual2 > 0:
                        agent2 = ContractAgent(
                            contract_id=contract.id,
                            user_id=payload.atendente2_user_id,
                            percentual=percentual2,
                            is_primary=False
                        )
                        db.add(agent2)

                # Compatibilidade com campos antigos
                elif payload.atendente_user_id and payload.percentual_atendente:
                    agent = ContractAgent(
                        contract_id=contract.id,
                        user_id=payload.atendente_user_id,
                        percentual=float(payload.percentual_atendente),
                        is_primary=True
                    )
                    db.add(agent)

        db.commit()
        # TODO: enviar notificação para app mobile informando contrato efetivado
        return {"message": "Contrato mobile efetivado", "simulation": serialize_mobile_simulation(sim)}

@r.post("/mobile/{simulation_id}/reopen")
def finance_mobile_reopen(
    simulation_id: str,
    user=Depends(require_roles("admin", "supervisor", "financeiro"))
):
    """
    Reabre um contrato mobile já efetivado/cancelado para ajuste,
    colocando-o novamente em 'approved_by_client' (fila financeira).
    Remove receitas e despesas originadas desta simulação para evitar duplicidade.
    """
    with SessionLocal() as db:
        sim = db.query(MobileSimulation).filter(MobileSimulation.id == simulation_id).first()
        if not sim:
            raise HTTPException(status_code=404, detail="Simulação não encontrada")

        # Limpar receitas/despesas vinculadas pelo nome contendo o ID da simulação
        # Apagar receitas/despesas mobile relacionadas a esta simulação
        db.query(FinanceIncome).filter(
            FinanceIncome.origin == "mobile",
            FinanceIncome.income_name.ilike(f"%{simulation_id}%")
        ).delete(synchronize_session=False)

        db.query(FinanceExpense).filter(
            FinanceExpense.origin == "mobile",
            FinanceExpense.expense_name.ilike(f"%{simulation_id}%")
        ).delete(synchronize_session=False)

        sim.status = "approved_by_client"
        db.commit()
        db.refresh(sim)
        return {"message": "Simulação mobile reaberta para ajuste", "simulation": serialize_mobile_simulation(sim)}


@r.get("/case/{case_id}")
def get_case_details(
    case_id: int,
    user=Depends(require_roles("admin", "supervisor", "financeiro"))
):
    """Retorna detalhes completos de um caso para exibição no modal
    financeiro"""
    from sqlalchemy.orm import (  # pyright: ignore[reportMissingImports]
        joinedload
    )
    from ..models import Simulation, Attachment

    with SessionLocal() as db:
        # Buscar o caso com relacionamentos
        case = db.query(Case).options(
            joinedload(Case.client),
            joinedload(Case.last_simulation)
        ).filter(Case.id == case_id).first()

        if not case:
            raise HTTPException(404, "Case not found")

        # Dados do cliente
        client_data = {
            "id": case.client.id,
            "name": case.client.name,
            "cpf": case.client.cpf,
            "matricula": case.client.matricula,
            "orgao": case.client.orgao,
            "telefone_preferencial": case.client.telefone_preferencial,
            "numero_cliente": case.client.numero_cliente,
            "observacoes": case.client.observacoes,
            "banco": case.client.banco,
            "agencia": case.client.agencia,
            "conta": case.client.conta,
            "chave_pix": case.client.chave_pix,
            "tipo_chave_pix": case.client.tipo_chave_pix
        }

        # Simulação aprovada
        simulation_data = None
        if case.last_simulation_id:
            sim = db.get(Simulation, case.last_simulation_id)
            if sim and sim.status == "approved":
                simulation_data = {
                    "id": sim.id,
                    "status": sim.status,
                    "prazo": sim.prazo,
                    "coeficiente": sim.coeficiente,
                    "seguro": float(sim.seguro or 0),
                    "percentual_consultoria": float(
                        sim.percentual_consultoria or 0
                    ),
                    "banks_json": sim.banks_json,
                    "totals": {
                        "valorParcelaTotal": float(
                            sim.valor_parcela_total or 0
                        ),
                        "saldoTotal": float(sim.saldo_total or 0),
                        "liberadoTotal": float(sim.liberado_total or 0),
                        "totalFinanciado": float(
                            sim.total_financiado or 0
                        ),
                        "valorLiquido": float(sim.valor_liquido or 0),
                        "custoConsultoria": float(
                            sim.custo_consultoria or 0
                        ),
                        "custoConsultoriaLiquido": float(
                            sim.custo_consultoria_liquido or 0
                        ),
                        "liberadoCliente": float(sim.liberado_cliente or 0)
                    }
                }

        # Contrato efetivado (se existir)
        contract_data = None
        contract = db.query(Contract).filter(
            Contract.case_id == case.id
        ).first()
        if contract:
            from ..models import ContractAttachment
            attachments = db.query(ContractAttachment).filter(
                ContractAttachment.contract_id == contract.id
            ).all()
            contract_data = {
                "id": contract.id,
                "total_amount": float(
                    contract.total_amount or 0
                ),
                "installments": contract.installments,
                "disbursed_at": (
                    contract.disbursed_at.isoformat()
                    if contract.disbursed_at
                    else None
                ),
                "status": contract.status,
                "consultoria_liquida": (
                    float(contract.consultoria_valor_liquido)
                    if contract.consultoria_valor_liquido
                    else None
                ),
                "consultoria_bruta": (
                    float(contract.consultoria_bruta)
                    if contract.consultoria_bruta
                    else None
                ),
                "imposto_percentual": (
                    float(contract.imposto_percentual)
                    if contract.imposto_percentual
                    else None
                ),
                "attachments": [
                    {
                        "id": a.id,
                        "filename": a.filename,
                        "size": a.size,
                        "mime": a.mime,
                        "created_at": (
                            a.created_at.isoformat()
                            if a.created_at
                            else None
                        )
                    } for a in attachments
                ]
            }

        # Eventos do caso (histórico/comentários)
        events = db.query(CaseEvent).filter(
            CaseEvent.case_id == case.id
        ).order_by(CaseEvent.created_at.desc()).all()

        events_data = [
            {
                "id": e.id,
                "type": e.type,
                "created_at": (
                    e.created_at.isoformat()
                    if e.created_at
                    else None
                ),
                "payload": e.payload,
                "created_by": e.created_by
            } for e in events
        ]

        # Anexos do caso
        attachments = db.query(Attachment).filter(
            Attachment.case_id == case.id
        ).all()

        attachments_data = [
            {
                "id": a.id,
                "path": a.path,
                "mime": a.mime,
                "size": a.size,
                "created_at": (
                    a.created_at.isoformat() if a.created_at else None
                )
            } for a in attachments
        ]

        return {
            "id": case.id,
            "status": case.status,
            "created_at": (
                case.created_at.isoformat()
                if case.created_at
                else None
            ),
            "client": client_data,
            "simulation": simulation_data,
            "contract": contract_data,
            "events": events_data,
            "attachments": attachments_data
        }


@r.get("/metrics")
def finance_metrics(
    start_date: str | None = None,
    end_date: str | None = None,
    user=Depends(require_roles("admin", "supervisor", "financeiro"))
):
    from ..models import (  # noqa: E501
        Contract,
        FinanceIncome,
        FinanceExpense,
        ExternalClientIncome
    )
    from sqlalchemy import func  # pyright: ignore[reportMissingImports]
    from datetime import datetime, timedelta

    with SessionLocal() as db:
        # Definir período de busca
        if start_date:
            try:
                start_filter = datetime.fromisoformat(start_date)
            except Exception:
                start_filter = now_brt() - timedelta(days=30)
        else:
            start_filter = now_brt() - timedelta(days=30)

        if end_date:
            try:
                end_filter = datetime.fromisoformat(end_date)

                # Incluir o dia completo (23:59:59.999999)

                end_filter = end_filter.replace(hour=23, minute=59, second=59, microsecond=999999)
            except Exception:
                end_filter = now_brt()
        else:
            end_filter = now_brt()

        # Contar total de contratos ativos
        total_contracts = db.query(
            func.count(Contract.id)
        ).filter(
            Contract.status == "ativo",
            Contract.signed_at >= start_filter,
            Contract.signed_at <= end_filter
        ).scalar() or 0

        # RECEITA TOTAL: Soma de TODAS as receitas
        total_revenue = float(db.query(
            func.coalesce(func.sum(FinanceIncome.amount), 0)
        ).filter(
            FinanceIncome.date >= start_filter,
            FinanceIncome.date <= end_filter
        ).scalar() or 0)

        # Adicionar receitas externas (clientes externos)
        total_external_income = float(db.query(
            func.coalesce(
                func.sum(ExternalClientIncome.custo_consultoria_liquido), 0
            )
        ).filter(
            ExternalClientIncome.date >= start_filter,
            ExternalClientIncome.date <= end_filter
        ).scalar() or 0)

        total_revenue = total_revenue + total_external_income

        # Comissões (para informação)
        total_commissions = float(db.query(
            func.coalesce(func.sum(FinanceExpense.amount), 0)
        ).filter(
            FinanceExpense.date >= start_filter,
            FinanceExpense.date <= end_filter,
            FinanceExpense.expense_type == "Comissão"
        ).scalar() or 0)

        consultoria_income_types = [
            "Consultoria Líquida",
            "Consultoria Líquida - Atendente",
            "Consultoria Líquida - Atendente 1",
            "Consultoria Líquida - Atendente 2",
            "Consultoria Líquida - Balcão",
            "Consultoria Bruta",
            "Consultoria Bruta - Atendente",
            "Consultoria Bruta - Atendente 1",
            "Consultoria Bruta - Atendente 2",
            "Consultoria Bruta - Balcão",
            "Consultoria - Atendente",
            "Consultoria - Balcão",
        ]

        # Receitas de consultoria (somente receitas de consultoria)
        total_consultoria_revenue = float(db.query(
            func.coalesce(func.sum(FinanceIncome.amount), 0)
        ).filter(
            FinanceIncome.date >= start_filter,
            FinanceIncome.date <= end_filter,
            FinanceIncome.income_type.in_(consultoria_income_types)
        ).scalar() or 0)

        # Receitas externas também são consultoria
        total_consultoria_revenue += total_external_income

        # Receitas manuais (outras receitas, excluindo consultoria)
        total_manual_income = float(db.query(
            func.coalesce(func.sum(FinanceIncome.amount), 0)
        ).filter(
            FinanceIncome.date >= start_filter,
            FinanceIncome.date <= end_filter,
            ~FinanceIncome.income_type.in_(consultoria_income_types)
        ).scalar() or 0)

        # Despesas (imposto não entra como despesa no KPI)
        total_expenses = float(db.query(
            func.coalesce(func.sum(FinanceExpense.amount), 0)
        ).filter(
            FinanceExpense.date >= start_filter,
            FinanceExpense.date <= end_filter,
            FinanceExpense.expense_type != "Impostos"
        ).scalar() or 0)

        # Impostos = 14% da receita total
        total_tax = total_revenue * 0.14

        # Consultoria líquida total = receitas de consultoria - despesas
        total_consultoria_liquida = total_consultoria_revenue - total_expenses

        # Lucro líquido = receita total - despesas - impostos
        net_profit = total_revenue - total_expenses - total_tax

        return {
            "totalRevenue": round(total_revenue, 2),
            "totalExpenses": round(total_expenses, 2),
            "netProfit": round(net_profit, 2),
            "totalContracts": int(total_contracts),
            "totalTax": round(total_tax, 2),
            "totalManualIncome": round(total_manual_income, 2),
            "totalConsultoriaLiq": round(total_consultoria_liquida, 2),
            "totalExternalIncome": round(total_external_income, 2),
            "totalCommissions": round(total_commissions, 2)
        }


class DisburseIn(BaseModel):
    case_id: int
    total_amount: float
    installments: int
    disbursed_at: datetime | None = None


@r.post("/disburse")
async def disburse(
    data: DisburseIn,
    user=Depends(require_roles("admin", "supervisor", "financeiro"))
):
    with SessionLocal() as db:
        c = db.get(Case, data.case_id)
        if not c:
            raise HTTPException(404, "case not found")

        ct = db.query(Contract).filter(Contract.case_id == c.id).first()
        if not ct:
            ct = Contract(case_id=c.id)

        # Buscar simulação para pegar consultoria líquida
        from ..models import Simulation
        simulation = db.query(Simulation).filter(
            Simulation.case_id == c.id
        ).order_by(Simulation.id.desc()).first()

        consultoria_liquida = (
            simulation.custo_consultoria_liquido if simulation else 0
        )

        ct.total_amount = data.total_amount
        ct.installments = data.installments
        ct.disbursed_at = data.disbursed_at or now_brt()
        ct.updated_at = now_brt()

        # Campos de receita e ranking
        ct.consultoria_valor_liquido = consultoria_liquida
        ct.signed_at = data.disbursed_at or now_brt()
        ct.created_by = user.id
        ct.agent_user_id = c.assigned_user_id  # Atendente do caso

        db.add(ct)
        db.flush()

        # Criar receita automática (Consultoria Líquida 86%)
        if consultoria_liquida and consultoria_liquida > 0:
            from ..models import FinanceIncome
            income = FinanceIncome(
                date=data.disbursed_at or now_brt(),
                income_type="Consultoria Líquida",
                income_name=f"Contrato #{ct.id} - {c.client.name}",
                amount=consultoria_liquida,
                created_by=user.id,
                agent_user_id=c.assigned_user_id  # Atendente
            )
            db.add(income)

        c.status = "contrato_efetivado"
        c.last_update_at = now_brt()
        db.add(CaseEvent(
            case_id=c.id,
            type="finance.disbursed",
            payload={
                "contract_id": None,
                "amount": data.total_amount,
                "installments": data.installments
            },
            created_by=user.id
        ))
        db.commit()
        db.refresh(ct)

    await eventbus.broadcast(
        "case.updated",
        {"case_id": data.case_id, "status": "contrato_efetivado"}
    )
    return {"contract_id": ct.id}


class DisburseSimpleIn(BaseModel):
    case_id: int
    disbursed_at: datetime | None = None

    # NOVOS CAMPOS: Consultoria Bruta + Imposto
    consultoria_bruta: float  # Obrigatório: Valor bruto da consultoria
    imposto_percentual: float = 14.0  # Percentual de imposto (padrão 14%)

    # Comissão de Corretor (opcional)
    tem_corretor: bool = False
    corretor_nome: str | None = None
    corretor_comissao_valor: float | None = None

    # Distribuição (já existente)
    percentual_atendente: float | None = None
    atendente_user_id: int | None = None
    # Novos campos para suportar até 2 agentes
    atendente1_user_id: int | None = None
    percentual_atendente1: float | None = None
    atendente2_user_id: int | None = None
    percentual_atendente2: float | None = None


@r.post("/disburse-simple")
async def disburse_simple(
    data: DisburseSimpleIn,
    user=Depends(require_roles("admin", "supervisor", "financeiro"))
):
    """Efetiva liberação com Consultoria Bruta + Comissão Corretor (opcional)"""
    try:
        with SessionLocal() as db:
            # 1. Buscar caso com eager loading do cliente
            c = db.query(Case).options(
                joinedload(Case.client)
            ).filter(Case.id == data.case_id).first()

            if not c:
                raise HTTPException(404, "case not found")

            # Verificar se o caso tem cliente
            if not c.client:
                raise HTTPException(400, "Caso não possui cliente associado")

            # Usuário balcão (fallback: atendente do caso ou usuário atual)
            balcao_user_id = _get_balcao_user_id(
                db,
                c.assigned_user_id or user.id
            )

            # 2. Busca a simulação mais recente aprovada
            from ..models import Simulation
            simulation = db.query(Simulation).filter(
                Simulation.case_id == c.id,
                Simulation.status == "approved"
            ).order_by(Simulation.id.desc()).first()

            if not simulation:
                raise HTTPException(
                    400,
                    "Nenhuma simulação aprovada encontrada para este caso"
                )

            # Validar valores da simulação
            total_amount = (
                simulation.liberado_cliente or simulation.liberado_total
            )
            if total_amount is None or total_amount <= 0:
                raise HTTPException(
                    400,
                    "Simulação não possui valores válidos de liberação"
                )

            if not simulation.prazo or simulation.prazo <= 0:
                raise HTTPException(
                    400,
                    "Simulação não possui prazo válido"
                )

            # 3. Calcular valores de Imposto
            consultoria_bruta = data.consultoria_bruta
            imposto_percentual = data.imposto_percentual or 14.0
            imposto_valor = consultoria_bruta * (imposto_percentual / 100)

            # Calcular consultoria líquida (apenas para compatibilidade/registro)
            consultoria_liquida = consultoria_bruta - imposto_valor

            print(f"[INFO] Consultoria Bruta: R$ {consultoria_bruta:.2f}")
            print(f"[INFO] Imposto ({imposto_percentual}%): R$ {imposto_valor:.2f}")
            print(f"[INFO] Consultoria Líquida (referência): R$ {consultoria_liquida:.2f}")

            if consultoria_bruta <= 0:
                print(
                    f"[AVISO] Consultoria bruta é zero para caso {c.id}, "
                    f"não será criada receita automática"
                )

            # ✅ VALIDAÇÃO: Verificar se comissão não excede consultoria bruta
            if (data.tem_corretor and data.corretor_comissao_valor and
                    data.corretor_comissao_valor > 0):
                if data.corretor_comissao_valor > consultoria_liquida:
                    raise HTTPException(
                        400,
                        f"Comissão do corretor "
                        f"(R$ {data.corretor_comissao_valor:.2f}) não pode "
                        f"ser maior que a consultoria bruta "
                        f"(R$ {consultoria_bruta:.2f})"
                    )

            # 4. Criar ou Atualizar Contract
            ct = db.query(Contract).filter(Contract.case_id == c.id).first()
            if not ct:
                ct = Contract(case_id=c.id)

            ct.total_amount = total_amount
            ct.installments = simulation.prazo or 0
            ct.disbursed_at = data.disbursed_at or now_brt()
            ct.updated_at = now_brt()
            ct.status = "ativo"

            # Campos de receita e ranking
            ct.consultoria_valor_liquido = consultoria_liquida
            ct.signed_at = data.disbursed_at or now_brt()
            ct.created_by = user.id
            ct.agent_user_id = data.atendente_user_id or c.assigned_user_id

            # Atualizar atendente do caso se foi selecionado no modal
            if data.atendente_user_id:
                c.assigned_user_id = data.atendente_user_id

            # NOVOS CAMPOS: Consultoria Bruta + Imposto
            ct.consultoria_bruta = consultoria_bruta
            ct.imposto_percentual = imposto_percentual
            ct.imposto_valor = imposto_valor

            # NOVOS CAMPOS: Comissão Corretor (opcional)
            ct.tem_corretor = data.tem_corretor
            ct.corretor_nome = data.corretor_nome
            ct.corretor_comissao_valor = data.corretor_comissao_valor

            db.add(ct)
            db.flush()

            # ✅ CRIAR REGISTROS EM ContractAgent PARA DISTRIBUIÇÃO
            from ..models import ContractAgent

            # Limpar registros antigos se houver
            db.query(ContractAgent).filter(
                ContractAgent.contract_id == ct.id
            ).delete()

            # Criar novos registros baseado na distribuição
            if data.atendente1_user_id or data.atendente2_user_id:
                # Nova lógica com até 2 agentes
                if data.atendente1_user_id and data.percentual_atendente1:
                    agent1 = ContractAgent(
                        contract_id=ct.id,
                        user_id=data.atendente1_user_id,
                        percentual=data.percentual_atendente1,
                        is_primary=True  # Primeiro atendente é o principal
                    )
                    db.add(agent1)

                if data.atendente2_user_id and data.percentual_atendente2:
                    agent2 = ContractAgent(
                        contract_id=ct.id,
                        user_id=data.atendente2_user_id,
                        percentual=data.percentual_atendente2,
                        is_primary=False
                    )
                    db.add(agent2)

                # Balcão recebe o restante
                percentual1 = data.percentual_atendente1 or 0
                percentual2 = data.percentual_atendente2 or 0
                percentual_balcao = 100 - percentual1 - percentual2

                if percentual_balcao > 0 and balcao_user_id:
                    agent_balcao = ContractAgent(
                        contract_id=ct.id,
                        user_id=balcao_user_id,
                        percentual=percentual_balcao,
                        is_primary=False
                    )
                    db.add(agent_balcao)
            elif data.percentual_atendente and data.atendente_user_id:
                # Compatibilidade com campo único
                agent = ContractAgent(
                    contract_id=ct.id,
                    user_id=data.atendente_user_id,
                    percentual=data.percentual_atendente,
                    is_primary=True
                )
                db.add(agent)

                # Balcão recebe o restante
                percentual_balcao = 100.0 - data.percentual_atendente
                if percentual_balcao > 0 and balcao_user_id:
                    agent_balcao = ContractAgent(
                        contract_id=ct.id,
                        user_id=balcao_user_id,
                        percentual=percentual_balcao,
                        is_primary=False
                    )
                    db.add(agent_balcao)
            else:
                # Sem distribuição - 100% para balcão ou atendente do caso
                if ct.agent_user_id:
                    agent = ContractAgent(
                        contract_id=ct.id,
                        user_id=ct.agent_user_id,
                        percentual=100.0,
                        is_primary=True
                    )
                    db.add(agent)

            # ✅ CRIAR DESPESA DE IMPOSTO AUTOMATICAMENTE
            if imposto_valor > 0:
                from ..models import FinanceExpense
                from datetime import date
                
                tax_expense = FinanceExpense(
                    description=f"Imposto sobre consultoria bruta - "
                               f"Contrato #{ct.id}",
                    amount=imposto_valor,
                    expense_type="Impostos",
                    expense_name=f"Imposto sobre consultoria bruta - "
                                f"Contrato #{ct.id}",
                    date=date.today(),
                    month=date.today().month,
                    year=date.today().year,
                    created_by=user.id,
                    agent_user_id=ct.agent_user_id,
                    client_cpf=c.client.cpf if c.client else None,
                    client_name=c.client.name if c.client else None
                )
                db.add(tax_expense)
                db.flush()
                
                # Vincular despesa ao contrato
                ct.imposto_expense_id = tax_expense.id

            # 5. Criar Receitas (Atendente + Balcão)
            #  LOG DIAGNÓSTICO: Verificar valores antes de criar receitas
            print(f"[DEBUG] === VERIFICAÇÃO DE RECEITAS PARA CASO {c.id} ===")
            print(f"[DEBUG] Consultoria Bruta: R$ {consultoria_bruta:.2f}")
            print(f"[DEBUG] Imposto: R$ {imposto_valor:.2f}")
            print(f"[DEBUG] Consultoria Líquida: R$ {consultoria_liquida:.2f}")
            print(f"[DEBUG] Tem Corretor: {data.tem_corretor}")
            print(f"[DEBUG] Comissão Corretor: R$ {data.corretor_comissao_valor or 0:.2f}")
            print(f"[DEBUG] Condição consultoria_liquida > 0: {consultoria_liquida > 0 if consultoria_liquida else False}")

            if consultoria_liquida and consultoria_liquida > 0.01:
                from ..models import FinanceIncome, User

                client_name = (
                    c.client.name if c.client else f"Cliente {c.id}"
                )

                # Buscar usuário balcão apenas uma vez
                balcao_user = None
                if balcao_user_id:
                    balcao_user = db.query(User).filter(
                        User.id == balcao_user_id,
                        User.active == True
                    ).first()

                if balcao_user:
                    print(f"[INFO] Usuário balcão encontrado: {balcao_user.name} (ID: {balcao_user.id})")
                else:
                    print("[AVISO] Usuário 'balcao@lifecalling.com' não encontrado ou inativo. Receita de balcão sem agent_user_id.")

                # Distribuição de receitas (suporte para até 2 agentes)
                # Nova lógica: atendente1_user_id, percentual_atendente1, atendente2_user_id, percentual_atendente2
                # Compatibilidade: atendente_user_id, percentual_atendente

                # Deduzir comissão do corretor
                consultoria_para_distribuir = consultoria_liquida
                if (data.tem_corretor and data.corretor_comissao_valor and
                        data.corretor_comissao_valor > 0):
                    consultoria_para_distribuir = consultoria_liquida - data.corretor_comissao_valor

                # Garantir que não seja negativo
                if consultoria_para_distribuir < 0:
                    consultoria_para_distribuir = 0

                # Usar novos campos se disponíveis
                if data.atendente1_user_id or data.atendente2_user_id:
                    percentual1 = data.percentual_atendente1 or 0
                    percentual2 = data.percentual_atendente2 or 0
                    percentual_balcao = 100 - percentual1 - percentual2
                    
                    # Criar receitas para cada agente
                    if data.atendente1_user_id and percentual1 > 0:
                        valor1 = consultoria_para_distribuir * (percentual1 / 100)
                        income1 = FinanceIncome(
                            date=data.disbursed_at or now_brt(),
                            income_type="Consultoria Líquida - Atendente 1",
                            income_name=f"Consultoria Líquida {percentual1:.0f}% - {client_name} (Contrato #{ct.id})",
                            amount=valor1,
                            created_by=user.id,
                            agent_user_id=data.atendente1_user_id,
                            client_cpf=c.client.cpf if c.client else None,
                            client_name=client_name
                        )
                        db.add(income1)
                    
                    if data.atendente2_user_id and percentual2 > 0:
                        valor2 = consultoria_para_distribuir * (percentual2 / 100)
                        income2 = FinanceIncome(
                            date=data.disbursed_at or now_brt(),
                            income_type="Consultoria Líquida - Atendente 2",
                            income_name=f"Consultoria Líquida {percentual2:.0f}% - {client_name} (Contrato #{ct.id})",
                            amount=valor2,
                            created_by=user.id,
                            agent_user_id=data.atendente2_user_id,
                            client_cpf=c.client.cpf if c.client else None,
                            client_name=client_name
                        )
                        db.add(income2)
                    
                    # Balcão recebe o restante
                    if percentual_balcao > 0:
                        valor_balcao = consultoria_para_distribuir * (percentual_balcao / 100)
                        income_balcao = FinanceIncome(
                            date=data.disbursed_at or now_brt(),
                            income_type="Consultoria Líquida - Balcão",
                            income_name=f"Consultoria Líquida {percentual_balcao:.0f}% - {client_name} (Contrato #{ct.id})",
                            amount=valor_balcao,
                            created_by=user.id,
                            agent_user_id=balcao_user_id,
                            client_cpf=c.client.cpf if c.client else None,
                            client_name=client_name
                        )
                        db.add(income_balcao)
                        
                # Compatibilidade com campos antigos
                elif data.percentual_atendente and data.atendente_user_id:
                    percentual_atendente = data.percentual_atendente
                    percentual_balcao = 100.0 - percentual_atendente
                    
                    valor_atendente = consultoria_para_distribuir * (percentual_atendente / 100)
                    valor_balcao = consultoria_para_distribuir * (percentual_balcao / 100)
                    
                    if valor_atendente > 0:
                        income_atendente = FinanceIncome(
                            date=data.disbursed_at or now_brt(),
                            income_type="Consultoria Líquida - Atendente",
                            income_name=f"Consultoria Líquida {percentual_atendente:.0f}% - {client_name} (Contrato #{ct.id})",
                            amount=valor_atendente,
                            created_by=user.id,
                            agent_user_id=data.atendente_user_id,
                            client_cpf=c.client.cpf if c.client else None,
                            client_name=client_name
                        )
                        db.add(income_atendente)
                    
                    if valor_balcao > 0:
                        income_balcao = FinanceIncome(
                            date=data.disbursed_at or now_brt(),
                            income_type="Consultoria Líquida - Balcão",
                            income_name=f"Consultoria Líquida {percentual_balcao:.0f}% - {client_name} (Contrato #{ct.id})",
                            amount=valor_balcao,
                            created_by=user.id,
                            agent_user_id=balcao_user_id,
                            client_cpf=c.client.cpf if c.client else None,
                            client_name=client_name
                        )
                        db.add(income_balcao)
                else:
                    # Sem distribuição - todo valor vai para o balcão
                    if consultoria_para_distribuir > 0:
                        income = FinanceIncome(
                            date=data.disbursed_at or now_brt(),
                            income_type="Consultoria Líquida",
                            income_name=f"Consultoria Líquida - {client_name} (Contrato #{ct.id})",
                            amount=consultoria_para_distribuir,
                            created_by=user.id,
                            agent_user_id=balcao_user_id,
                            client_cpf=c.client.cpf if c.client else None,
                            client_name=client_name
                        )
                        db.add(income)

            # 6. Criar Despesa de Comissão Corretor (se houver)
            if data.tem_corretor and data.corretor_comissao_valor and data.corretor_comissao_valor > 0:
                from ..models import FinanceExpense
                disbursed_date = data.disbursed_at or now_brt()
                expense = FinanceExpense(
                    month=disbursed_date.month,
                    year=disbursed_date.year,
                    date=disbursed_date,
                    expense_type="Comissão",
                    expense_name=f"Comissão Corretor - {data.corretor_nome} "
                                f"(Contrato #{ct.id})",
                    amount=data.corretor_comissao_valor,
                    created_by=user.id,
                    agent_user_id=ct.agent_user_id,
                    client_cpf=c.client.cpf if c.client else None,
                    client_name=c.client.name if c.client else None
                )
                db.add(expense)
                db.flush()

                # Vincular expense ao contract
                ct.corretor_expense_id = expense.id

            # 7. Atualizar status do caso
            c.status = "contrato_efetivado"
            c.last_update_at = now_brt()
            db.add(CaseEvent(
                case_id=c.id,
                type="finance.disbursed",
                payload={
                    "contract_id": ct.id,
                    "consultoria_bruta": float(consultoria_bruta),
                    "consultoria_liquida": float(consultoria_liquida),
                    "imposto_percentual": float(imposto_percentual),
                    "tem_corretor": data.tem_corretor,
                    "corretor_comissao": float(data.corretor_comissao_valor or 0),
                    "amount": float(total_amount),
                    "installments": simulation.prazo
                },
                created_by=user.id
            ))
            db.commit()
            db.refresh(ct)

        await eventbus.broadcast(
            "case.updated",
            {"case_id": data.case_id, "status": "contrato_efetivado"}
        )
        return {"contract_id": ct.id}

    except HTTPException:
        # Re-raise HTTPExceptions para manter status codes corretos
        raise
    except Exception as e:
        # Log detalhado do erro
        import traceback
        print(
            f"[ERRO] Falha ao efetivar liberação do caso {data.case_id}: "
            f"{str(e)}"
        )
        print(traceback.format_exc())
        raise HTTPException(
            500,
            f"Erro ao efetivar liberação: {str(e)}"
        )



@r.post("/cases/{case_id}/reopen")
async def reopen_case(
    case_id: int,
    user=Depends(require_roles("admin", "financeiro"))
):
    """
    Reabre um caso efetivado para ajustes nos valores.
    - Altera status de contrato_efetivado para financeiro_pendente
    - Exclui receitas automáticas geradas na efetivação
    - Exclui despesas automáticas de imposto e comissão
    - Apenas Admin e Financeiro podem reabrir
    """
    try:
        with SessionLocal() as db:
            # Buscar caso
            case = db.get(Case, case_id)
            if not case:
                raise HTTPException(404, "Caso não encontrado")

            # Verificar se caso está efetivado
            if case.status != "contrato_efetivado":
                raise HTTPException(
                    400,
                    f"Apenas casos efetivados podem ser reabertos. Status atual: {case.status}"
                )

            # Excluir receitas e despesas automáticas criadas pela efetivação
            from ..models import FinanceIncome, FinanceExpense, Contract

            # Buscar contrato vinculado ao caso
            contract = db.query(Contract).filter(Contract.case_id == case_id).first()

            deleted_incomes = 0
            deleted_expenses = 0

            if contract:
                from sqlalchemy import or_  # pyright: ignore[reportMissingImports]

                generated_income_types = [
                    "Consultoria Líquida",
                    "Consultoria Líquida - Atendente",
                    "Consultoria Líquida - Atendente 1",
                    "Consultoria Líquida - Atendente 2",
                    "Consultoria Líquida - Balcão",
                    "Consultoria Bruta",
                    "Consultoria Bruta - Atendente",
                    "Consultoria Bruta - Atendente 1",
                    "Consultoria Bruta - Atendente 2",
                    "Consultoria Bruta - Balcão",
                    "Consultoria - Atendente",
                    "Consultoria - Balcão",
                ]

                # Deletar receitas automáticas (formatos antigos e atuais)
                deleted_incomes = db.query(FinanceIncome).filter(
                    FinanceIncome.income_type.in_(generated_income_types),
                    or_(
                        FinanceIncome.income_name.ilike(f"%Contrato #{contract.id}%"),
                        FinanceIncome.income_name.ilike(f"%Caso #{case_id}%"),
                    )
                ).delete(synchronize_session=False)

                # Deletar despesas automáticas referenciadas diretamente no contrato
                auto_expense_ids = [
                    expense_id
                    for expense_id in [
                        contract.imposto_expense_id,
                        contract.corretor_expense_id,
                    ]
                    if expense_id
                ]
                if auto_expense_ids:
                    deleted_expenses += db.query(FinanceExpense).filter(
                        FinanceExpense.id.in_(auto_expense_ids)
                    ).delete(synchronize_session=False)

                # Deletar despesas automáticas por nome (fallback)
                deleted_expenses += db.query(FinanceExpense).filter(
                    FinanceExpense.expense_type.in_(["Impostos", "Comissão"])
                ).filter(
                    or_(
                        FinanceExpense.expense_name.ilike(f"%Contrato #{contract.id}%"),
                        FinanceExpense.expense_name.ilike(f"%Caso #{case_id}%"),
                    )
                ).delete(synchronize_session=False)

                # Marcar contrato como "em revisão" enquanto está reaberto
                # Será reativado quando for efetivado novamente
                contract.status = "em_revisao"
                contract.imposto_expense_id = None
                contract.corretor_expense_id = None
                contract.updated_at = now_brt()

            # Alterar status do caso
            case.status = "financeiro_pendente"
            case.last_update_at = now_brt()

            # Criar evento
            db.add(CaseEvent(
                case_id=case.id,
                type="finance.reopened",
                payload={
                    "deleted_incomes": deleted_incomes,
                    "deleted_expenses": deleted_expenses,
                    "reopened_by": user.id,
                    "reopened_at": now_brt().isoformat()
                },
                created_by=user.id
            ))

            db.commit()
            db.refresh(case)

        await eventbus.broadcast(
            "case.updated",
            {"case_id": case_id, "status": "financeiro_pendente"}
        )

        return {
            "success": True,
            "case_id": case_id,
            "new_status": "financeiro_pendente",
            "deleted_incomes": deleted_incomes,
            "deleted_expenses": deleted_expenses,
            "message": f"Caso reaberto com sucesso. {deleted_incomes} receitas e {deleted_expenses} despesas excluídas."
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"[ERRO] Falha ao reabrir caso {case_id}: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(500, f"Erro ao reabrir caso: {str(e)}")

@r.get("/commissions")
def get_commissions(
    start_date: str | None = None,
    end_date: str | None = None,
    user_id: int | None = None,
    user=Depends(require_roles("admin", "supervisor", "financeiro"))
):
    """Lista todas as comissões com filtros opcionais"""
    from ..models import CommissionPayout
    from datetime import datetime

    with SessionLocal() as db:
        query = db.query(CommissionPayout).options(
            joinedload(CommissionPayout.beneficiary),
            joinedload(CommissionPayout.creator),
            joinedload(CommissionPayout.contract)
        )

        # Filtro por período
        if start_date:
            try:
                start_filter = datetime.fromisoformat(start_date)
                query = query.filter(
                    CommissionPayout.created_at >= start_filter
                )
            except Exception:
                pass

        if end_date:
            try:
                end_filter = datetime.fromisoformat(end_date)

                # Incluir o dia completo (23:59:59.999999)

                end_filter = end_filter.replace(hour=23, minute=59, second=59, microsecond=999999)
                query = query.filter(
                    CommissionPayout.created_at <= end_filter
                )
            except Exception:
                pass

        # Filtro por usuário beneficiário
        if user_id:
            query = query.filter(
                CommissionPayout.beneficiary_user_id == user_id
            )

        commissions = query.order_by(
            CommissionPayout.created_at.desc()
        ).all()

        items = []
        for comm in commissions:
            items.append({
                "id": comm.id,
                "contract_id": comm.contract_id,
                "case_id": comm.case_id,
                "beneficiary": {
                    "id": comm.beneficiary.id,
                    "name": comm.beneficiary.name,
                    "email": comm.beneficiary.email
                },
                "consultoria_liquida": float(
                    comm.consultoria_liquida
                ),
                "commission_percentage": float(
                    comm.commission_percentage
                ),
                "commission_amount": float(
                    comm.commission_amount
                ),
                "created_at": (
                    comm.created_at.isoformat()
                    if comm.created_at
                    else None
                ),
                "created_by": {
                    "id": comm.creator.id,
                    "name": comm.creator.name
                } if comm.creator else None
            })

        # Totais
        total_commissions = sum(
            float(c.commission_amount) for c in commissions
        )

        return {
            "items": items,
            "total": total_commissions,
            "count": len(items)
        }


@r.post("/cancel/{contract_id}")
async def cancel_contract(
    contract_id: int,
    user=Depends(require_roles("admin", "supervisor", "financeiro"))
):
    """Cancela um contrato efetivado e remove receita associada"""
    with SessionLocal() as db:
        contract = db.get(Contract, contract_id)
        if not contract:
            raise HTTPException(404, "contract not found")

        case = db.get(Case, contract.case_id)
        if not case:
            raise HTTPException(404, "case not found")

        # Verifica se pode ser cancelado
        if case.status != "contrato_efetivado":
            raise HTTPException(
                400, "contract cannot be cancelled in current status"
            )

        # Remover receita associada ao contrato (se existir)
        from ..models import FinanceIncome
        income = db.query(FinanceIncome).filter(
            FinanceIncome.income_name.like(f"Contrato #{contract.id} -%")
        ).first()
        if income:
            db.delete(income)

        # Atualiza status para cancelado
        case.status = "contrato_cancelado"
        case.last_update_at = now_brt()

        # Adiciona evento de cancelamento
        db.add(CaseEvent(
            case_id=case.id,
            type="finance.cancelled",
            payload={"contract_id": contract.id, "cancelled_by": user.id},
            created_by=user.id
        ))

        db.commit()

    await eventbus.broadcast(
        "case.updated",
        {"case_id": case.id, "status": "contrato_cancelado"}
    )
    return {"success": True, "message": "Contract cancelled successfully"}


@r.delete("/delete/{contract_id}")
async def delete_contract(
    contract_id: int,
    user=Depends(require_roles("admin", "supervisor"))
):
    """Deleta permanentemente um contrato, receita associada e todos os dados relacionados"""  # noqa: E501
    with SessionLocal() as db:
        contract = db.get(Contract, contract_id)
        if not contract:
            raise HTTPException(404, "contract not found")

        case = db.get(Case, contract.case_id)
        if not case:
            raise HTTPException(404, "case not found")

        # Remover receita associada ao contrato (se existir)
        from ..models import FinanceIncome
        income = db.query(FinanceIncome).filter(
            FinanceIncome.income_name.like(f"Contrato #{contract.id} -%")
        ).first()
        if income:
            db.delete(income)

        # Remove anexos do contrato
        from ..models import ContractAttachment
        attachments = db.query(ContractAttachment).filter(
            ContractAttachment.contract_id == contract.id
        ).all()

        for attachment in attachments:
            # TODO: Remover arquivo físico do storage
            db.delete(attachment)

        # Remove eventos relacionados ao contrato
        events = db.query(CaseEvent).filter(
            CaseEvent.case_id == case.id,
            CaseEvent.type.in_([
                "finance.disbursed", "finance.cancelled"
            ])
        ).all()

        for event in events:
            db.delete(event)

        # Remove o contrato
        db.delete(contract)

        # Volta o caso para status anterior (financeiro pendente)
        case.status = "financeiro_pendente"
        case.last_update_at = now_brt()

        # Adiciona evento de deleção
        db.add(CaseEvent(
            case_id=case.id,
            type="finance.deleted",
            payload={
                "deleted_contract_id": contract_id,
                "deleted_by": user.id
            },
            created_by=user.id
        ))

        db.commit()

    await eventbus.broadcast(
        "case.updated",
        {"case_id": case.id, "status": "financeiro_pendente"}
    )
    return {"success": True, "message": "Contract deleted successfully"}


# Gestão de Despesas Individuais

class ExpenseInput(BaseModel):
    date: str  # "YYYY-MM-DD"
    expense_type: str  # Tipo da despesa
    expense_name: str  # Nome da despesa
    amount: float
    # Mantido para compatibilidade
    month: int | None = None
    year: int | None = None


@r.get("/expenses")
def list_expenses(
    start_date: str | None = None,
    end_date: str | None = None,
    user=Depends(require_roles("admin", "supervisor", "financeiro"))
):
    """Lista todas as despesas individuais, com filtro opcional por data"""
    from datetime import datetime, timedelta
    with SessionLocal() as db:
        from ..models import FinanceExpense

        # Criar query base
        query = db.query(FinanceExpense)

        # Aplicar filtros de data se fornecidos
        if start_date:
            try:
                start_filter = datetime.fromisoformat(start_date)
                query = query.filter(FinanceExpense.date >= start_filter)
            except Exception:
                pass

        if end_date:
            try:
                end_filter = datetime.fromisoformat(end_date)

                # Incluir o dia completo (23:59:59.999999)

                end_filter = end_filter.replace(hour=23, minute=59, second=59, microsecond=999999)
                query = query.filter(FinanceExpense.date <= end_filter)
            except Exception:
                pass

        expenses = query.order_by(FinanceExpense.date.desc()).all()

        total = sum([float(exp.amount) for exp in expenses])

        return {
            "items": [
                {
                    "id": exp.id,
                    "date": exp.date.isoformat() if exp.date else None,
                    "expense_type": exp.expense_type,
                    "expense_name": exp.expense_name,
                    "amount": float(exp.amount),
                    "attachment_filename": exp.attachment_filename,
                    "attachment_size": exp.attachment_size,
                    "has_attachment": bool(exp.attachment_path),
                    "created_at": (
                        exp.created_at.isoformat()
                        if exp.created_at
                        else None
                    )
                }
                for exp in expenses
            ],
            "total": round(total, 2)
        }


@r.get("/expenses/{expense_id}")
def get_expense(
    expense_id: int,
    user=Depends(require_roles("admin", "supervisor", "financeiro"))
):
    """Obtém uma despesa específica"""
    with SessionLocal() as db:
        from ..models import FinanceExpense
        expense = db.get(FinanceExpense, expense_id)

        if not expense:
            raise HTTPException(404, "Despesa não encontrada")

        return {
            "id": expense.id,
            "date": expense.date.isoformat() if expense.date else None,
            "expense_type": expense.expense_type,
            "expense_name": expense.expense_name,
            "amount": float(expense.amount),
            "created_by": expense.created_by,
            "created_at": (
                expense.created_at.isoformat()
                if expense.created_at
                else None
            ),
            "has_attachment": bool(expense.attachment_path),
            "attachment_filename": expense.attachment_filename,
            "attachment_size": expense.attachment_size,
            "attachment_mime": expense.attachment_mime
        }


@r.post("/expenses")
def create_expense(
    data: ExpenseInput,
    user=Depends(require_roles("admin", "supervisor", "financeiro"))
):
    """Cria uma nova despesa individual"""
    with SessionLocal() as db:
        from ..models import FinanceExpense

        # Validações
        if data.amount is None:
            raise HTTPException(400, "Valor é obrigatório")

        if not isinstance(data.amount, (int, float)):
            raise HTTPException(
                400,
                f"Valor deve ser um número, recebido: {type(data.amount)}"
            )

        if data.amount < 0:
            raise HTTPException(400, "Valor não pode ser negativo")

        if data.amount == 0:
            raise HTTPException(400, "Valor deve ser maior que zero")

        # Parse da data
        try:
            expense_date = datetime.fromisoformat(data.date)
        except ValueError:
            raise HTTPException(400, "Data inválida. Use formato YYYY-MM-DD")

        # Criar despesa
        expense = FinanceExpense(
            date=expense_date,
            month=expense_date.month,
            year=expense_date.year,
            expense_type=data.expense_type,
            expense_name=data.expense_name,
            amount=data.amount,
            created_by=user.id
        )
        db.add(expense)
        db.commit()
        db.refresh(expense)

        return {
            "id": expense.id,
            "date": expense.date.isoformat() if expense.date else None,
            "expense_type": expense.expense_type,
            "expense_name": expense.expense_name,
            "amount": float(expense.amount)
        }


@r.put("/expenses/{expense_id}")
def update_expense(
    expense_id: int,
    data: ExpenseInput,
    user=Depends(require_roles("admin", "supervisor", "financeiro"))
):
    """Atualiza uma despesa existente"""
    with SessionLocal() as db:
        from ..models import FinanceExpense

        expense = db.get(FinanceExpense, expense_id)
        if not expense:
            raise HTTPException(404, "Despesa não encontrada")

        # Validações
        if data.amount is None:
            raise HTTPException(400, "Valor é obrigatório")

        if not isinstance(data.amount, (int, float)):
            raise HTTPException(
                400,
                f"Valor deve ser um número, recebido: {type(data.amount)}"
            )

        if data.amount < 0:
            raise HTTPException(400, "Valor não pode ser negativo")

        if data.amount == 0:
            raise HTTPException(400, "Valor deve ser maior que zero")

        # Parse da data
        try:
            expense_date = datetime.fromisoformat(data.date)
        except ValueError:
            raise HTTPException(400, "Data inválida. Use formato YYYY-MM-DD")

        # Atualizar campos
        expense.date = expense_date
        expense.month = expense_date.month
        expense.year = expense_date.year
        expense.expense_type = data.expense_type
        expense.expense_name = data.expense_name
        expense.amount = data.amount
        expense.updated_at = now_brt()

        db.commit()
        db.refresh(expense)

        return {
            "id": expense.id,
            "date": expense.date.isoformat() if expense.date else None,
            "expense_type": expense.expense_type,
            "expense_name": expense.expense_name,
            "amount": float(expense.amount)
        }


@r.delete("/expenses/{expense_id}")
def delete_expense(
    expense_id: int,
    user=Depends(require_roles("admin", "supervisor", "financeiro"))
):
    """Remove uma despesa (incluindo despesas geradas por comissão)"""
    try:
        with SessionLocal() as db:
            from ..models import FinanceExpense, CommissionPayout

            expense = db.get(FinanceExpense, expense_id)
            if not expense:
                raise HTTPException(404, "Despesa não encontrada")

            # Verificar se há CommissionPayout vinculado
            commission = db.query(CommissionPayout).filter(
                CommissionPayout.expense_id == expense_id
            ).first()

            if commission:
                # Desvincular a comissão da despesa
                commission.expense_id = None
                db.add(commission)

            # Deletar a despesa
            db.delete(expense)
            db.commit()

            return {"message": "Despesa removida com sucesso"}

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"[ERRO] Falha ao deletar despesa {expense_id}: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(500, f"Erro ao remover despesa: {str(e)}")


@r.post("/expenses/{expense_id}/attachment")
def upload_expense_attachment(
    expense_id: int,
    file: UploadFile = File(...),
    user=Depends(require_roles("admin", "supervisor", "financeiro"))
):
    """Upload de anexo para uma despesa (compatibilidade - arquivo único)"""
    from ..models import FinanceExpense
    import uuid

    with SessionLocal() as db:
        expense = db.get(FinanceExpense, expense_id)
        if not expense:
            raise HTTPException(404, "Despesa não encontrada")

    # Criar diretório se não existir
    os.makedirs(settings.upload_dir, exist_ok=True)

    # Gerar nome único para o arquivo
    file_extension = (
        os.path.splitext(file.filename)[1] if file.filename else ""
    )
    unique_filename = (
        f"expense_{expense_id}_{uuid.uuid4().hex[:8]}{file_extension}"
    )
    dest = os.path.join(settings.upload_dir, unique_filename)

    # Salvar arquivo
    try:
        with open(dest, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(500, f"Erro ao salvar arquivo: {str(e)}")

    # Atualizar registro da despesa
    with SessionLocal() as db:
        expense = db.get(FinanceExpense, expense_id)
        expense.attachment_path = dest
        expense.attachment_filename = file.filename or unique_filename
        expense.attachment_size = os.path.getsize(dest)
        expense.attachment_mime = file.content_type
        expense.updated_at = now_brt()

        db.commit()
        db.refresh(expense)

        return {
            "id": expense.id,
            "attachment_filename": expense.attachment_filename,
            "attachment_size": expense.attachment_size,
            "message": "Anexo enviado com sucesso"
        }


@r.post("/expenses/{expense_id}/attachments")
def upload_expense_attachments(
    expense_id: int,
    files: list[UploadFile] = File(...),
    user=Depends(require_roles("admin", "supervisor", "financeiro"))
):
    """Upload de múltiplos anexos para uma despesa"""
    from ..models import FinanceExpense
    import uuid

    with SessionLocal() as db:
        expense = db.get(FinanceExpense, expense_id)
        if not expense:
            raise HTTPException(404, "Despesa não encontrada")

    if not files:
        raise HTTPException(400, "Nenhum arquivo enviado")

    # Criar diretório se não existir
    os.makedirs(settings.upload_dir, exist_ok=True)

    uploaded_files = []

    for file in files:
        # Gerar nome único para cada arquivo
        file_extension = (
            os.path.splitext(file.filename)[1] if file.filename else ""
        )
        unique_filename = (
            f"expense_{expense_id}_{uuid.uuid4().hex[:8]}{file_extension}"
        )
        dest = os.path.join(settings.upload_dir, unique_filename)

        # Salvar arquivo
        try:
            with open(dest, "wb") as f:
                shutil.copyfileobj(file.file, f)

            uploaded_files.append({
                "filename": file.filename or unique_filename,
                "path": dest,
                "size": os.path.getsize(dest),
                "mime": file.content_type
            })
        except Exception as e:
            # Limpar arquivos já salvos em caso de erro
            for uploaded in uploaded_files:
                if os.path.exists(uploaded["path"]):
                    os.remove(uploaded["path"])
            raise HTTPException(
                500,
                f"Erro ao salvar arquivo {file.filename}: {str(e)}"
            )

    # Atualizar registro da despesa com o último arquivo (compatibilidade)
    # Futuro: tabela separada para múltiplos anexos
    if uploaded_files:
        last_file = uploaded_files[-1]
        with SessionLocal() as db:
            expense = db.get(FinanceExpense, expense_id)
            expense.attachment_path = last_file["path"]
            expense.attachment_filename = last_file["filename"]
            expense.attachment_size = last_file["size"]
            expense.attachment_mime = last_file["mime"]
            expense.updated_at = now_brt()

            db.commit()
            db.refresh(expense)

    return {
        "id": expense.id,
        "uploaded_files": len(uploaded_files),
        "files": [
            {"filename": f["filename"], "size": f["size"]}
            for f in uploaded_files
        ],
        "message": f"{len(uploaded_files)} arquivo(s) enviado(s) com sucesso"
        }


@r.get("/expenses/{expense_id}/attachment")
def download_expense_attachment(
    expense_id: int,
    user=Depends(require_roles("admin", "supervisor", "financeiro"))
):
    """Download do anexo de uma despesa"""
    from fastapi.responses import (  # pyright: ignore[reportMissingImports]
        FileResponse
    )

    with SessionLocal() as db:
        from ..models import FinanceExpense
        expense = db.get(FinanceExpense, expense_id)

        if not expense:
            raise HTTPException(404, "Despesa não encontrada")

        if (
            not expense.attachment_path
            or not os.path.exists(expense.attachment_path)
        ):
            raise HTTPException(404, "Anexo não encontrado")

        # Usar o nome original do arquivo ou fallback para o nome salvo
        filename = (
            expense.attachment_filename
            or os.path.basename(expense.attachment_path)
        )

        return FileResponse(
            path=expense.attachment_path,
            media_type=expense.attachment_mime or "application/octet-stream",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"'
            }
        )


@r.delete("/expenses/{expense_id}/attachment")
def delete_expense_attachment(
    expense_id: int,
    user=Depends(require_roles("admin", "supervisor"))
):
    """Remove o anexo de uma despesa"""
    with SessionLocal() as db:
        from ..models import FinanceExpense
        expense = db.get(FinanceExpense, expense_id)

        if not expense:
            raise HTTPException(404, "Despesa não encontrada")

        if expense.attachment_path and os.path.exists(expense.attachment_path):
            os.remove(expense.attachment_path)

        expense.attachment_path = None
        expense.attachment_filename = None
        expense.attachment_size = None
        expense.attachment_mime = None
        expense.updated_at = now_brt()

        db.commit()

        return {"message": "Anexo removido com sucesso"}


# Gestão de Receitas Manuais

class IncomeInput(BaseModel):
    date: str  # "YYYY-MM-DD"
    income_type: str  # Tipo da receita
    income_name: str | None = None  # Nome/descrição da receita
    amount: float
    agent_user_id: int | None = None  # ID do atendente (obrigatório para "Consultoria Bruta")
    client_cpf: str | None = None  # CPF do cliente (obrigatório para "Consultoria Bruta")
    client_name: str | None = None  # Nome do cliente (obrigatório para "Consultoria Bruta")


@r.get("/incomes")
def list_incomes(
    start_date: str | None = None,
    end_date: str | None = None,
    user=Depends(require_roles("admin", "supervisor", "financeiro"))
):
    """Lista todas as receitas manuais, com filtro opcional por data"""
    from datetime import datetime, timedelta
    with SessionLocal() as db:
        from ..models import FinanceIncome

        # Criar query base
        query = db.query(FinanceIncome)

        # Aplicar filtros de data se fornecidos
        if start_date:
            try:
                start_filter = datetime.fromisoformat(start_date)
                query = query.filter(FinanceIncome.date >= start_filter)
            except Exception:
                pass

        if end_date:
            try:
                end_filter = datetime.fromisoformat(end_date)

                # Incluir o dia completo (23:59:59.999999)

                end_filter = end_filter.replace(hour=23, minute=59, second=59, microsecond=999999)
                query = query.filter(FinanceIncome.date <= end_filter)
            except Exception:
                pass

        incomes = query.order_by(FinanceIncome.date.desc()).all()

        total = sum([float(inc.amount) for inc in incomes])

        return {
            "items": [
                {
                    "id": inc.id,
                    "date": inc.date.isoformat() if inc.date else None,
                    "income_type": inc.income_type,
                    "income_name": inc.income_name,
                    "amount": float(inc.amount),
                    "agent_user_id": inc.agent_user_id,
                    "client_cpf": inc.client_cpf,
                    "client_name": inc.client_name,
                    "attachment_filename": inc.attachment_filename,
                    "attachment_size": inc.attachment_size,
                    "has_attachment": bool(inc.attachment_path),
                    "created_by": inc.created_by,
                    "created_at": (
                        inc.created_at.isoformat()
                        if inc.created_at
                        else None
                    )
                }
                for inc in incomes
            ],
            "total": round(total, 2)
        }


@r.post("/incomes")
def create_income(
    data: IncomeInput,
    user=Depends(require_roles("admin", "supervisor", "financeiro"))
):
    """Cria uma nova receita manual"""
    with SessionLocal() as db:
        from ..models import FinanceIncome

        # Validações
        if data.amount < 0:
            raise HTTPException(400, "Valor não pode ser negativo")

        # Validação específica para "Consultoria Bruta"
        if data.income_type == "Consultoria Bruta":
            if not data.agent_user_id:
                raise HTTPException(400, "Atendente é obrigatório para Consultoria Bruta")
            if not data.client_cpf:
                raise HTTPException(400, "CPF do cliente é obrigatório para Consultoria Bruta")
            if not data.client_name:
                raise HTTPException(400, "Nome do cliente é obrigatório para Consultoria Bruta")
            
            # Validar CPF (apenas formato básico)
            cpf_clean = data.client_cpf.replace(".", "").replace("-", "").replace("/", "")
            if len(cpf_clean) != 11 or not cpf_clean.isdigit():
                raise HTTPException(400, "CPF inválido. Use formato: ###.###.###-##")

        # Parse da data
        try:
            income_date = datetime.fromisoformat(data.date)
        except Exception:
            raise HTTPException(400, "Data inválida. Use formato YYYY-MM-DD")

        income = FinanceIncome(
            date=income_date,
            income_type=data.income_type,
            income_name=data.income_name,
            amount=data.amount,
            agent_user_id=data.agent_user_id,
            client_cpf=data.client_cpf,
            client_name=data.client_name,
            created_by=user.id
        )
        db.add(income)
        db.commit()
        db.refresh(income)

        return {
            "id": income.id,
            "date": income.date.isoformat() if income.date else None,
            "income_type": income.income_type,
            "income_name": income.income_name,
            "amount": float(income.amount),
            "created_by": income.created_by,
            "created_at": (
                income.created_at.isoformat() if income.created_at else None
            )
        }


@r.get("/incomes/{income_id}")
def get_income(
    income_id: int,
    user=Depends(require_roles("admin", "supervisor", "financeiro"))
):
    """Busca uma receita específica por ID"""
    with SessionLocal() as db:
        from ..models import FinanceIncome

        income = db.get(FinanceIncome, income_id)
        if not income:
            raise HTTPException(404, "Receita não encontrada")

        return {
            "id": income.id,
            "date": income.date.isoformat() if income.date else None,
            "income_type": income.income_type,
            "income_name": income.income_name,
            "amount": float(income.amount),
            "created_by": income.created_by,
            "created_at": (
                income.created_at.isoformat()
                if income.created_at
                else None
            ),
            "has_attachment": bool(income.attachment_path),
            "attachment_filename": income.attachment_filename,
            "attachment_size": income.attachment_size,
            "attachment_mime": income.attachment_mime
        }


@r.put("/incomes/{income_id}")
def update_income(
    income_id: int,
    data: IncomeInput,
    user=Depends(require_roles("admin", "supervisor", "financeiro"))
):
    """Atualiza uma receita existente"""
    with SessionLocal() as db:
        from ..models import FinanceIncome

        income = db.get(FinanceIncome, income_id)
        if not income:
            raise HTTPException(404, "Receita não encontrada")

        # Validações
        if data.amount < 0:
            raise HTTPException(400, "Valor não pode ser negativo")

        # Parse da data
        try:
            income_date = datetime.fromisoformat(data.date)
        except Exception:
            raise HTTPException(400, "Data inválida. Use formato YYYY-MM-DD")

        # Atualizar campos
        income.date = income_date
        income.income_type = data.income_type
        income.income_name = data.income_name
        income.amount = data.amount
        income.updated_at = now_brt()

        db.commit()
        db.refresh(income)

        return {
            "id": income.id,
            "date": income.date.isoformat() if income.date else None,
            "income_type": income.income_type,
            "income_name": income.income_name,
            "amount": float(income.amount)
        }


@r.delete("/incomes/{income_id}")
def delete_income(
    income_id: int,
    user=Depends(require_roles("admin", "supervisor", "financeiro"))
):
    """Remove uma receita manual"""
    with SessionLocal() as db:
        from ..models import FinanceIncome

        income = db.get(FinanceIncome, income_id)
        if not income:
            raise HTTPException(404, "Receita não encontrada")

        db.delete(income)
        db.commit()

        return {"message": "Receita removida com sucesso"}


@r.post("/incomes/{income_id}/attachment")
def upload_income_attachment(
    income_id: int,
    file: UploadFile = File(...),
    user=Depends(require_roles("admin", "supervisor", "financeiro"))
):
    """Upload de anexo para uma receita (compatibilidade - arquivo único)"""
    from ..models import FinanceIncome
    import uuid

    with SessionLocal() as db:
        income = db.get(FinanceIncome, income_id)
        if not income:
            raise HTTPException(404, "Receita não encontrada")

    # Criar diretório se não existir
    os.makedirs(settings.upload_dir, exist_ok=True)

    # Gerar nome único para o arquivo
    file_extension = (
        os.path.splitext(file.filename)[1] if file.filename else ""
    )
    unique_filename = (
        f"income_{income_id}_{uuid.uuid4().hex[:8]}{file_extension}"
    )
    dest = os.path.join(settings.upload_dir, unique_filename)

    # Salvar arquivo
    try:
        with open(dest, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(500, f"Erro ao salvar arquivo: {str(e)}")

    # Atualizar registro da receita
    with SessionLocal() as db:
        income = db.get(FinanceIncome, income_id)
        income.attachment_path = dest
        income.attachment_filename = file.filename or unique_filename
        income.attachment_size = os.path.getsize(dest)
        income.attachment_mime = file.content_type
        income.updated_at = now_brt()

        db.commit()
        db.refresh(income)

        return {
            "id": income.id,
            "attachment_filename": income.attachment_filename,
            "attachment_size": income.attachment_size,
            "message": "Anexo enviado com sucesso"
        }


@r.post("/incomes/{income_id}/attachments")
def upload_income_attachments(
    income_id: int,
    files: list[UploadFile] = File(...),
    user=Depends(require_roles("admin", "supervisor", "financeiro"))
):
    """Upload de múltiplos anexos para uma receita"""
    from ..models import FinanceIncome
    import uuid

    with SessionLocal() as db:
        income = db.get(FinanceIncome, income_id)
        if not income:
            raise HTTPException(404, "Receita não encontrada")

    if not files:
        raise HTTPException(400, "Nenhum arquivo enviado")

    # Criar diretório se não existir
    os.makedirs(settings.upload_dir, exist_ok=True)

    uploaded_files = []

    for file in files:
        # Gerar nome único para cada arquivo
        file_extension = (
            os.path.splitext(file.filename)[1] if file.filename else ""
        )
        unique_filename = (
            f"income_{income_id}_{uuid.uuid4().hex[:8]}{file_extension}"
        )
        dest = os.path.join(settings.upload_dir, unique_filename)

        # Salvar arquivo
        try:
            with open(dest, "wb") as f:
                shutil.copyfileobj(file.file, f)

            uploaded_files.append({
                "filename": file.filename or unique_filename,
                "path": dest,
                "size": os.path.getsize(dest),
                "mime": file.content_type
            })
        except Exception as e:
            # Limpar arquivos já salvos em caso de erro
            for uploaded in uploaded_files:
                if os.path.exists(uploaded["path"]):
                    os.remove(uploaded["path"])
            raise HTTPException(
                500,
                f"Erro ao salvar arquivo {file.filename}: {str(e)}"
            )

    # Atualizar registro da receita com o último arquivo (compatibilidade)
    # Futuro: tabela separada para múltiplos anexos
    if uploaded_files:
        last_file = uploaded_files[-1]
        with SessionLocal() as db:
            income = db.get(FinanceIncome, income_id)
            income.attachment_path = last_file["path"]
            income.attachment_filename = last_file["filename"]
            income.attachment_size = last_file["size"]
            income.attachment_mime = last_file["mime"]
            income.updated_at = now_brt()

            db.commit()
            db.refresh(income)

    return {
        "id": income.id,
        "uploaded_files": len(uploaded_files),
        "files": [
            {"filename": f["filename"], "size": f["size"]}
            for f in uploaded_files
        ],
        "message": f"{len(uploaded_files)} arquivo(s) enviado(s) com sucesso"
        }


@r.get("/incomes/{income_id}/attachment")
def download_income_attachment(
    income_id: int,
    user=Depends(require_roles("admin", "supervisor", "financeiro"))
):
    """Download do anexo de uma receita"""
    from fastapi.responses import (  # pyright: ignore[reportMissingImports]
        FileResponse
    )

    with SessionLocal() as db:
        from ..models import FinanceIncome
        income = db.get(FinanceIncome, income_id)

        if not income:
            raise HTTPException(404, "Receita não encontrada")

        if (
            not income.attachment_path
            or not os.path.exists(income.attachment_path)
        ):
            raise HTTPException(404, "Anexo não encontrado")

        # Usar o nome original do arquivo ou fallback para o nome salvo
        filename = (
            income.attachment_filename
            or os.path.basename(income.attachment_path)
        )

        return FileResponse(
            path=income.attachment_path,
            media_type=income.attachment_mime or "application/octet-stream",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"'
            }
        )


@r.delete("/incomes/{income_id}/attachment")
def delete_income_attachment(
    income_id: int,
    user=Depends(require_roles("admin", "supervisor"))
):
    """Remove o anexo de uma receita"""
    with SessionLocal() as db:
        from ..models import FinanceIncome
        income = db.get(FinanceIncome, income_id)

        if not income:
            raise HTTPException(404, "Receita não encontrada")

        if income.attachment_path and os.path.exists(income.attachment_path):
            os.remove(income.attachment_path)

        income.attachment_path = None
        income.attachment_filename = None
        income.attachment_size = None
        income.attachment_mime = None
        income.updated_at = now_brt()

        db.commit()

        return {"message": "Anexo removido com sucesso"}


# Séries Temporais para Gráficos

@r.get("/timeseries")
def get_timeseries(
    user=Depends(require_roles("admin", "supervisor", "financeiro"))
):
    """Retorna séries temporais agregadas por mês para alimentar gráficos"""
    from ..models import FinanceIncome, FinanceExpense, Simulation
    from sqlalchemy import (  # pyright: ignore[reportMissingImports]
        func, extract
    )
    from datetime import timedelta

    with SessionLocal() as db:
        # Definir intervalo de tempo (últimos 6 meses)
        six_months_ago = now_brt() - timedelta(days=180)

        # Agregação de receitas por mês (consultoria líquida)
        revenue_query = db.query(
            extract('year', Simulation.updated_at).label('year'),
            extract('month', Simulation.updated_at).label('month'),
            func.sum(Simulation.custo_consultoria_liquido).label('total')
        ).join(Case).filter(
            Simulation.status == "approved",
            Simulation.updated_at >= six_months_ago
        ).group_by('year', 'month').all()

        revenue_dict = {}
        for row in revenue_query:
            key = f"{int(row.year)}-{int(row.month):02d}"
            revenue_dict[key] = float(row.total or 0)

        # Agregação de receitas manuais por mês
        manual_income_query = db.query(
            extract('year', FinanceIncome.date).label('year'),
            extract('month', FinanceIncome.date).label('month'),
            func.sum(FinanceIncome.amount).label('total')
        ).filter(
            FinanceIncome.date >= six_months_ago
        ).group_by('year', 'month').all()

        for row in manual_income_query:
            key = f"{int(row.year)}-{int(row.month):02d}"
            revenue_dict[key] = (
                revenue_dict.get(key, 0) + float(row.total or 0)
            )

        # Agregação de despesas por mês
        expenses_query = db.query(
            FinanceExpense.year,
            FinanceExpense.month,
            FinanceExpense.amount
        ).filter(
            FinanceExpense.year >= six_months_ago.year
        ).all()

        expenses_dict = {}
        for row in expenses_query:
            key = f"{row.year}-{row.month:02d}"
            expenses_dict[key] = float(row.amount or 0)

        # Calcular impostos (14% da consultoria) por mês
        tax_query = db.query(
            extract('year', Simulation.updated_at).label('year'),
            extract('month', Simulation.updated_at).label('month'),
            func.sum(Simulation.custo_consultoria).label('total')
        ).join(Case).filter(
            Simulation.status == "approved",
            Simulation.updated_at >= six_months_ago
        ).group_by('year', 'month').all()

        tax_dict = {}
        for row in tax_query:
            key = f"{int(row.year)}-{int(row.month):02d}"
            tax_dict[key] = float(row.total or 0) * 0.14

        # Agregação de comissões por mês
        commissions_query = db.query(
            extract('year', FinanceExpense.date).label('year'),
            extract('month', FinanceExpense.date).label('month'),
            func.sum(FinanceExpense.amount).label('total')
        ).filter(
            FinanceExpense.date >= six_months_ago,
            FinanceExpense.expense_type == "Comissão"
        ).group_by('year', 'month').all()

        commissions_dict = {}
        for row in commissions_query:
            key = f"{int(row.year)}-{int(row.month):02d}"
            commissions_dict[key] = float(row.total or 0)

        # Gerar lista de meses completa
        months = []
        current = now_brt().replace(day=1)
        for i in range(6):
            month_key = current.strftime("%Y-%m")
            month_label = current.strftime("%b/%Y")
            months.insert(0, {
                "key": month_key,
                "label": month_label
            })
            # Voltar um mês
            if current.month == 1:
                current = current.replace(year=current.year - 1, month=12)
            else:
                current = current.replace(month=current.month - 1)

        # Montar séries
        revenue_series = []
        expenses_series = []
        tax_series = []
        commissions_series = []
        net_profit_series = []

        for month in months:
            key = month["key"]
            revenue = revenue_dict.get(key, 0)
            expenses = expenses_dict.get(key, 0)
            tax = tax_dict.get(key, 0)
            commissions = commissions_dict.get(key, 0)
            net_profit = revenue - expenses - tax

            revenue_series.append(
                {"date": month["label"], "value": round(revenue, 2)}
            )
            expenses_series.append(
                {"date": month["label"], "value": round(expenses, 2)}
            )
            tax_series.append(
                {"date": month["label"], "value": round(tax, 2)}
            )
            commissions_series.append(
                {"date": month["label"], "value": round(commissions, 2)}
            )
            net_profit_series.append(
                {"date": month["label"], "value": round(net_profit, 2)}
            )

        return {
            "revenue": revenue_series,
            "expenses": expenses_series,
            "tax": tax_series,
            "commissions": commissions_series,
            "netProfit": net_profit_series
        }


# Buscar detalhes de contrato individual

@r.get("/contracts/{contract_id}")
def get_contract_details(
    contract_id: int,
    user=Depends(require_roles("admin", "supervisor", "financeiro"))
):
    """Retorna detalhes completos de um contrato específico"""
    from ..models import ContractAttachment

    with SessionLocal() as db:
        contract = db.get(Contract, contract_id)
        if not contract:
            raise HTTPException(404, "Contrato não encontrado")

        # Buscar caso e cliente associados
        case = db.get(Case, contract.case_id)
        from ..models import Client
        client = db.get(Client, case.client_id) if case else None

        # Buscar anexos
        attachments = db.query(ContractAttachment).filter(
            ContractAttachment.contract_id == contract_id
        ).all()

        return {
            "id": contract.id,
            "case_id": contract.case_id,
            "status": contract.status,
            "total_amount": float(contract.total_amount or 0),
            "installments": contract.installments,
            "paid_installments": contract.paid_installments,
            "disbursed_at": (
                contract.disbursed_at.isoformat()
                if contract.disbursed_at
                else None
            ),
            "created_at": (
                contract.created_at.isoformat()
                if contract.created_at
                else None
            ),
            "consultoria_valor_liquido": float(
                contract.consultoria_valor_liquido or 0
            ),
            "client": {
                "id": client.id,
                "name": client.name,
                "cpf": client.cpf,
                "matricula": client.matricula,
                "orgao": getattr(client, "orgao", None)
            } if client else None,
            "case": {
                "id": case.id,
                "status": case.status
            } if case else None,
            "attachments": [
                {
                    "id": att.id,
                    "filename": att.filename,
                    "size": att.size,
                    "mime": att.mime,
                    "created_at": (
                        att.created_at.isoformat()
                        if att.created_at
                        else None
                    )
                } for att in attachments
            ]
        }


# Endpoint para buscar categorias únicas

@r.get("/categories")
def get_categories(
    user=Depends(require_roles("admin", "supervisor", "financeiro"))
):
    """Retorna todas as categorias únicas de receitas e despesas"""
    from ..models import FinanceIncome, FinanceExpense

    with SessionLocal() as db:
        # Buscar tipos únicos de receitas
        income_types = db.query(FinanceIncome.income_type).distinct().all()
        income_categories = [row[0] for row in income_types if row[0]]

        # Buscar tipos únicos de despesas
        expense_types = db.query(FinanceExpense.expense_type).distinct().all()
        expense_categories = [row[0] for row in expense_types if row[0]]

        return {
            "receitas": sorted(income_categories),
            "despesas": sorted(expense_categories),
            "todas": sorted(list(set(income_categories + expense_categories)))
        }


# Endpoint unificado de Receitas e Despesas

@r.get("/transactions")
def get_transactions(
    start_date: str | None = None,
    end_date: str | None = None,
    transaction_type: str | None = None,  # "receita", "despesa", ou None
    category: str | None = None,  # Filtro por categoria
    user=Depends(require_roles("admin", "supervisor", "financeiro"))
):
    """Retorna receitas e despesas unificadas com filtros opcionais"""
    from ..models import FinanceIncome, FinanceExpense, ExternalClientIncome
    from datetime import datetime

    try:
        with SessionLocal() as db:
            # Parse de datas se fornecidas
            start = None
            end = None
            if start_date:
                try:
                    start = datetime.fromisoformat(start_date)
                except Exception:
                    pass
            if end_date:
                try:
                    end = datetime.fromisoformat(end_date)
                    #  Incluir o dia completo (23:59:59.999999)
                    end = end.replace(hour=23, minute=59, second=59, microsecond=999999)
                except Exception:
                    pass

            transactions = []

            # Buscar receitas
            if not transaction_type or transaction_type == "receita":
                # Receitas manuais
                incomes_query = db.query(FinanceIncome).options(
                    joinedload(FinanceIncome.agent),
                    joinedload(FinanceIncome.creator)
                )
                if start:
                    incomes_query = incomes_query.filter(
                        FinanceIncome.date >= start
                    )
                if end:
                    incomes_query = incomes_query.filter(
                        FinanceIncome.date <= end
                    )
                if category:
                    incomes_query = incomes_query.filter(
                        FinanceIncome.income_type == category
                    )

                incomes = incomes_query.all()
                for inc in incomes:
                    # Extrair case_id do nome da receita
                    case_id = None
                    contract_id = None
                    client_name = None
                    client_cpf = None

                    if (
                        inc.income_name
                        and inc.income_name.startswith("Contrato #")
                    ):
                        try:
                            contract_id = int(
                                inc.income_name.split("#")[1].split(" ")[0]
                            )
                            # Buscar contrato para pegar informações do cliente
                            contract = (
                                db.query(Contract)
                                .options(
                                    joinedload(Contract.case)
                                    .joinedload(Case.client)
                                )
                                .filter(Contract.id == contract_id)
                                .first()
                            )

                            if (
                                contract
                                and contract.case
                                and contract.case.client
                            ):
                                case_id = contract.case_id
                                client_name = contract.case.client.name
                                client_cpf = contract.case.client.cpf
                        except Exception:
                            pass
                    else:
                        # Para receitas manuais (Consultoria Bruta), pegar os campos diretamente
                        client_name = inc.client_name
                        client_cpf = inc.client_cpf

                    transactions.append({
                        "id": f"receita-{inc.id}",
                        "type": "receita",
                        "date": inc.date.isoformat() if inc.date else None,
                        "category": inc.income_type,
                        "name": inc.income_name,
                        "amount": float(inc.amount),
                        "created_by": inc.created_by,
                        "created_at": (
                            inc.created_at.isoformat()
                            if inc.created_at
                            else None
                        ),
                        "agent_name": (
                            inc.agent.name if inc.agent else None
                        ),
                        "agent_user_id": inc.agent_user_id,
                        "has_attachment": bool(inc.attachment_path),
                        "attachment_filename": inc.attachment_filename,
                        "attachment_size": inc.attachment_size,
                        "attachment_mime": inc.attachment_mime,
                        "case_id": case_id,
                        "contract_id": contract_id,
                        "client_name": client_name,
                        "client_cpf": client_cpf
                    })

                # Receitas de clientes externos
                external_incomes_query = db.query(ExternalClientIncome).options(
                    joinedload(ExternalClientIncome.owner),
                    joinedload(ExternalClientIncome.creator)
                )
                if start:
                    external_incomes_query = external_incomes_query.filter(
                        ExternalClientIncome.date >= start
                    )
                if end:
                    external_incomes_query = external_incomes_query.filter(
                        ExternalClientIncome.date <= end
                    )

                external_incomes = external_incomes_query.all()
                for ext_inc in external_incomes:
                    transactions.append({
                        "id": f"external-{ext_inc.id}",
                        "type": "receita",
                        "date": ext_inc.date.isoformat() if ext_inc.date else None,
                        "category": "Cliente Externo",
                        "name": f"{ext_inc.nome_cliente} ({ext_inc.cpf_cliente})",
                        "amount": float(ext_inc.custo_consultoria_liquido),
                        "created_by": ext_inc.created_by,
                        "created_at": (
                            ext_inc.created_at.isoformat()
                            if ext_inc.created_at
                            else None
                        ),
                        "agent_name": (
                            ext_inc.owner.name if ext_inc.owner else None
                        ),
                        "agent_user_id": ext_inc.owner_user_id,
                        "has_attachment": bool(ext_inc.attachment_path),
                        "attachment_filename": ext_inc.attachment_filename,
                        "attachment_size": ext_inc.attachment_size,
                        "attachment_mime": ext_inc.attachment_mime,
                        "client_name": ext_inc.nome_cliente,
                        "client_cpf": ext_inc.cpf_cliente
                    })

            # Buscar despesas
            if not transaction_type or transaction_type == "despesa":
                expenses_query = db.query(FinanceExpense).options(
                    joinedload(FinanceExpense.creator),
                    joinedload(FinanceExpense.agent)
                )
                if start:
                    expenses_query = expenses_query.filter(
                        FinanceExpense.date >= start
                    )
                if end:
                    expenses_query = expenses_query.filter(
                        FinanceExpense.date <= end
                    )
                if category:
                    expenses_query = expenses_query.filter(
                        FinanceExpense.expense_type == category
                    )

                expenses = expenses_query.all()
                for exp in expenses:
                    transactions.append({
                        "id": f"despesa-{exp.id}",
                        "type": "despesa",
                        "date": exp.date.isoformat() if exp.date else None,
                        "category": exp.expense_type,
                        "name": exp.expense_name,
                        "amount": float(exp.amount),
                        "created_by": exp.created_by,
                        "created_at": (
                            exp.created_at.isoformat()
                            if exp.created_at
                            else None
                        ),
                        "agent_name": (
                            exp.agent.name if exp.agent else
                            (exp.creator.name if exp.creator else None)
                        ),
                        "agent_user_id": exp.agent_user_id,
                        "client_cpf": exp.client_cpf,
                        "client_name": exp.client_name,
                        "has_attachment": bool(exp.attachment_path),
                        "attachment_filename": exp.attachment_filename,
                        "attachment_size": exp.attachment_size,
                        "attachment_mime": exp.attachment_mime
                    })

            # Ordenar por data (mais recente primeiro)
            transactions.sort(
                key=lambda x: x["date"] if x["date"] else "",
                reverse=True
            )

            # Calcular totais
            total_receitas = sum(
                [t["amount"] for t in transactions if t["type"] == "receita"]
            )
            total_despesas = sum(
                [t["amount"] for t in transactions if t["type"] == "despesa"]
            )
            saldo = total_receitas - total_despesas

            return {
                "items": transactions,
                "total": len(transactions),
                "totals": {
                    "receitas": round(total_receitas, 2),
                    "despesas": round(total_despesas, 2),
                    "saldo": round(saldo, 2)
                }
            }

    except Exception as e:
        # Log detalhado do erro
        import traceback
        print(
            f"[ERRO] Falha ao buscar transações: {str(e)}"
        )
        print(
            f"  Parâmetros: start_date={start_date}, end_date={end_date}, "
            f"type={transaction_type}, category={category}"
        )
        print(traceback.format_exc())
        raise HTTPException(500, f"Erro ao buscar transações: {str(e)}")

# Exportação de Relatórios


@r.get("/export")
def export_finance_report(
    start_date: str | None = None,
    end_date: str | None = None,
    transaction_type: str | None = None,
    category: str | None = None,
    full_report: str | None = None,
    user=Depends(require_roles("admin", "supervisor", "financeiro"))
):
    """Gera relatório CSV consolidado de finanças"""
    from ..models import FinanceIncome, FinanceExpense, Simulation
    from datetime import datetime, timedelta

    with SessionLocal() as db:
        # Definir período de busca
        if full_report == "true":
            # Relatório completo - buscar todos os dados
            start_filter = None
            end_filter = None
        else:
            # Usar filtros de data fornecidos ou padrão (últimos 6 meses)
            if start_date:
                try:
                    start_filter = datetime.fromisoformat(start_date)
                except Exception:
                    start_filter = now_brt() - timedelta(days=180)
            else:
                start_filter = now_brt() - timedelta(days=180)

            if end_date:
                try:
                    end_filter = datetime.fromisoformat(end_date)

                    # Incluir o dia completo (23:59:59.999999)

                    end_filter = end_filter.replace(hour=23, minute=59, second=59, microsecond=999999)
                except Exception:
                    end_filter = now_brt()
            else:
                end_filter = now_brt()

        # Preparar dados para o CSV
        rows = []

        # Consultorias aprovadas
        simulations_query = db.query(Simulation).join(Case).filter(
            Simulation.status == "approved"
        )

        if start_filter:
            simulations_query = simulations_query.filter(
                Simulation.updated_at >= start_filter
            )
        if end_filter:
            simulations_query = simulations_query.filter(
                Simulation.updated_at <= end_filter
            )

        simulations = simulations_query.all()

        # Incluir consultorias apenas se não há filtro de tipo ou se é receita
        if not transaction_type or transaction_type == "receita":
            for sim in simulations:
                rows.append({
                    "date": (
                        sim.updated_at.strftime("%Y-%m-%d")
                        if sim.updated_at
                        else ""
                    ),
                    "type": "consultoria",
                    "description": (
                        f"Consultoria líquida - Caso #{sim.case_id}"
                    ),
                    "amount": float(sim.custo_consultoria_liquido or 0)
                })
                rows.append({
                    "date": (
                        sim.updated_at.strftime("%Y-%m-%d")
                        if sim.updated_at
                        else ""
                    ),
                    "type": "tax",
                    "description": (
                        f"Imposto (14%) - Caso #{sim.case_id}"
                    ),
                    "amount": float(sim.custo_consultoria or 0) * 0.14
                })

        # Receitas manuais
        if not transaction_type or transaction_type == "receita":
            incomes_query = db.query(FinanceIncome)

            if start_filter:
                incomes_query = incomes_query.filter(
                    FinanceIncome.date >= start_filter
                )
            if end_filter:
                incomes_query = incomes_query.filter(
                    FinanceIncome.date <= end_filter
                )
            if category:
                incomes_query = incomes_query.filter(
                    FinanceIncome.income_type == category
                )

            incomes = incomes_query.all()

            for inc in incomes:
                rows.append({
                    "date": inc.date.strftime("%Y-%m-%d") if inc.date else "",
                    "type": "manual_income",
                    "description": (
                        inc.income_name or "Receita manual"
                    ),
                    "amount": float(inc.amount or 0)
                })

        # Despesas
        if not transaction_type or transaction_type == "despesa":
            expenses_query = db.query(FinanceExpense)

            if start_filter:
                expenses_query = expenses_query.filter(
                    FinanceExpense.year >= start_filter.year
                )
            if end_filter:
                expenses_query = expenses_query.filter(
                    FinanceExpense.year <= end_filter.year
                )
            if category:
                expenses_query = expenses_query.filter(
                    FinanceExpense.expense_type == category
                )

            expenses = expenses_query.all()

            for exp in expenses:
                rows.append({
                    "date": f"{exp.year}-{exp.month:02d}-01",
                    "type": "expense",
                    "description": (
                        exp.expense_name
                        or f"Despesas {exp.month}/{exp.year}"
                    ),
                    "amount": float(exp.amount or 0)
                })

        # Ordenar por data
        rows.sort(key=lambda x: x["date"], reverse=True)

        # Gerar CSV
        output = io.StringIO()
        writer = csv.DictWriter(
            output, fieldnames=["date", "type", "description", "amount"]
        )
        writer.writeheader()
        writer.writerows(rows)

        # Retornar como arquivo CSV
        csv_content = output.getvalue()
        output.close()

        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={
                "Content-Disposition": (
                    "attachment; filename=finance_report.csv"
                )
            }
        )


@r.get("/data")
def get_financial_data(
    from_date: str | None = None,
    to_date: str | None = None,
    month: str | None = None,
    user=Depends(
        require_roles(
            "admin", "supervisor", "financeiro", "calculista", "fechamento"
        )
    )
):
    """Retorna dados financeiros agregados para cálculo de KPIs"""
    from ..models import FinanceIncome, FinanceExpense, User
    from datetime import datetime
    from sqlalchemy import func  # pyright: ignore[reportMissingImports]

    with SessionLocal() as db:
        # Definir período de busca
        if month:
            # Se month for fornecido (formato YYYY-MM), usar o mês específico
            try:
                year, month_num = month.split('-')
                start_date = datetime(int(year), int(month_num), 1)
                if int(month_num) == 12:
                    end_date = datetime(int(year) + 1, 1, 1)
                else:
                    end_date = datetime(int(year), int(month_num) + 1, 1)
            except Exception:
                # Fallback para mês atual
                now = now_brt()
                start_date = datetime(now.year, now.month, 1)
                if now.month == 12:
                    end_date = datetime(now.year + 1, 1, 1)
                else:
                    end_date = datetime(now.year, now.month + 1, 1)
        elif from_date and to_date:
            try:
                start_date = datetime.fromisoformat(from_date)
                end_date = datetime.fromisoformat(to_date)
            except Exception:
                # Fallback para mês atual
                now = now_brt()
                start_date = datetime(now.year, now.month, 1)
                if now.month == 12:
                    end_date = datetime(now.year + 1, 1, 1)
                else:
                    end_date = datetime(now.year, now.month + 1, 1)
        else:
            # Padrão: mês atual
            now = now_brt()
            start_date = datetime(now.year, now.month, 1)
            if now.month == 12:
                end_date = datetime(now.year + 1, 1, 1)
            else:
                end_date = datetime(now.year, now.month + 1, 1)

        # Calcular receita total
        receita_total = db.query(
            func.coalesce(func.sum(FinanceIncome.amount), 0)
        ).filter(
            FinanceIncome.date >= start_date,
            FinanceIncome.date < end_date
        ).scalar() or 0

        # Calcular consultoria líquida (86% da receita)
        consultoria_liquida = float(receita_total) * 0.86

        # Calcular total de despesas (sem impostos)
        despesas = db.query(
            func.coalesce(func.sum(FinanceExpense.amount), 0)
        ).filter(
            FinanceExpense.date >= start_date,
            FinanceExpense.date < end_date,
            FinanceExpense.expense_type != "Impostos"
        ).scalar() or 0

        # Calcular lucro líquido
        lucro_liquido = consultoria_liquida - float(despesas)

        # Meta Mensal = (10% do Lucro Líquido) - (Receitas do atendente Peltson)
        meta_mensal = lucro_liquido * 0.10
        
        # Buscar o usuário Peltson pelo email
        peltson = db.query(User).filter(User.email == "peltson@gmail.com").first()
        
        # Somar receitas do Peltson (tipo "Consultoria Líquida - Atendente")
        receitas_peltson = 0
        if peltson:
            receitas_peltson = db.query(
                func.coalesce(func.sum(FinanceIncome.amount), 0)
            ).filter(
                FinanceIncome.agent_id == peltson.id,
                FinanceIncome.income_type == "Consultoria Líquida - Atendente",
                FinanceIncome.date >= start_date,
                FinanceIncome.date < end_date
            ).scalar() or 0
        
        # Calcular Meta Mensal final
        meta_mensal = meta_mensal - float(receitas_peltson)

        return {
            "receita_liquida": float(receita_total),
            "consultoria_liquida": round(consultoria_liquida, 2),
            "despesas": float(despesas),
            "resultado": lucro_liquido,
            "meta_mensal": round(meta_mensal, 2),
            "periodo": {
                "inicio": start_date.isoformat(),
                "fim": end_date.isoformat()
            }
        }


# Gestão de Receitas de Clientes Externos

@r.post("/external-incomes")
def create_external_income(
    data: dict,
    user=Depends(require_roles("admin", "supervisor", "financeiro"))
):
    """Cria uma nova receita de cliente externo"""
    from ..models import ExternalClientIncome, User
    from ..schemas import ExternalClientIncomeCreate
    import uuid

    try:
        # Validar dados com schema
        income_data = ExternalClientIncomeCreate(**data)
    except Exception as e:
        raise HTTPException(400, f"Dados inválidos: {str(e)}")

    with SessionLocal() as db:
        # Verificar se owner_user_id existe
        owner = db.get(User, income_data.owner_user_id)
        if not owner:
            raise HTTPException(404, "Usuário proprietário não encontrado")

        # Calcular totais
        banks = income_data.banks_json
        saldo_total = sum([b.saldo_devedor for b in banks])
        liberado_total = sum([b.liberado for b in banks])
        valor_parcela_total = sum([b.valor_parcela for b in banks])

        total_financiado = saldo_total + income_data.seguro
        custo_consultoria = liberado_total * (income_data.percentual_consultoria / 100)
        custo_consultoria_liquido = custo_consultoria * 0.86
        liberado_cliente = liberado_total - custo_consultoria
        valor_liquido = liberado_cliente

        # Converter banks_json para dict
        banks_dict = [b.model_dump() for b in banks]

        # Criar receita externa
        external_income = ExternalClientIncome(
            date=income_data.date,
            cpf_cliente=income_data.cpf_cliente,
            nome_cliente=income_data.nome_cliente,
            banks_json=banks_dict,
            prazo=income_data.prazo,
            coeficiente=income_data.coeficiente,
            seguro=income_data.seguro,
            percentual_consultoria=income_data.percentual_consultoria,
            valor_parcela_total=valor_parcela_total,
            saldo_total=saldo_total,
            liberado_total=liberado_total,
            total_financiado=total_financiado,
            valor_liquido=valor_liquido,
            custo_consultoria=custo_consultoria,
            custo_consultoria_liquido=custo_consultoria_liquido,
            liberado_cliente=liberado_cliente,
            owner_user_id=income_data.owner_user_id,
            created_by=user.id
        )

        db.add(external_income)
        db.commit()
        db.refresh(external_income)

        return {
            "id": external_income.id,
            "message": "Receita de cliente externo criada com sucesso"
        }


@r.get("/external-incomes")
def list_external_incomes(
    user=Depends(require_roles("admin", "supervisor", "financeiro"))
):
    """Lista todas as receitas de clientes externos"""
    from ..models import ExternalClientIncome
    from sqlalchemy.orm import joinedload  # pyright: ignore[reportMissingImports]

    with SessionLocal() as db:
        incomes = db.query(ExternalClientIncome).options(
            joinedload(ExternalClientIncome.owner),
            joinedload(ExternalClientIncome.creator)
        ).order_by(ExternalClientIncome.date.desc()).all()

        return {
            "items": [
                {
                    "id": inc.id,
                    "date": inc.date.isoformat() if inc.date else None,
                    "cpf_cliente": inc.cpf_cliente,
                    "nome_cliente": inc.nome_cliente,
                    "custo_consultoria_liquido": float(inc.custo_consultoria_liquido),
                    "owner_name": inc.owner.name if inc.owner else None,
                    "created_by_name": inc.creator.name if inc.creator else None,
                    "has_attachment": bool(inc.attachment_path),
                    "created_at": inc.created_at.isoformat() if inc.created_at else None
                }
                for inc in incomes
            ]
        }


@r.get("/external-incomes/{income_id}")
def get_external_income(
    income_id: int,
    user=Depends(require_roles("admin", "supervisor", "financeiro"))
):
    """Busca uma receita de cliente externo por ID"""
    from ..models import ExternalClientIncome
    from sqlalchemy.orm import joinedload  # pyright: ignore[reportMissingImports]

    with SessionLocal() as db:
        income = db.query(ExternalClientIncome).options(
            joinedload(ExternalClientIncome.owner),
            joinedload(ExternalClientIncome.creator)
        ).filter(ExternalClientIncome.id == income_id).first()

        if not income:
            raise HTTPException(404, "Receita de cliente externo não encontrada")

        return {
            "id": income.id,
            "date": income.date.isoformat() if income.date else None,
            "cpf_cliente": income.cpf_cliente,
            "nome_cliente": income.nome_cliente,
            "banks_json": income.banks_json,
            "prazo": income.prazo,
            "coeficiente": income.coeficiente,
            "seguro": float(income.seguro),
            "percentual_consultoria": float(income.percentual_consultoria),
            "valor_parcela_total": float(income.valor_parcela_total),
            "saldo_total": float(income.saldo_total),
            "liberado_total": float(income.liberado_total),
            "total_financiado": float(income.total_financiado),
            "valor_liquido": float(income.valor_liquido),
            "custo_consultoria": float(income.custo_consultoria),
            "custo_consultoria_liquido": float(income.custo_consultoria_liquido),
            "liberado_cliente": float(income.liberado_cliente),
            "owner_user_id": income.owner_user_id,
            "owner_name": income.owner.name if income.owner else None,
            "attachment_path": income.attachment_path,
            "attachment_filename": income.attachment_filename,
            "attachment_size": income.attachment_size,
            "attachment_mime": income.attachment_mime,
            "has_attachment": bool(income.attachment_path),
            "created_by": income.created_by,
            "created_by_name": income.creator.name if income.creator else None,
            "created_at": income.created_at.isoformat() if income.created_at else None,
            "updated_at": income.updated_at.isoformat() if income.updated_at else None
        }


@r.put("/external-incomes/{income_id}")
def update_external_income(
    income_id: int,
    data: dict,
    user=Depends(require_roles("admin", "supervisor", "financeiro"))
):
    """Atualiza uma receita de cliente externo"""
    from ..models import ExternalClientIncome, User
    from ..schemas import ExternalClientIncomeUpdate

    try:
        # Validar dados com schema
        update_data = ExternalClientIncomeUpdate(**data)
    except Exception as e:
        raise HTTPException(400, f"Dados inválidos: {str(e)}")

    with SessionLocal() as db:
        income = db.get(ExternalClientIncome, income_id)
        if not income:
            raise HTTPException(404, "Receita de cliente externo não encontrada")

        # Atualizar campos fornecidos
        if update_data.date is not None:
            income.date = update_data.date
        if update_data.cpf_cliente is not None:
            income.cpf_cliente = update_data.cpf_cliente
        if update_data.nome_cliente is not None:
            income.nome_cliente = update_data.nome_cliente
        if update_data.banks_json is not None:
            banks_dict = [b.model_dump() for b in update_data.banks_json]
            income.banks_json = banks_dict
        if update_data.prazo is not None:
            income.prazo = update_data.prazo
        if update_data.coeficiente is not None:
            income.coeficiente = update_data.coeficiente
        if update_data.seguro is not None:
            income.seguro = update_data.seguro
        if update_data.percentual_consultoria is not None:
            income.percentual_consultoria = update_data.percentual_consultoria
        if update_data.owner_user_id is not None:
            owner = db.get(User, update_data.owner_user_id)
            if not owner:
                raise HTTPException(404, "Usuário proprietário não encontrado")
            income.owner_user_id = update_data.owner_user_id

        # Recalcular totais se houver mudança em banks_json ou outros parâmetros
        if (update_data.banks_json is not None or update_data.seguro is not None
            or update_data.percentual_consultoria is not None):
            banks = income.banks_json
            saldo_total = sum([b['saldo_devedor'] for b in banks])
            liberado_total = sum([b['liberado'] for b in banks])
            valor_parcela_total = sum([b['valor_parcela'] for b in banks])

            income.saldo_total = saldo_total
            income.liberado_total = liberado_total
            income.valor_parcela_total = valor_parcela_total
            income.total_financiado = saldo_total + income.seguro
            income.custo_consultoria = liberado_total * (income.percentual_consultoria / 100)
            income.custo_consultoria_liquido = income.custo_consultoria * 0.86
            income.liberado_cliente = liberado_total - income.custo_consultoria
            income.valor_liquido = income.liberado_cliente

        income.updated_at = now_brt()

        db.commit()
        db.refresh(income)

        return {
            "id": income.id,
            "message": "Receita de cliente externo atualizada com sucesso"
        }


@r.delete("/external-incomes/{income_id}")
def delete_external_income(
    income_id: int,
    user=Depends(require_roles("admin", "supervisor"))
):
    """Remove uma receita de cliente externo"""
    from ..models import ExternalClientIncome

    with SessionLocal() as db:
        income = db.get(ExternalClientIncome, income_id)
        if not income:
            raise HTTPException(404, "Receita de cliente externo não encontrada")

        # Remover anexo se existir
        if income.attachment_path and os.path.exists(income.attachment_path):
            os.remove(income.attachment_path)

        db.delete(income)
        db.commit()

        return {"message": "Receita de cliente externo removida com sucesso"}


@r.post("/external-incomes/{income_id}/attachment")
def upload_external_income_attachment(
    income_id: int,
    file: UploadFile = File(...),
    user=Depends(require_roles("admin", "supervisor", "financeiro"))
):
    """Upload de anexo para uma receita de cliente externo"""
    from ..models import ExternalClientIncome
    import uuid

    with SessionLocal() as db:
        income = db.get(ExternalClientIncome, income_id)
        if not income:
            raise HTTPException(404, "Receita de cliente externo não encontrada")

    # Criar diretório se não existir
    os.makedirs(settings.upload_dir, exist_ok=True)

    # Gerar nome único para o arquivo
    file_extension = os.path.splitext(file.filename)[1] if file.filename else ""
    unique_filename = f"external_income_{income_id}_{uuid.uuid4().hex[:8]}{file_extension}"
    dest = os.path.join(settings.upload_dir, unique_filename)

    # Salvar arquivo
    try:
        with open(dest, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(500, f"Erro ao salvar arquivo: {str(e)}")

    # Atualizar registro
    with SessionLocal() as db:
        income = db.get(ExternalClientIncome, income_id)
        income.attachment_path = dest
        income.attachment_filename = file.filename or unique_filename
        income.attachment_size = os.path.getsize(dest)
        income.attachment_mime = file.content_type
        income.updated_at = now_brt()

        db.commit()
        db.refresh(income)

        return {
            "id": income.id,
            "attachment_filename": income.attachment_filename,
            "attachment_size": income.attachment_size,
            "message": "Anexo enviado com sucesso"
        }


@r.get("/external-incomes/{income_id}/attachment")
def download_external_income_attachment(
    income_id: int,
    user=Depends(require_roles("admin", "supervisor", "financeiro"))
):
    """Download do anexo de uma receita de cliente externo"""
    from fastapi.responses import FileResponse  # pyright: ignore[reportMissingImports]
    from ..models import ExternalClientIncome

    with SessionLocal() as db:
        income = db.get(ExternalClientIncome, income_id)

        if not income:
            raise HTTPException(404, "Receita de cliente externo não encontrada")

        if not income.attachment_path or not os.path.exists(income.attachment_path):
            raise HTTPException(404, "Anexo não encontrado")

        filename = income.attachment_filename or os.path.basename(income.attachment_path)

        return FileResponse(
            path=income.attachment_path,
            media_type=income.attachment_mime or "application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )


@r.delete("/external-incomes/{income_id}/attachment")
def delete_external_income_attachment(
    income_id: int,
    user=Depends(require_roles("admin", "supervisor"))
):
    """Remove o anexo de uma receita de cliente externo"""
    from ..models import ExternalClientIncome

    with SessionLocal() as db:
        income = db.get(ExternalClientIncome, income_id)

        if not income:
            raise HTTPException(404, "Receita de cliente externo não encontrada")

        if income.attachment_path and os.path.exists(income.attachment_path):
            os.remove(income.attachment_path)

        income.attachment_path = None
        income.attachment_filename = None
        income.attachment_size = None
        income.attachment_mime = None
        income.updated_at = now_brt()

        db.commit()

        return {"message": "Anexo removido com sucesso"}
