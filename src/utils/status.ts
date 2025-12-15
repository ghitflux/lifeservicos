export type MobileSimulationStatus =
  | 'pending'
  | 'pending_analysis'
  | 'pending_docs'
  | 'approved_for_calculation'
  | 'simulation_requested'
  | 'approved'
  | 'approved_by_client'
  | 'aprovada_pelo_cliente'
  | 'cliente_aprovada'
  | 'simulacao_aprovada'
  | 'financeiro_pendente'
  | 'contrato_efetivado'
  | 'financeiro_cancelado'
  | 'retorno_pendencia'
  | 'rejected_by_client'
  | 'rejected'
  | string;

export type StatusTone = 'success' | 'warning' | 'error' | 'info';

export function mapSimulationStatus(status?: string): { label: string; tone: StatusTone } {
  const normalized = (status || '').toLowerCase();

  switch (normalized) {
    case 'pending_analysis':
      return { label: 'Pendente de Análise', tone: 'warning' };
    case 'pending_docs':
      return { label: 'Documentos Pendentes', tone: 'warning' };
    case 'retorno_pendencia':
      return { label: 'Retorno de Pendência', tone: 'warning' };
    case 'approved_for_calculation':
      return { label: 'Em simulação', tone: 'warning' };
    case 'pending':
    case 'simulation_requested':
      return { label: 'Em análise', tone: 'warning' };
    case 'approved':
    case 'simulacao_aprovada':
      return { label: 'Aguardando aprovação do cliente', tone: 'warning' };
    case 'approved_by_client':
    case 'aprovada_pelo_cliente':
    case 'cliente_aprovada':
      return { label: 'Aprovado', tone: 'success' };
    case 'financeiro_pendente':
      return { label: 'No Financeiro', tone: 'warning' };
    case 'contrato_efetivado':
      return { label: 'Contrato Efetivado', tone: 'success' };
    case 'financeiro_cancelado':
    case 'rejected_by_client':
    case 'rejected':
      return { label: 'Cancelada/Reprovada', tone: 'error' };
    default:
      return { label: status || 'Status desconhecido', tone: 'info' };
  }
}
