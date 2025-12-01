export type MobileSimulationStatus =
  | 'pending'
  | 'simulation_requested'
  | 'approved'
  | 'approved_by_client'
  | 'aprovada_pelo_cliente'
  | 'cliente_aprovada'
  | 'simulacao_aprovada'
  | 'financeiro_pendente'
  | 'contrato_efetivado'
  | 'financeiro_cancelado'
  | 'rejected_by_client'
  | 'rejected'
  | string;

export type StatusTone = 'success' | 'warning' | 'error' | 'info';

export function mapSimulationStatus(status?: string): { label: string; tone: StatusTone } {
  const normalized = (status || '').toLowerCase();

  switch (normalized) {
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
