from fastapi import APIRouter, Depends, HTTPException, Query  # pyright: ignore[reportMissingImports]
from sqlalchemy.orm import Session  # pyright: ignore[reportMissingImports]
from sqlalchemy import func, or_, distinct, cast, String  # pyright: ignore[reportMissingImports]
from typing import List
import csv
import io
from ..db import SessionLocal
from ..rbac import require_roles
from ..models import (
    Client, Case, CaseEvent, PayrollClient, PayrollContract, PayrollLine,
    ClientPhone, ClientAddress, SiapeLine, ClientSiapeInfo
)
from ..schemas import (
    ClientAddressCreate, ClientAddressUpdate, ClientAddressResponse,
    BulkCadastroRow, BulkCadastroImportResponse
)
from pydantic import BaseModel  # pyright: ignore[reportMissingImports]
from datetime import datetime
import re




def normalize_bank_name(name: str) -> str:
    """Normaliza nome de banco para agrupar variações."""
    if not name:
        return name
    normalized = name.upper().strip()

    # BANCO DO BRASIL: tratar PRIMEIRO antes de remover BRASIL
    if 'BANCO DO BRASIL' in normalized:
        return 'BANCO DO BRASIL'

    # Remover sufixos societários
    normalized = normalized.replace(' S.A.', '').replace(' S/A', '').replace(' S.A', '')

    # Padronizar bancos específicos
    if 'SANTANDER' in normalized and not normalized.startswith('BANCO'):
        normalized = 'BANCO SANTANDER'
    elif 'SANATANDER' in normalized:
        normalized = 'BANCO SANTANDER'
    elif 'DAYCOVAL' in normalized and not normalized.startswith('BANCO'):
        normalized = 'BANCO DAYCOVAL'
    elif 'DIGIO' in normalized and 'PREVIDENCIA' not in normalized:
        normalized = 'BANCO DIGIO'
    elif 'FUTURO PREVID' in normalized:
        return 'FUTURO PREVIDÊNCIA'
    elif 'EQUATORIAL PREVID' in normalized:
        return 'EQUATORIAL PREVIDÊNCIA'

    # Remover CARTÃO e BRASIL do final (após tratar casos especiais)
    normalized = normalized.replace(' CARTAO', '').replace(' CARTÃO', '')
    if normalized.endswith(' BRASIL'):
        normalized = normalized[:-7]

    # Remover espaços duplos
    return ' '.join(normalized.split())

r = APIRouter(prefix="/clients", tags=["clients"])


class PageOut(BaseModel):
    items: list[dict]
    total: int
    page: int
    page_size: int


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def build_case_agent_filter(agent_id: int):
    assignment_history_text = cast(Case.assignment_history, String)
    return or_(
        Case.assigned_user_id == agent_id,
        assignment_history_text.like(f'%\"user_id\": {agent_id},%'),
        assignment_history_text.like(f'%\"user_id\": {agent_id}}}%'),
        assignment_history_text.like(f'%\"to_user_id\": {agent_id},%'),
        assignment_history_text.like(f'%\"to_user_id\": {agent_id}}}%'),
        assignment_history_text.like(f'%\"from_user_id\": {agent_id},%'),
        assignment_history_text.like(f'%\"from_user_id\": {agent_id}}}%'),
    )


def apply_client_list_filters(
    clients_query,
    *,
    db: Session,
    user,
    q: str | None = None,
    banco: str | None = None,
    cargo: str | None = None,
    status: str | None = None,
    sem_contratos: bool | None = None,
    exclude_siape: bool = False,
    agent_id: int | None = None,
):
    if q:
        like = f"%{q}%"
        clients_query = clients_query.filter(
            or_(
                Client.name.ilike(like),
                Client.cpf.ilike(like),
                Client.matricula.ilike(like)
            )
        )

    if banco:
        normalized_bank = normalize_bank_name(banco)

        if normalized_bank == "SIAPE":
            clients_query = clients_query.filter(Case.source == "siape")
        else:
            all_entities = db.query(PayrollLine.entity_name).filter(
                PayrollLine.entity_name.isnot(None)
            ).distinct().all()
            matching_entities = [
                entity_name
                for (entity_name,) in all_entities
                if normalize_bank_name(entity_name) == normalized_bank
            ]

            siape_entities = db.query(SiapeLine.banco_emprestimo).filter(
                SiapeLine.banco_emprestimo.isnot(None)
            ).distinct().all()
            matching_siape_entities = [
                entity_name
                for (entity_name,) in siape_entities
                if normalize_bank_name(entity_name) == normalized_bank
            ]

            conditions = []
            if matching_entities:
                conditions.append(
                    db.query(PayrollLine.id).filter(
                        PayrollLine.cpf == Client.cpf,
                        PayrollLine.entity_name.in_(matching_entities)
                    ).exists()
                )
            if matching_siape_entities:
                conditions.append(
                    db.query(SiapeLine.id).filter(
                        SiapeLine.cpf == Client.cpf,
                        SiapeLine.banco_emprestimo.in_(matching_siape_entities)
                    ).exists()
                )
                conditions.append(
                    db.query(Case.id).filter(
                        Case.client_id == Client.id,
                        Case.source == "siape",
                        Case.entidade.in_(matching_siape_entities)
                    ).exists()
                )

            if conditions:
                clients_query = clients_query.filter(or_(*conditions))

    if exclude_siape:
        clients_query = clients_query.filter(
            or_(Case.source.is_(None), Case.source != "siape")
        )

    if cargo:
        clients_query = clients_query.filter(Client.cargo == cargo)

    if status:
        clients_query = clients_query.filter(Case.status == status)

    if sem_contratos:
        clients_query = clients_query.filter(
            ~db.query(PayrollLine.id).filter(
                PayrollLine.cpf == Client.cpf,
                PayrollLine.matricula == Client.matricula
            ).exists()
        )

    if agent_id is not None and user.role in ["admin", "supervisor"]:
        clients_query = clients_query.filter(
            db.query(Case.id).filter(
                Case.client_id == Client.id,
                build_case_agent_filter(agent_id),
            ).exists()
        )

    return clients_query


@r.get("", response_model=PageOut)
def list_clients(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    q: str | None = None,
    banco: str | None = None,
    cargo: str | None = None,
    status: str | None = None,
    agent_id: int | None = None,
    exclude_siape: bool = Query(False),
    sem_contratos: bool | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_roles(
        "admin", "supervisor", "financeiro", "calculista", "atendente",
        "fechamento"
    ))
):
    """
    Lista clientes do sistema principal com casos e contratos associados.
    Unifica dados de ambos os sistemas (Client e PayrollClient).

    Args:
        page: Número da página (começa em 1)
        page_size: Itens por página (padrão 20, máximo 200)
        q: Busca por nome, CPF ou matrícula
        banco: Filtrar por banco/entidade importada (entity_name de PayrollLine)
        cargo: Filtrar por cargo do cliente
        status: Filtrar por status do caso
        sem_contratos: Se True, filtra apenas clientes sem financiamentos
    """
    # Query base dos clientes com contagem de casos
    clients_query = db.query(
        Client.id,
        Client.name.label("nome"),
        Client.cpf,
        Client.matricula,
        Client.orgao,
        Client.cargo,
        func.count(Case.id).label("casos_count")
    ).outerjoin(
        Case, Case.client_id == Client.id
    )

    clients_query = apply_client_list_filters(
        clients_query,
        db=db,
        user=user,
        q=q,
        banco=banco,
        cargo=cargo,
        status=status,
        sem_contratos=sem_contratos,
        exclude_siape=exclude_siape,
        agent_id=agent_id,
    )

    # Agrupar antes de contar
    clients_query = clients_query.group_by(
        Client.id, Client.name, Client.cpf, Client.matricula, Client.orgao, Client.cargo
    )

    # Contar total ANTES da paginação
    total = clients_query.count()

    # Aplicar ordenação e paginação
    clients_query = clients_query.order_by(Client.id.desc()).offset(
        (page-1)*page_size
    ).limit(page_size)

    results = []
    for client_data in clients_query.all():
        # Contar financiamentos diretamente de PayrollLine pelo CPF
        contratos_count = db.query(func.count(PayrollLine.id)).filter(
            PayrollLine.cpf == client_data.cpf
        ).scalar() or 0

        results.append({
            "id": client_data.id,
            "cpf": client_data.cpf,
            "matricula": client_data.matricula,
            "nome": client_data.nome,
            "orgao": client_data.orgao,
            "cargo": client_data.cargo,
            "contratos": contratos_count,
            "casos": client_data.casos_count,
            "created_at": None  # Campo não disponível no modelo Client
        })

    return {
        "items": results,
        "total": total,
        "page": page,
        "page_size": page_size
    }


@r.get("/filters")
def get_available_filters(
    db: Session = Depends(get_db),
    user=Depends(require_roles(
        "admin", "supervisor", "financeiro", "calculista", "atendente",
        "fechamento"
    ))
):
    """
    Retorna filtros disponíveis para a esteira (bancos, cargos e status).
    Bancos = agrupados por cases.entidade normalizado, com contagem de casos novos.
    """
    # Listar status de casos únicos do banco de dados
    db_status_list = db.query(Case.status).distinct().all()
    db_status_set = set(s[0] for s in db_status_list if s[0])

    # Bancos: agrupar cases.entidade por nome normalizado, contar casos novos
    entidades_raw = db.query(Case.entidade).filter(
        Case.entidade.isnot(None)
    ).distinct().all()
    entidades_list = [e[0] for e in entidades_raw if e[0]]

    bancos_agrupados: dict[str, list[str]] = {}
    for entidade in entidades_list:
        normalized = normalize_bank_name(entidade)
        bancos_agrupados.setdefault(normalized, []).append(entidade)

    bancos_with_count = []
    for normalized_name, entidades_grupo in sorted(bancos_agrupados.items()):
        # Contar apenas casos com status 'novo'
        count = (
            db.query(func.count(Case.id))
            .filter(
                Case.entidade.in_(entidades_grupo),
                Case.status == "novo",
            )
            .scalar()
        ) or 0
        if count > 0:
            bancos_with_count.append({
                "value": normalized_name,
                "label": normalized_name,
                "count": count,
            })

    # Ordenar por contagem decrescente
    bancos_with_count.sort(key=lambda x: x["count"], reverse=True)

    # Adicionar entrada especial SIAPE (casos importados via SIAPE)
    siape_count = (
        db.query(func.count(Case.id))
        .filter(Case.source == "siape", Case.status == "novo")
        .scalar()
    ) or 0
    if siape_count > 0:
        bancos_with_count.append({
            "value": "SIAPE",
            "label": "SIAPE (Gov Federal)",
            "count": siape_count,
        })

    # Status padrão que devem SEMPRE aparecer nos filtros
    # Ordem: Novo → Simulação → Calculista → Fechamento → Financeiro → Final
    default_statuses = {
        "novo": "Novo",
        "em_atendimento": "Em Atendimento",
        "calculista_pendente": "Calculista Pendente",
        "calculo_aprovado": "Cálculo Aprovado",
        "calculo_rejeitado": "Cálculo Rejeitado",
        "fechamento_pendente": "Fechamento Pendente",
        "fechamento_aprovado": "Fechamento Aprovado",
        "financeiro_pendente": "Financeiro Pendente",
        "contrato_efetivado": "Contrato Efetivado",
        "devolvido_financeiro": "Devolvido Financeiro",
        "caso_cancelado": "Cancelado",
        "encerrado": "Encerrado",
        "sem_contato": "Sem Contato",
        "arquivado": "Arquivado",
    }

    # Mesclar status do banco com status padrão
    all_statuses = set(default_statuses.keys()) | db_status_set

    status_with_count = []
    for status in sorted(all_statuses):
        count = db.query(func.count(distinct(Case.client_id))).filter(
            Case.status == status
        ).scalar() or 0

        status_with_count.append({
            "value": status,
            "label": default_statuses.get(status, status.replace("_", " ").title()),
            "count": count
        })


    # Cargos: agrupar por clients.cargo, contar casos novos associados
    cargos_raw = db.query(Client.cargo).filter(
        Client.cargo.isnot(None),
        Client.cargo != "",
    ).distinct().all()
    cargos_list = sorted([c[0] for c in cargos_raw if c[0]])

    cargos_with_count = []
    for cargo in cargos_list:
        count = (
            db.query(func.count(Case.id))
            .join(Client, Client.id == Case.client_id)
            .filter(Client.cargo == cargo, Case.status == "novo")
            .scalar()
        ) or 0
        if count > 0:
            cargos_with_count.append({
                "value": cargo,
                "label": cargo,
                "count": count,
            })
    cargos_with_count.sort(key=lambda x: x["count"], reverse=True)

    return {
        "bancos": bancos_with_count,
        "cargos": cargos_with_count,
        "status": status_with_count,
    }


@r.get("/stats")
def get_clients_stats(
    db: Session = Depends(get_db),
    user=Depends(require_roles(
        "admin", "supervisor", "financeiro", "calculista", "atendente",
        "fechamento"
    ))
):
    """
    Retorna estatísticas gerais dos clientes (KPIs).
    """
    from datetime import datetime, timedelta

    # Total de clientes
    total_clients = db.query(func.count(Client.id)).scalar() or 0

    # Clientes novos (últimos 30 dias)
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    new_clients = (
        db.query(func.count(distinct(Case.client_id)))
        .filter(Case.created_at >= thirty_days_ago)
        .scalar() or 0
    )

    # Total de casos
    total_cases = db.query(func.count(Case.id)).scalar() or 0

    # Casos ativos (status abertos)
    active_statuses = [
        "novo", "disponivel", "em_atendimento", "calculista",
        "calculista_pendente", "financeiro", "fechamento_pendente"
    ]
    active_cases = (
        db.query(func.count(Case.id))
        .filter(Case.status.in_(active_statuses))
        .scalar() or 0
    )

    # Casos finalizados (cálculo aprovado, fechamento aprovado, contrato efetivado)
    completed_statuses = [
        "calculo_aprovado", "fechamento_aprovado", "contrato_efetivado"
    ]
    completed_cases = (
        db.query(func.count(Case.id))
        .filter(Case.status.in_(completed_statuses))
        .scalar() or 0
    )

    # Total de contratos (financiamentos)
    from app.models import PayrollLine
    total_contracts = db.query(func.count(PayrollLine.id)).scalar() or 0

    # Clientes únicos com contratos
    clients_with_contracts = (
        db.query(func.count(Client.id))
        .filter(
            db.query(PayrollLine.id)
            .filter(
                PayrollLine.cpf == Client.cpf,
                PayrollLine.matricula == Client.matricula
            )
            .exists()
        )
        .scalar() or 0
    )

    # Taxa de conversão (casos finalizados / total de casos)
    conversion_rate = round(
        (completed_cases / total_cases * 100), 1
    ) if total_cases > 0 else 0

    return {
        "total_clients": total_clients,
        "new_clients": new_clients,
        "total_cases": total_cases,
        "active_cases": active_cases,
        "completed_cases": completed_cases,
        "total_contracts": total_contracts,
        "clients_with_contracts": clients_with_contracts,
        "conversion_rate": conversion_rate
    }


@r.get("/export")
def export_clients_csv(
    q: str | None = None,
    banco: str | None = None,
    cargo: str | None = None,
    status: str | None = None,
    agent_id: int | None = None,
    exclude_siape: bool = Query(False),
    sem_contratos: bool | None = None,
    fields: str = Query(default="nome,cpf,matricula,orgao", description="Campos separados por vírgula"),
    db: Session = Depends(get_db),
    user=Depends(require_roles(
        "admin", "supervisor", "financeiro", "calculista", "atendente",
        "fechamento"
    ))
):
    """
    Exporta clientes filtrados para CSV.
    Aceita os mesmos filtros do endpoint de listagem.

    Args:
        q: Busca por nome, CPF ou matrícula
        banco: Filtrar por banco/entidade
        cargo: Filtrar por cargo do cliente
        status: Filtrar por status do caso
        sem_contratos: Filtrar apenas clientes sem financiamentos
        fields: Campos a exportar, separados por vírgula
    """
    # Parse dos campos
    selected_fields = [f.strip() for f in fields.split(',') if f.strip()]
    
    # Query base dos clientes - similar a list_clients mas sem paginação
    clients_query = db.query(
        Client.id,
        Client.name,
        Client.cpf,
        Client.matricula,
        Client.orgao,
        Client.cargo,
        Client.telefone_preferencial,
        Client.numero_cliente,
        Client.observacoes,
        Client.banco,
        Client.agencia,
        Client.conta,
        Client.chave_pix,
        Client.tipo_chave_pix,
        Client.orgao_pgto_code,
        Client.orgao_pgto_name,
        Client.status_desconto,
        Client.status_legenda,
        func.count(Case.id).label("casos_count")
    ).outerjoin(
        Case, Case.client_id == Client.id
    )
    
    clients_query = apply_client_list_filters(
        clients_query,
        db=db,
        user=user,
        q=q,
        banco=banco,
        cargo=cargo,
        status=status,
        sem_contratos=sem_contratos,
        exclude_siape=exclude_siape,
        agent_id=agent_id,
    )
    
    # Agrupar por cliente
    clients_query = clients_query.group_by(
        Client.id, Client.name, Client.cpf, Client.matricula, Client.orgao, Client.cargo,
        Client.telefone_preferencial, Client.numero_cliente, Client.observacoes,
        Client.banco, Client.agencia, Client.conta, Client.chave_pix,
        Client.tipo_chave_pix, Client.orgao_pgto_code, Client.orgao_pgto_name,
        Client.status_desconto, Client.status_legenda
    ).order_by(Client.id.desc())
    
    clients_data = clients_query.all()
    
    # Buscar contadores de forma otimizada - uma única query por tipo
    client_ids = list(set([c.id for c in clients_data]))
    client_cpfs = list(set([c.cpf for c in clients_data if c.cpf]))
    
    # Mapear contratos por CPF (uma única query)
    contratos_by_cpf = {}
    if client_cpfs:
        contratos_data = db.query(
            PayrollLine.cpf,
            func.count(PayrollLine.id).label('count')
        ).filter(
            PayrollLine.cpf.in_(client_cpfs)
        ).group_by(PayrollLine.cpf).all()
        contratos_by_cpf = {row.cpf: row.count for row in contratos_data}
    
    # Mapear casos ativos por client_id (uma única query)
    casos_ativos_by_id = {}
    if client_ids:
        active_statuses = [
            "novo", "disponivel", "em_atendimento", "calculista",
            "calculista_pendente", "financeiro", "fechamento_pendente"
        ]
        casos_ativos_data = db.query(
            Case.client_id,
            func.count(Case.id).label('count')
        ).filter(
            Case.client_id.in_(client_ids),
            Case.status.in_(active_statuses)
        ).group_by(Case.client_id).all()
        casos_ativos_by_id = {row.client_id: row.count for row in casos_ativos_data}
    
    # Mapear casos finalizados por client_id (uma única query)
    casos_finalizados_by_id = {}
    if client_ids:
        completed_statuses = [
            "calculo_aprovado", "fechamento_aprovado", "contrato_efetivado"
        ]
        casos_finalizados_data = db.query(
            Case.client_id,
            func.count(Case.id).label('count')
        ).filter(
            Case.client_id.in_(client_ids),
            Case.status.in_(completed_statuses)
        ).group_by(Case.client_id).all()
        casos_finalizados_by_id = {row.client_id: row.count for row in casos_finalizados_data}
    
    # Processar dados
    results = []
    for client_data in clients_data:
        # Buscar contadores dos dicionários pré-calculados
        contratos_count = contratos_by_cpf.get(client_data.cpf, 0)
        # Somar financiamentos SIAPE (siape_lines) para o mesmo CPF
        siape_count = db.query(func.count(SiapeLine.id)).filter(
            SiapeLine.cpf == client_data.cpf
        ).scalar() or 0
        contratos_count += siape_count
        casos_ativos = casos_ativos_by_id.get(client_data.id, 0)
        casos_finalizados = casos_finalizados_by_id.get(client_data.id, 0)
        
        # Formatar CPF
        cpf_formatted = ""
        if client_data.cpf:
            cpf_clean = client_data.cpf
            if len(cpf_clean) == 11:
                cpf_formatted = f"{cpf_clean[:3]}.{cpf_clean[3:6]}.{cpf_clean[6:9]}-{cpf_clean[9:]}"
            else:
                cpf_formatted = cpf_clean
        
        results.append({
            "id": client_data.id,
            "nome": client_data.name or "",
            "cpf": cpf_formatted,
            "matricula": client_data.matricula or "",
            "orgao": client_data.orgao or "",
            "cargo": client_data.cargo or "",
            "telefone_preferencial": client_data.telefone_preferencial or "",
            "numero_cliente": client_data.numero_cliente or "",
            "observacoes": client_data.observacoes or "",
            "banco": client_data.banco or "",
            "agencia": client_data.agencia or "",
            "conta": client_data.conta or "",
            "chave_pix": client_data.chave_pix or "",
            "tipo_chave_pix": client_data.tipo_chave_pix or "",
            "orgao_pgto_code": client_data.orgao_pgto_code or "",
            "orgao_pgto_name": client_data.orgao_pgto_name or "",
            "status_desconto": client_data.status_desconto or "",
            "status_legenda": client_data.status_legenda or "",
            "total_casos": client_data.casos_count,
            "total_contratos": contratos_count,
            "total_financiamentos": contratos_count,
            "casos_ativos": casos_ativos,
            "casos_finalizados": casos_finalizados,
        })
    
    # Gerar CSV
    output = io.StringIO()
    
    # Definir nomes amigáveis para campos
    field_mapping = {
        "id": "ID",
        "nome": "Nome",
        "cpf": "CPF",
        "matricula": "Matrícula",
        "orgao": "Órgão",
        "cargo": "Cargo",
        "telefone_preferencial": "Telefone",
        "numero_cliente": "Número Cliente",
        "observacoes": "Observações",
        "banco": "Banco",
        "agencia": "Agência",
        "conta": "Conta",
        "chave_pix": "Chave PIX",
        "tipo_chave_pix": "Tipo Chave PIX",
        "orgao_pgto_code": "Cód. Órgão Pagador",
        "orgao_pgto_name": "Nome Órgão Pagador",
        "status_desconto": "Status Desconto",
        "status_legenda": "Descrição Status",
        "total_casos": "Total Casos",
        "total_contratos": "Total Contratos",
        "total_financiamentos": "Total Financiamentos",
        "casos_ativos": "Casos Ativos",
        "casos_finalizados": "Casos Finalizados",
    }
    
    # Filtrar campos solicitados
    available_fields = [f for f in field_mapping.keys() if f in selected_fields]
    if not available_fields:
        available_fields = ["nome", "cpf", "matricula", "orgao"]
    
    # Adicionar BOM para Excel (UTF-8 BOM)
    output.write('\ufeff')
    
    # Escrever CSV
    writer = csv.DictWriter(output, fieldnames=available_fields)
    
    # Escrever cabeçalho com nomes amigáveis
    header_row = {}
    for field in available_fields:
        header_row[field] = field_mapping.get(field, field)
    writer.writerow(header_row)
    
    # Escrever dados
    for row in results:
        # Preparar row com apenas os campos solicitados
        filtered_row = {}
        for field in available_fields:
            filtered_row[field] = row.get(field, "")
        writer.writerow(filtered_row)
    
    csv_content = output.getvalue()
    
    # Retornar como streaming response
    from fastapi.responses import Response
    
    return Response(
        content=csv_content.encode('utf-8'),
        media_type='text/csv; charset=utf-8',
        headers={
            "Content-Disposition": 'attachment; filename="clientes_export.csv"'
        }
    )


@r.get("/{client_id}")
def get_client(
    client_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_roles(
        "admin", "supervisor", "financeiro", "calculista", "atendente",
        "fechamento"
    ))
):
    """
    Retorna detalhes de um cliente específico com contratos e casos.
    """
    # Buscar no sistema principal
    c = db.query(Client).get(client_id)
    if not c:
        raise HTTPException(404, "Cliente não encontrado")

    # Buscar casos do cliente
    cases = db.query(Case).filter_by(
        client_id=c.id
    ).order_by(Case.id.desc()).all()

    # Buscar todas as matrículas do CPF no sistema payroll
    payroll_clients = db.query(PayrollClient).filter(
        PayrollClient.cpf == c.cpf
    ).all()

    contracts = []
    for pc in payroll_clients:
        # Buscar contratos de cada matrícula
        payroll_contracts = db.query(PayrollContract).filter_by(
            client_id=pc.id
        ).order_by(
            PayrollContract.referencia_year.desc(),
            PayrollContract.referencia_month.desc()
        ).all()

        for ct in payroll_contracts:
            contracts.append({
                "id": ct.id,
                "matricula": pc.matricula,
                "entidade_code": ct.entidade_code,
                "entidade_name": ct.entidade_name,
                "ref": f"{ct.referencia_month:02d}/{ct.referencia_year}",
                "valor_parcela": str(ct.valor_parcela),
                "total_parcelas": ct.total_parcelas,
                "parcelas_pagas": ct.parcelas_pagas,
                "status": ct.status,
                "cargo": ct.cargo,
                "fin": ct.fin,
                "orgao_codigo": ct.orgao_codigo,
                "lanc": ct.lanc,
                "created_at": (
                    ct.created_at.isoformat() if ct.created_at else None
                ),
            })

    return {
        "id": c.id,
        "cpf": c.cpf,
        "matricula": c.matricula,
        "nome": c.name,
        "orgao": c.orgao,
        "cargo": c.cargo,
        "telefone_preferencial": c.telefone_preferencial or "",
        "observacoes": c.observacoes or "",
        "created_at": None,  # Placeholder
        "siape_info": (
            {
                "nascimento": siape_info.nascimento,
                "idade": siape_info.idade,
                "banco_emprestimo": siape_info.banco_emprestimo,
                "prazo_restante": siape_info.prazo_restante,
                "prazo_total": siape_info.prazo_total,
                "parcelas_pagas": siape_info.parcelas_pagas,
                "valor_parcela": float(siape_info.valor_parcela or 0),
                "saldo_devedor": float(siape_info.saldo_devedor or 0),
                "endereco_completo": siape_info.endereco_completo,
                "cidade": siape_info.cidade,
                "bairro": siape_info.bairro,
                "cep": siape_info.cep,
                "email": siape_info.email,
            }
        ) if (siape_info := db.query(ClientSiapeInfo).filter(ClientSiapeInfo.client_id == c.id).first()) else None,
        "siape_financiamentos": [
            {
                "id": line.id,
                "banco_emprestimo": line.banco_emprestimo,
                "valor_parcela": float(line.valor_parcela or 0),
                "saldo_devedor": float(line.saldo_devedor or 0),
                "prazo_total": line.prazo_total,
                "parcelas_pagas": line.parcelas_pagas,
                "ref_month": line.ref_month,
                "ref_year": line.ref_year,
                "status_code": line.status_code,
                "status_description": line.status_description,
            } for line in db.query(SiapeLine).filter(SiapeLine.cpf == c.cpf).all()
        ],
        "contracts": contracts,
        "cases": [
            {
                "id": case.id,
                "status": case.status,
                "entidade": case.entidade,
                "referencia_competencia": case.referencia_competencia,
                "last_update_at": (
                    case.last_update_at.isoformat()
                    if case.last_update_at else None
                ),
                "assigned_to": (
                    case.assigned_user.name
                    if case.assigned_user else None
                ),
            } for case in cases
        ]
    }


@r.get("/{client_id}/contracts")
def get_client_contracts(
    client_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_roles(
        "admin", "supervisor", "financeiro", "calculista", "atendente",
        "fechamento"
    ))
):
    """
    Retorna todos os contratos de todas as matrículas do CPF.
    """
    # Buscar no sistema principal
    client = db.query(Client).get(client_id)
    if not client:
        raise HTTPException(404, "Cliente não encontrado")

    # Buscar todas as matrículas do CPF no sistema payroll
    payroll_clients = db.query(PayrollClient).filter(
        PayrollClient.cpf == client.cpf
    ).all()

    if not payroll_clients:
        return []

    # Buscar contratos de todas as matrículas
    all_contracts = []
    for pc in payroll_clients:
        contracts = db.query(PayrollContract).filter_by(
            client_id=pc.id
        ).order_by(
            PayrollContract.referencia_year.desc(),
            PayrollContract.referencia_month.desc()
        ).all()

        for ct in contracts:
            all_contracts.append({
                "id": ct.id,
                "matricula": pc.matricula,
                "entidade_code": ct.entidade_code,
                "entidade_name": ct.entidade_name,
                "ref": f"{ct.referencia_month:02d}/{ct.referencia_year}",
                "valor_parcela": str(ct.valor_parcela),
                "total_parcelas": ct.total_parcelas,
                "parcelas_pagas": ct.parcelas_pagas,
                "status": ct.status,
                "cargo": ct.cargo,
                "fin": ct.fin,
                "orgao_codigo": ct.orgao_codigo,
                "lanc": ct.lanc,
                "created_at": (
                    ct.created_at.isoformat() if ct.created_at else None
                ),
            })

    return all_contracts


@r.get("/{client_id}/cases")
def get_client_cases(
    client_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_roles(
        "admin", "supervisor", "financeiro", "calculista", "atendente",
        "fechamento"
    ))
):
    """
    Retorna TODOS os casos de TODAS as matrículas do mesmo CPF.
    Isso garante que se um CPF tem múltiplas matrículas,
    todos os casos serão exibidos independente de qual registro foi acessado.
    """
    # Buscar no sistema principal
    client = db.query(Client).get(client_id)
    if not client:
        raise HTTPException(404, "Cliente não encontrado")

    # Buscar casos DIRETAMENTE do client_id
    from sqlalchemy.orm import joinedload
    cases = db.query(Case).options(
        joinedload(Case.assigned_user),
        joinedload(Case.client)
    ).filter(
        Case.client_id == client_id
    ).order_by(Case.id.desc()).all()

    # Criar lista de casos sem duplicados
    items = []
    for case in cases:
        try:
            items.append({
                "id": case.id,
                "status": case.status or "novo",
                "entidade": getattr(case, "entidade", None),
                "referencia_competencia": getattr(
                    case, "referencia_competencia", None
                ),
                "ref_month": getattr(case, "ref_month", None),
                "ref_year": getattr(case, "ref_year", None),
                "created_at": (
                    case.created_at.isoformat()
                    if case.created_at else None
                ),
                "last_update_at": (
                    case.last_update_at.isoformat()
                    if case.last_update_at else None
                ),
                "assigned_to": (
                    case.assigned_user.name
                    if hasattr(case, 'assigned_user') and case.assigned_user
                    else None
                ),
                "matricula": (
                    case.client.matricula
                    if hasattr(case, 'client') and case.client
                    else None
                ),
            })
        except Exception as e:
            print(f"Error processing case {case.id}: {e}")
            continue

    return {
        "items": items,
        "total": len(items)
    }


@r.get("/{client_id}/financiamentos")
def get_client_financiamentos(
    client_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_roles(
        "admin", "supervisor", "financeiro", "calculista", "atendente",
        "fechamento"
    ))
):
    """
    Retorna financiamentos (linhas de folha) de um cliente específico.
    Busca por TODAS as matrículas do CPF.
    Mostra dados da referência mais recente por entidade.
    """
    # Buscar no sistema principal
    client = db.query(Client).get(client_id)
    if not client:
        raise HTTPException(404, "Cliente não encontrado")

    # Buscar linhas de financiamento por CPF (TODAS as matrículas)
    financiamentos = db.query(PayrollLine).filter(
        PayrollLine.cpf == client.cpf
    ).order_by(
        PayrollLine.ref_year.desc(),
        PayrollLine.ref_month.desc(),
        PayrollLine.matricula.asc(),
        PayrollLine.entity_code.asc()
    ).all()
    financ_response = [
        {
            "id": line.id,
            "matricula": line.matricula,
            "financiamento_code": line.financiamento_code,
            "total_parcelas": line.total_parcelas,
            "parcelas_pagas": line.parcelas_pagas,
            "valor_parcela_ref": (
                str(line.valor_parcela_ref)
                if line.valor_parcela_ref else "0.00"
            ),
            "orgao_pagamento": line.orgao_pagamento,
            "orgao_pagamento_nome": line.orgao_pagamento_nome,
            "ref_month": line.ref_month,
            "ref_year": line.ref_year,
            "referencia": f"{line.ref_month:02d}/{line.ref_year}",
            "entity_code": line.entity_code,
            "entity_name": line.entity_name,
            "status_code": line.status_code,
            "status_description": line.status_description,
            "cargo": line.cargo,
            "orgao": line.orgao,
            "lanc": line.lanc,
            "created_at": (
                line.created_at.isoformat() if line.created_at else None
            )
        } for line in financiamentos
    ]

    # Incluir financiamentos importados via SIAPE (siape_lines)
    siape_lines = db.query(SiapeLine).filter(
        SiapeLine.cpf == client.cpf
    ).order_by(
        SiapeLine.ref_year.desc(),
        SiapeLine.ref_month.desc(),
        SiapeLine.matricula.asc(),
        SiapeLine.id.desc()
    ).all()

    for line in siape_lines:
        financ_response.append({
            "id": line.id * -1,  # evitar conflito de ID com PayrollLine
            "matricula": line.matricula,
            "financiamento_code": line.financiamento_code or f"SIAPE_{line.id}",
            "total_parcelas": line.prazo_total,
            "parcelas_pagas": line.parcelas_pagas,
            "valor_parcela_ref": str(line.valor_parcela or "0.00"),
            "orgao_pagamento": line.orgao_pagamento or "SIAPE",
            "orgao_pagamento_nome": line.orgao_pagamento_nome or "SIAPE",
            "ref_month": line.ref_month,
            "ref_year": line.ref_year,
            "referencia": f"{line.ref_month:02d}/{line.ref_year}",
            "entity_code": line.entity_code or "SIAPE",
            "entity_name": line.entity_name or "SIAPE",
            "status_code": line.status_code or "",
            "status_description": line.status_description or "",
            "cargo": None,
            "orgao": None,
            "lanc": None,
            "created_at": (
                line.created_at.isoformat() if line.created_at else None
            )
        })

    return financ_response


@r.get("/{client_id}/contratos-efetivados")
def get_client_contratos_efetivados(
    client_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_roles(
        "admin", "supervisor", "financeiro", "calculista", "atendente",
        "fechamento"
    ))
):
    """
    Retorna contratos efetivados do cliente.
    Busca contratos de casos associados ao CPF do cliente.
    """
    from ..models import Contract, ContractAttachment

    # Buscar no sistema principal
    client = db.query(Client).get(client_id)
    if not client:
        raise HTTPException(404, "Cliente não encontrado")

    # Buscar TODOS os client_ids com o mesmo CPF
    client_ids = db.query(Client.id).filter(Client.cpf == client.cpf).all()
    client_ids_list = [c_id[0] for c_id in client_ids]

    # Buscar casos destes clients
    cases = db.query(Case).filter(Case.client_id.in_(client_ids_list)).all()
    case_ids = [c.id for c in cases]

    # Buscar contratos destes casos
    contracts = db.query(Contract).filter(
        Contract.case_id.in_(case_ids)
    ).order_by(Contract.created_at.desc()).all()

    result = []
    for ct in contracts:
        # Buscar anexos do contrato
        attachments = db.query(ContractAttachment).filter(
            ContractAttachment.contract_id == ct.id
        ).all()

        result.append({
            "id": ct.id,
            "case_id": ct.case_id,
            "status": ct.status,
            "total_amount": float(ct.total_amount or 0),
            "installments": ct.installments,
            "paid_installments": ct.paid_installments,
            "disbursed_at": (
                ct.disbursed_at.isoformat() if ct.disbursed_at else None
            ),
            "created_at": (
                ct.created_at.isoformat() if ct.created_at else None
            ),
            "consultoria_valor_liquido": (
                float(ct.consultoria_valor_liquido or 0)
            ),
            "attachments": [
                {
                    "id": att.id,
                    "filename": att.filename,
                    "size": att.size,
                    "mime": att.mime,
                    "created_at": (
                        att.created_at.isoformat() if att.created_at else None
                    )
                } for att in attachments
            ]
        })

    return {
        "items": result,
        "total": len(result)
    }


@r.get("/{client_id}/matriculas")
def get_client_matriculas(
    client_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_roles(
        "admin", "supervisor", "financeiro", "calculista", "atendente",
        "fechamento"
    ))
):
    """
    Retorna todas as matrículas associadas ao CPF do cliente.
    Busca todas as matrículas diferentes do mesmo CPF em payroll_lines.
    """
    # Buscar no sistema principal
    client = db.query(Client).get(client_id)
    if not client:
        raise HTTPException(404, "Cliente não encontrado")

    # Buscar todas as matrículas distintas do CPF
    matriculas = db.query(PayrollLine.matricula).filter(
        PayrollLine.cpf == client.cpf
    ).distinct().all()

    # Buscar também em clients para pegar informações completas
    clientes_matriculas = db.query(Client).filter(
        Client.cpf == client.cpf
    ).all()

    # Criar mapa de matricula -> client_id para referência
    matricula_client_map = {c.matricula: c.id for c in clientes_matriculas}

    result = []
    for (matricula,) in matriculas:
        # Contar financiamentos desta matrícula
        total_financiamentos = db.query(func.count(PayrollLine.id)).filter(
            PayrollLine.cpf == client.cpf,
            PayrollLine.matricula == matricula
        ).scalar() or 0

        # Verificar se esta matrícula está na tabela clients
        client_id_ref = matricula_client_map.get(matricula)
        is_current = (matricula == client.matricula)

        result.append({
            "matricula": matricula,
            "client_id": client_id_ref,
            "total_financiamentos": total_financiamentos,
            "is_current": is_current
        })

    # Ordenar: matrícula atual primeiro, depois por matrícula
    result.sort(
        key=lambda x: (not x["is_current"], x["matricula"])
    )

    return {
        "cpf": client.cpf,
        "total_matriculas": len(result),
        "matriculas": result
    }


@r.delete("/{client_id}")
def delete_client(
    client_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_roles("admin"))
):
    """
    Deleta um cliente (apenas admin).
    Verifica se o cliente tem casos antes de deletar.
    """
    # Buscar cliente
    client = db.query(Client).get(client_id)
    if not client:
        raise HTTPException(404, "Cliente não encontrado")

    # Verificar se tem casos associados
    cases_count = db.query(Case).filter_by(
        client_id=client.id
    ).count()
    if cases_count > 0:
        raise HTTPException(
            400,
            (
                f"Não é possível excluir o cliente. "
                f"Existem {cases_count} casos associados."
            )
        )

    # Deletar cliente
    db.delete(client)
    db.commit()

    return {"ok": True, "message": "Cliente excluído com sucesso"}


@r.get("/{client_id}/delete-stats")
def get_client_delete_stats(
    client_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_roles("admin"))
):
    """
    Retorna estatísticas de exclusão de um cliente.
    Usado pelo frontend para mostrar confirmação detalhada antes da exclusão.
    """
    from ..models import (
        Attachment, CaseEvent, Simulation, Contract, Payment,
        CommissionPayout, FinanceExpense, FinanceIncome
    )

    # Buscar cliente
    client = db.query(Client).get(client_id)
    if not client:
        raise HTTPException(404, "Cliente não encontrado")

    # Buscar casos associados
    cases = db.query(Case).filter_by(client_id=client.id).all()
    case_ids = [case.id for case in cases]

    # Contar estatísticas
    stats = {
        "client_name": client.name,
        "client_cpf": client.cpf,
        "cases_count": len(cases),
        "contracts_count": 0,
        "commission_payouts_count": 0,
        "finance_expenses_count": 0,
        "finance_incomes_count": 0,
        "simulations_count": 0,
        "attachments_count": 0,
        "events_count": 0
    }

    if case_ids:
        # Contar contratos
        contracts = db.query(Contract).filter(
            Contract.case_id.in_(case_ids)
        ).all()
        stats["contracts_count"] = len(contracts)

        # Contar comissões
        stats["commission_payouts_count"] = db.query(CommissionPayout).filter(
            CommissionPayout.case_id.in_(case_ids)
        ).count()

        # Contar despesas vinculadas
        commission_expense_ids = [
            c.expense_id for c in db.query(CommissionPayout).filter(
                CommissionPayout.case_id.in_(case_ids),
                CommissionPayout.expense_id.isnot(None)
            ).all()
        ]
        if commission_expense_ids:
            stats["finance_expenses_count"] = db.query(FinanceExpense).filter(
                FinanceExpense.id.in_(commission_expense_ids)
            ).count()

        # Contar simulações
        stats["simulations_count"] = db.query(Simulation).filter(
            Simulation.case_id.in_(case_ids)
        ).count()

        # Contar anexos
        stats["attachments_count"] = db.query(Attachment).filter(
            Attachment.case_id.in_(case_ids)
        ).count()

        # Contar eventos
        stats["events_count"] = db.query(CaseEvent).filter(
            CaseEvent.case_id.in_(case_ids)
        ).count()

    # Contar receitas vinculadas ao CPF
    stats["finance_incomes_count"] = db.query(FinanceIncome).filter(
        FinanceIncome.client_cpf == client.cpf
    ).count()

    return {
        "ok": True,
        "stats": stats,
        "warning": (
            "Esta ação é IRREVERSÍVEL e afetará o histórico financeiro, "
            "rankings de atendentes e relatórios do sistema."
        )
    }


@r.delete("/{client_id}/cascade")
def delete_client_cascade(
    client_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_roles("admin"))
):
    """
    Deleta um cliente e todos os casos associados (apenas admin).
    Exclusão em cascata - remove casos, contratos, comissões, receitas e despesas.

    Ordem de exclusão:
    1. CommissionPayout (para liberar FK de Contract/Case)
    2. FinanceExpense (vinculadas ao CommissionPayout)
    3. Contract (agora sem bloqueio FK)
    4. case.last_simulation_id = None (para liberar FK de Simulations)
    5. Simulations (agora sem bloqueio FK)
    6. Attachments, CaseEvents, Case
    7. FinanceIncome (vinculadas ao CPF do cliente)
    8. ClientPhone, Client
    """
    # Buscar cliente
    client = db.query(Client).get(client_id)
    if not client:
        raise HTTPException(404, "Cliente não encontrado")

    # Buscar casos associados
    cases = db.query(Case).filter_by(client_id=client.id).all()

    # Estatísticas de exclusão
    stats = {
        "cases": 0,
        "contracts": 0,
        "commission_payouts": 0,
        "finance_expenses": 0,
        "finance_incomes": 0,
        "simulations": 0,
        "attachments": 0,
        "events": 0
    }

    # Deletar em cascata
    for case in cases:
        # PASSO 1: Deletar CommissionPayout (ANTES do Contract)
        from ..models import CommissionPayout, FinanceExpense
        commission = db.query(CommissionPayout).filter_by(case_id=case.id).first()
        if commission:
            # PASSO 2: Deletar FinanceExpense vinculada ao CommissionPayout
            if commission.expense_id:
                expense = db.query(FinanceExpense).filter_by(
                    id=commission.expense_id
                ).first()
                if expense:
                    db.delete(expense)
                    stats["finance_expenses"] += 1

            # Deletar CommissionPayout
            db.delete(commission)
            stats["commission_payouts"] += 1

        # PASSO 3: Deletar Contract (agora sem bloqueio FK)
        from ..models import Contract
        contract = db.query(Contract).filter_by(case_id=case.id).first()
        if contract:
            # Deletar anexos do contrato
            from ..models import ContractAttachment
            db.query(ContractAttachment).filter_by(
                contract_id=contract.id
            ).delete()

            # Deletar pagamentos
            from ..models import Payment
            db.query(Payment).filter_by(contract_id=contract.id).delete()

            # Deletar contrato
            db.delete(contract)
            stats["contracts"] += 1

        # PASSO 4: Limpar referência last_simulation_id ANTES de deletar simulações
        # (evitar erro de FK constraint)
        if case.last_simulation_id:
            case.last_simulation_id = None
            db.flush()  # Commit imediato da mudança

        # PASSO 5: Deletar simulações (agora sem bloqueio FK)
        from ..models import Simulation
        simulations_count = db.query(Simulation).filter_by(case_id=case.id).count()
        db.query(Simulation).filter_by(case_id=case.id).delete()
        stats["simulations"] += simulations_count

        # PASSO 6: Deletar anexos
        from ..models import Attachment
        attachments_count = db.query(Attachment).filter_by(case_id=case.id).count()
        db.query(Attachment).filter_by(case_id=case.id).delete()
        stats["attachments"] += attachments_count

        # PASSO 7: Deletar eventos
        from ..models import CaseEvent
        events_count = db.query(CaseEvent).filter_by(case_id=case.id).count()
        db.query(CaseEvent).filter_by(case_id=case.id).delete()
        stats["events"] += events_count

        # PASSO 8: Deletar caso
        db.delete(case)
        stats["cases"] += 1

    # PASSO 9: Deletar FinanceIncome vinculadas ao CPF do cliente
    from ..models import FinanceIncome
    incomes = db.query(FinanceIncome).filter(
        FinanceIncome.client_cpf == client.cpf
    ).all()
    for income in incomes:
        db.delete(income)
        stats["finance_incomes"] += 1

    # PASSO 10: Deletar telefones do cliente
    db.query(ClientPhone).filter_by(client_id=client.id).delete()

    # PASSO 11: Deletar cliente
    db.delete(client)
    db.commit()

    return {
        "ok": True,
        "message": (
            f"Cliente '{client.name}' excluído com sucesso junto com "
            f"{stats['cases']} caso(s), {stats['contracts']} contrato(s), "
            f"{stats['commission_payouts']} comissão(ões), "
            f"{stats['finance_incomes']} receita(s) financeira(s)"
        ),
        "deleted": stats
    }


# Rotas de histórico de telefones

class PhoneUpdate(BaseModel):
    phone: str


@r.get("/{client_id}/phones")
def get_client_phones(
    client_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_roles(
        "admin", "supervisor", "financeiro", "calculista", "atendente",
        "fechamento"
    ))
):
    """
    Retorna o histórico de telefones de um cliente.
    Lista todos os telefones já utilizados.
    """
    # Verificar se cliente existe
    client = db.query(Client).get(client_id)
    if not client:
        raise HTTPException(404, "Cliente não encontrado")

    # Buscar telefones
    phones = db.query(ClientPhone).filter_by(client_id=client_id).order_by(
        ClientPhone.is_primary.desc(),
        ClientPhone.created_at.desc()
    ).all()

    return {
        "items": [
            {
                "id": phone.id,
                "phone": phone.phone,
                "is_primary": phone.is_primary,
                "created_at": (
                    phone.created_at.isoformat() if phone.created_at else None
                ),
                "updated_at": (
                    phone.updated_at.isoformat() if phone.updated_at else None
                )
            } for phone in phones
        ],
        "count": len(phones)
    }


@r.post("/{client_id}/phones")
def add_or_update_client_phone(
    client_id: int,
    data: PhoneUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_roles("admin", "supervisor", "atendente"))
):
    """
    Adiciona ou atualiza o telefone principal de um cliente.
    - Remove is_primary de todos os telefones anteriores
    - Adiciona ou marca o novo telefone como is_primary=True
    - Atualiza Client.telefone_preferencial por compatibilidade
    """
    # Verificar se cliente existe
    client = db.query(Client).get(client_id)
    if not client:
        raise HTTPException(404, "Cliente não encontrado")

    # Normalizar telefone (remover espaços, caracteres especiais)
    phone_normalized = ''.join(filter(str.isdigit, data.phone))

    if not phone_normalized:
        raise HTTPException(400, "Telefone inválido")

    # Desmarcar todos os telefones anteriores como não primários
    db.query(ClientPhone).filter_by(
        client_id=client_id, is_primary=True
    ).update({"is_primary": False})

    # Verificar se o telefone já existe
    existing_phone = db.query(ClientPhone).filter_by(
        client_id=client_id, phone=phone_normalized
    ).first()

    if existing_phone:
        # Atualizar telefone existente como primário
        existing_phone.is_primary = True
        existing_phone.updated_at = datetime.utcnow()
        phone_record = existing_phone
    else:
        # Criar novo telefone
        phone_record = ClientPhone(
            client_id=client_id,
            phone=phone_normalized,
            is_primary=True
        )
        db.add(phone_record)

    # Atualizar campo legado do cliente
    client.telefone_preferencial = phone_normalized

    db.commit()
    db.refresh(phone_record)

    return {
        "id": phone_record.id,
        "phone": phone_record.phone,
        "is_primary": phone_record.is_primary,
        "created_at": (
            phone_record.created_at.isoformat()
            if phone_record.created_at else None
        ),
        "updated_at": (
            phone_record.updated_at.isoformat()
            if phone_record.updated_at else None
        )
    }


@r.delete("/{client_id}/phones/{phone_id}")
def delete_client_phone(
    client_id: int,
    phone_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_roles("admin", "supervisor", "atendente"))
):
    """
    Remove um telefone do histórico do cliente (admin/supervisor/atendente).
    Não permite remover o telefone primário.
    """
    # Buscar telefone
    phone = db.query(ClientPhone).filter_by(
        id=phone_id, client_id=client_id
    ).first()
    if not phone:
        raise HTTPException(404, "Telefone não encontrado")

    # Não permitir remover telefone primário
    if phone.is_primary:
        raise HTTPException(
            400,
            "Não é possível remover o telefone principal. "
            "Defina outro telefone como principal primeiro."
        )

    # Deletar telefone
    db.delete(phone)
    db.commit()

    return {"ok": True, "message": "Telefone removido do histórico"}


class BulkDeleteRequest(BaseModel):
    ids: List[int]


@r.post("/bulk-delete")
def bulk_delete_clients(
    payload: BulkDeleteRequest,
    db: Session = Depends(get_db),
    user=Depends(require_roles("admin"))
):
    """
    Exclusão em lote de clientes (apenas admin).
    Verifica se clientes têm casos associados antes de excluir.
    """
    if not payload.ids:
        raise HTTPException(400, "Lista de IDs vazia")

    if len(payload.ids) > 100:
        raise HTTPException(400, "Máximo de 100 clientes por vez")

    results = {
        "deleted": [],
        "failed": [],
        "total_requested": len(payload.ids)
    }

    for client_id in payload.ids:
        try:
            client = db.get(Client, client_id)
            if not client:
                results["failed"].append({
                    "id": client_id,
                    "reason": "Cliente não encontrado"
                })
                continue

            # Verificar se tem casos associados
            cases_count = db.query(Case).filter_by(
                client_id=client.id
            ).count()
            if cases_count > 0:
                results["failed"].append({
                    "id": client_id,
                    "reason": (
                        f"Cliente possui {cases_count} caso(s) associado(s)"
                    )
                })
                continue

            # Excluir telefones (CASCADE já faz isso automaticamente)
            # Mas vamos garantir explicitamente
            db.query(ClientPhone).filter_by(
                client_id=client_id
            ).delete()

            # Excluir cliente
            db.delete(client)
            results["deleted"].append(client_id)

        except Exception as e:
            results["failed"].append({
                "id": client_id,
                "reason": str(e)
            })
            print(f"Erro ao excluir cliente {client_id}: {e}")

    db.commit()

    return {
        **results,
        "success_count": len(results["deleted"]),
        "failed_count": len(results["failed"])
    }


# ========== ENDPOINTS DE ENDEREÇO ==========

@r.get("/{client_id}/addresses", response_model=List[ClientAddressResponse])
def get_client_addresses(
    client_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_roles(
        "admin", "supervisor", "financeiro", "calculista", "atendente", "fechamento"
    ))
):
    """
    Retorna todos os endereços de um cliente.
    Lista ordenada por endereço principal primeiro.
    """
    # Verificar se cliente existe
    client = db.query(Client).get(client_id)
    if not client:
        raise HTTPException(404, "Cliente não encontrado")

    # Buscar endereços
    addresses = db.query(ClientAddress).filter_by(client_id=client_id).order_by(
        ClientAddress.is_primary.desc(),
        ClientAddress.created_at.desc()
    ).all()

    return addresses


@r.post("/{client_id}/addresses", response_model=ClientAddressResponse)
def add_client_address(
    client_id: int,
    data: ClientAddressCreate,
    db: Session = Depends(get_db),
    user=Depends(require_roles("admin", "supervisor", "atendente"))
):
    """
    Adiciona um novo endereço ao cliente.
    Se is_primary=True, desmarca os demais endereços como não primários.
    """
    # Verificar se cliente existe
    client = db.query(Client).get(client_id)
    if not client:
        raise HTTPException(404, "Cliente não encontrado")

    # Se for endereço primário, desmarcar os outros
    if data.is_primary:
        db.query(ClientAddress).filter_by(
            client_id=client_id, is_primary=True
        ).update({"is_primary": False})

    # Criar novo endereço
    address = ClientAddress(
        client_id=client_id,
        **data.model_dump()
    )
    db.add(address)
    db.commit()
    db.refresh(address)

    return address


@r.put("/{client_id}/addresses/{address_id}", response_model=ClientAddressResponse)
def update_client_address(
    client_id: int,
    address_id: int,
    data: ClientAddressUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_roles("admin", "supervisor", "atendente"))
):
    """
    Atualiza um endereço existente do cliente.
    Se is_primary=True, desmarca os demais endereços como não primários.
    """
    # Buscar endereço
    address = db.query(ClientAddress).filter_by(
        id=address_id, client_id=client_id
    ).first()
    if not address:
        raise HTTPException(404, "Endereço não encontrado")

    # Se for marcar como primário, desmarcar os outros
    if data.is_primary and not address.is_primary:
        db.query(ClientAddress).filter_by(
            client_id=client_id, is_primary=True
        ).update({"is_primary": False})

    # Atualizar campos
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(address, field, value)

    address.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(address)

    return address


@r.delete("/{client_id}/addresses/{address_id}")
def delete_client_address(
    client_id: int,
    address_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_roles("admin", "supervisor", "atendente"))
):
    """
    Remove um endereço do cliente.
    Não permite remover o endereço primário se for o único.
    """
    # Buscar endereço
    address = db.query(ClientAddress).filter_by(
        id=address_id, client_id=client_id
    ).first()
    if not address:
        raise HTTPException(404, "Endereço não encontrado")

    # Verificar se é o único endereço primário
    if address.is_primary:
        total_addresses = db.query(ClientAddress).filter_by(
            client_id=client_id
        ).count()
        if total_addresses > 1:
            raise HTTPException(
                400,
                "Não é possível remover o endereço principal. "
                "Defina outro endereço como principal primeiro."
            )

    # Deletar endereço
    db.delete(address)
    db.commit()

    return {"ok": True, "message": "Endereço removido com sucesso"}


# ========== ENDPOINT DE IMPORTAÇÃO EM MASSA ==========

@r.post("/bulk-update-cadastro", response_model=BulkCadastroImportResponse)
async def bulk_update_cadastro(
    rows: List[BulkCadastroRow],
    db: Session = Depends(get_db),
    user=Depends(require_roles("admin", "supervisor"))
):
    """
    Importação em massa de dados cadastrais (telefones e endereços).

    Aceita uma lista de registros com:
    - cpf (obrigatório)
    - telefone (opcional)
    - cidade (opcional)
    - estado (opcional)

    Para cada CPF:
    - Busca o cliente na base
    - Adiciona telefone ao histórico (se fornecido e não duplicado)
    - Cria/atualiza endereço (se cidade/estado fornecidos)

    Retorna relatório com:
    - Total de linhas processadas
    - Sucessos e detalhes
    - Erros e motivos
    - CPFs não encontrados
    """
    result = {
        "total_rows": len(rows),
        "success_count": 0,
        "error_count": 0,
        "not_found_count": 0,
        "errors": [],
        "success_details": []
    }

    for idx, row in enumerate(rows):
        try:
            # Buscar cliente por CPF
            client = db.query(Client).filter_by(cpf=row.cpf).first()

            if not client:
                result["not_found_count"] += 1
                result["errors"].append({
                    "row": idx + 1,
                    "cpf": row.cpf,
                    "error": "CPF não encontrado na base de dados"
                })
                continue

            updates_made = []

            # Adicionar telefone se fornecido
            if row.telefone:
                # Verificar se telefone já existe
                existing_phone = db.query(ClientPhone).filter_by(
                    client_id=client.id,
                    phone=row.telefone
                ).first()

                if not existing_phone:
                    # Adicionar novo telefone (não marcado como primário)
                    new_phone = ClientPhone(
                        client_id=client.id,
                        phone=row.telefone,
                        is_primary=False
                    )
                    db.add(new_phone)
                    updates_made.append(f"Telefone {row.telefone} adicionado")
                else:
                    updates_made.append(f"Telefone {row.telefone} já existia")

            # Criar/atualizar endereço se cidade ou estado fornecidos
            if row.cidade or row.estado:
                # Buscar endereço principal existente
                address = db.query(ClientAddress).filter_by(
                    client_id=client.id,
                    is_primary=True
                ).first()

                if address:
                    # Atualizar endereço existente
                    if row.cidade:
                        address.cidade = row.cidade
                    if row.estado:
                        address.estado = row.estado
                    address.updated_at = datetime.utcnow()
                    updates_made.append("Endereço atualizado")
                else:
                    # Criar novo endereço
                    address = ClientAddress(
                        client_id=client.id,
                        cidade=row.cidade,
                        estado=row.estado,
                        is_primary=True
                    )
                    db.add(address)
                    updates_made.append("Endereço criado")

            if updates_made:
                result["success_count"] += 1
                result["success_details"].append({
                    "row": idx + 1,
                    "cpf": row.cpf,
                    "client_name": client.name,
                    "updates": updates_made
                })
            else:
                result["success_count"] += 1
                result["success_details"].append({
                    "row": idx + 1,
                    "cpf": row.cpf,
                    "client_name": client.name,
                    "updates": ["Nenhuma alteração necessária"]
                })

            # Commit a cada 50 registros
            if (idx + 1) % 50 == 0:
                db.commit()

        except Exception as e:
            result["error_count"] += 1
            result["errors"].append({
                "row": idx + 1,
                "cpf": row.cpf,
                "error": str(e)
            })
            db.rollback()
            continue

    # Commit final
    db.commit()

    return result


@r.post("/{client_id}/cases")
def create_client_case(
    client_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_roles("admin", "supervisor", "atendente"))
):
    """
    Cria um novo caso para um cliente.

    Validações:
    - Cliente deve existir
    - Cliente não pode ter caso com status: novo, caso_cancelado, em_atendimento
    - Não afeta contratos efetivados existentes
    - Permite múltiplos contratos ativos/efetivados
    """
    from ..models import now_brt

    # Verificar se cliente existe
    client = db.query(Client).get(client_id)
    if not client:
        raise HTTPException(404, "Cliente não encontrado")

    # Validar: verificar se cliente já tem caso com status proibidos
    forbidden_statuses = ["novo", "caso_cancelado", "em_atendimento"]
    existing_case = db.query(Case).filter(
        Case.client_id == client_id,
        Case.status.in_(forbidden_statuses)
    ).first()

    if existing_case:
        status_labels = {
            "novo": "Novo",
            "caso_cancelado": "Cancelado",
            "em_atendimento": "Em Atendimento"
        }
        status_label = status_labels.get(existing_case.status, existing_case.status)
        raise HTTPException(
            400,
            f"Cliente já possui um caso com status '{status_label}'. "
            f"Não é possível criar um novo caso enquanto houver casos com status: "
            f"Novo, Cancelado ou Em Atendimento."
        )

    # Criar novo caso
    new_case = Case(
        client_id=client_id,
        status="novo",
        created_at=now_brt(),
        last_update_at=now_brt(),
        source="manual"
    )

    db.add(new_case)
    db.flush()  # Gera o ID do caso antes de criar o evento

    # Registrar evento de criação
    db.add(CaseEvent(
        case_id=new_case.id,
        type="case.created",
        payload={
            "created_by": user.name,
            "created_by_id": user.id,
            "client_id": client_id,
            "client_name": client.name,
            "client_cpf": client.cpf
        },
        created_by=user.id
    ))

    db.commit()
    db.refresh(new_case)

    return {
        "ok": True,
        "case_id": new_case.id,
        "message": f"Caso #{new_case.id} criado com sucesso para o cliente {client.name}"
    }
