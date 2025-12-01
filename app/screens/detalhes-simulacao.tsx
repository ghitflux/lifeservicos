import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { borderRadius, spacing } from '@/constants/theme';
import { Header, MobileNav, AlertDialog } from '@/components';
import { formatCurrency } from '@/utils/formatters';
import { api } from '@/services/api';
import { useAlert } from '@/hooks/useAlert';
import { mapSimulationStatus } from '@/utils/status';
import { useAuth } from '@/hooks/useAuth';

interface Simulation {
  id: string;
  simulation_type: string;
  requested_amount: number;
  installments: number;
  interest_rate: number;
  installment_value: number;
  total_amount: number;
  status: string;
  created_at: string;
  banks_json?: any[];
  prazo?: number;
  coeficiente?: string;
  seguro?: number;
  percentual_consultoria?: number;
}

export default function DetalhesSimulacao() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { alert, showError, showSuccess, showConfirm, showDestructive, dismissAlert } = useAlert();
  const { user } = useAuth();
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSimulation();
  }, []);

  // Toast informativo quando contrato está efetivado
  useEffect(() => {
    if (simulation && simulation.status === 'contrato_efetivado') {
      showSuccess(
        'Contrato Efetivado',
        'Seu contrato foi efetivado com sucesso! O agente responsável entrará em contato via WhatsApp para informar os próximos passos e finalizar o processo.'
      );
    }
  }, [simulation?.status]);

  const fetchSimulation = async () => {
    try {
      let data: any = null;

      // Tenta detalhe completo (admin); se 403, cai para lista do cliente
      try {
        const adminDetail = await api.get(`/mobile/admin/simulations/${params.id}`);
        data = adminDetail.data;
      } catch (err: any) {
        if (err?.response?.status !== 403 && err?.response?.status !== 404) {
          throw err;
        }

        const listResponse = await api.get('/mobile/simulations');
        data = (listResponse.data || []).find((sim: any) => String(sim.id) === String(params.id));
      }

      if (!data) {
        throw new Error('Simulação não encontrada');
      }

      setSimulation(data);
    } catch (error: any) {
      console.error('Error fetching simulation:', error);
      const message = error?.response?.data?.detail || 'Não foi possível carregar a simulação';
      showError('Erro', message);
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const normalizedStatus = (simulation?.status || '').toLowerCase();
  const canManageStatus = ['admin', 'supervisor', 'financeiro'].includes((user?.role || '').toLowerCase());
  const isClientApproved =
    normalizedStatus.includes('approved_by_client') ||
    normalizedStatus.includes('cliente_aprovada') ||
    normalizedStatus.includes('aprovada');
  const isAdminApproved = normalizedStatus === 'approved'; // aguardando aprovação do cliente

  const getToneColor = (tone: string) => {
    if (tone === 'success') return colors.success || '#22c55e';
    if (tone === 'warning') return colors.warning || '#f59e0b';
    if (tone === 'error') return colors.error || '#ef4444';
    return colors.accent;
  };

  const handleApproveByClient = () => {
    showConfirm(
      'Aprovar simulação',
      'Você confirma que concorda com esta proposta?',
      async () => {
        try {
          await api.post(`/mobile/simulations/${params.id}/approve-by-client`);
          await fetchSimulation();
          showSuccess('Sucesso', 'Simulação aprovada e enviada ao financeiro.');
        } catch (error: any) {
          const message = error?.response?.data?.detail || 'Não foi possível aprovar a simulação';
          showError('Erro', message);
        }
      }
    );
  };

  const handleRejectByClient = () => {
    showDestructive(
      'Reprovar simulação',
      'Deseja reprovar esta simulação?',
      async () => {
        try {
          await api.post(`/mobile/simulations/${params.id}/reject-by-client`);
          await fetchSimulation();
          showSuccess('Reprovada', 'Simulação reprovada.');
        } catch (error: any) {
          const message = error?.response?.data?.detail || 'Não foi possível reprovar a simulação';
          showError('Erro', message);
        }
      }
    );
  };

  const handleSendToFinance = () => {
    showConfirm(
      'Enviar ao Financeiro',
      'Confirmar o envio desta simulação para o financeiro?',
      async () => {
        try {
          await api.post(`/finance/mobile/${params.id}/approve`);
          await fetchSimulation();
          showSuccess('Sucesso', 'Simulação enviada ao financeiro');
        } catch (error: any) {
          const message = error?.response?.data?.detail || 'Não foi possível enviar ao financeiro';
          showError('Erro', message);
        }
      }
    );
  };

  const handleCancelFinance = () => {
    showDestructive(
      'Cancelar simulação',
      'Deseja cancelar esta simulação?',
      async () => {
        try {
          await api.post(`/finance/mobile/${params.id}/cancel`);
          await fetchSimulation();
          showSuccess('Cancelada', 'Simulação cancelada no financeiro');
        } catch (error: any) {
          const message = error?.response?.data?.detail || 'Não foi possível cancelar a simulação';
          showError('Erro', message);
        }
      }
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <Header title="Detalhes da Simulação" showBackButton />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Carregando simulação...</Text>
        </View>
        <MobileNav />
      </SafeAreaView>
    );
  }

  if (!simulation) {
    return null;
  }

  const statusMeta = mapSimulationStatus(simulation.status);
  const statusColor = getToneColor(statusMeta.tone);
  const showFinanceActions =
    canManageStatus &&
    ['approved_by_client', 'cliente_aprovada', 'simulacao_aprovada', 'financeiro_pendente'].includes(normalizedStatus);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Header
        title="Detalhes da Simulação"
        subtitle={`#${simulation.id.substring(0, 8)}`}
        showBackButton
      />

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 80 + insets.bottom }}
      >
        <View style={styles.statusBadgeContainer}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20', borderColor: statusColor + '50' }]}>
            <Ionicons
              name={
                statusMeta.tone === 'success'
                  ? 'checkmark-circle'
                  : statusMeta.tone === 'error'
                    ? 'close-circle'
                    : 'time'
              }
              size={14}
              color={statusColor}
            />
            <Text style={[styles.statusBadgeText, { color: statusColor }]}>
              {statusMeta.label}
            </Text>
          </View>
        </View>

        <View style={[styles.preApprovedCard, { borderColor: colors.accent + '80', backgroundColor: colors.accent + '15' }]}>
          <Text style={[styles.preApprovedLabel, { color: colors.accent + 'CC' }]}>
            Valor Solicitado
          </Text>
          <Text style={[styles.preApprovedValue, { color: colors.accent }]}>
            {formatCurrency(simulation.requested_amount)}
          </Text>
        </View>

        {showFinanceActions && (
          <View style={styles.actionsRow}>
            <Pressable style={[styles.rejectButton, { borderColor: (colors.error || '#ef4444') + '50', backgroundColor: colors.card }]} onPress={handleCancelFinance}>
              <Ionicons name="close-circle" size={20} color={colors.error || '#ef4444'} />
              <Text style={[styles.rejectButtonText, { color: colors.error || '#ef4444' }]}>Cancelar</Text>
            </Pressable>
            <Pressable style={[styles.approveButton, { backgroundColor: colors.success || '#22c55e' }]} onPress={handleSendToFinance}>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={[styles.approveButtonText, { color: '#fff' }]}>Enviar ao Financeiro</Text>
            </Pressable>
          </View>
        )}

        {!showFinanceActions && isAdminApproved && !isClientApproved && (
          <View style={styles.actionsRow}>
            <Pressable style={[styles.rejectButton, { borderColor: (colors.error || '#ef4444') + '50', backgroundColor: colors.card }]} onPress={handleRejectByClient}>
              <Ionicons name="close-circle" size={20} color={colors.error || '#ef4444'} />
              <Text style={[styles.rejectButtonText, { color: colors.error || '#ef4444' }]}>Reprovar</Text>
            </Pressable>
            <Pressable style={[styles.approveButton, { backgroundColor: colors.accent }]} onPress={handleApproveByClient}>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={[styles.approveButtonText, { color: '#fff' }]}>Aprovar</Text>
            </Pressable>
          </View>
        )}

        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border + '80' }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="calculator" size={20} color={colors.accent} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Detalhes Financeiros</Text>
          </View>
          <View style={styles.totalsList}>
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>Valor Solicitado</Text>
              <Text style={[styles.totalValue, { color: colors.text }]}>
                {formatCurrency(simulation.requested_amount)}
              </Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border + '50' }]} />
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>Número de Parcelas</Text>
              <Text style={[styles.totalValue, { color: colors.text }]}>
                {simulation.installments}x
              </Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border + '50' }]} />
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>Taxa de Juros (mensal)</Text>
              <Text style={[styles.totalValue, { color: colors.text }]}>
                {simulation.interest_rate.toFixed(2)}%
              </Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border + '50' }]} />
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>Valor da Parcela</Text>
              <Text style={[styles.totalValue, { color: colors.text }]}>
                {formatCurrency(simulation.installment_value)}
              </Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border + '50' }]} />
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>Valor Total a Pagar</Text>
              <Text style={[styles.totalValue, { color: colors.accent, fontWeight: 'bold' }]}>
                {formatCurrency(simulation.total_amount)}
              </Text>
            </View>
          </View>
        </View>

        {Array.isArray(simulation.banks_json) && simulation.banks_json.length > 0 && (
          <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border + '80' }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="business" size={20} color={colors.accent} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Bancos e produtos</Text>
            </View>
            {simulation.banks_json.map((bank: any, index: number) => (
              <View key={`${bank.bank || bank.banco || 'bank'}-${index}`} style={{ marginBottom: spacing.sm }}>
                <View style={styles.banksRow}>
                  <View style={[styles.bankBadge, { borderColor: colors.border }]}>
                    <Text style={[styles.bankBadgeText, { color: colors.text }]}>
                      {(bank.bank || bank.banco || 'Banco').toString().toUpperCase()}
                    </Text>
                  </View>
                  {bank.product && (
                    <View style={[styles.bankBadge, { borderColor: colors.border }]}>
                      <Text style={[styles.bankBadgeText, { color: colors.textSecondary }]}>
                        {bank.product}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.bankInfo}>
                  <Text style={[styles.bankInfoText, { color: colors.textSecondary }]}>
                    Parcela: {formatCurrency(Number(bank.parcela || 0))}
                  </Text>
                  <Text style={[styles.bankInfoText, { color: colors.textSecondary }]}>
                    Saldo: {formatCurrency(Number(bank.saldoDevedor || 0))}
                  </Text>
                  <Text style={[styles.bankInfoText, { color: colors.textSecondary }]}>
                    Liberado: {formatCurrency(Number(bank.valorLiberado || 0))}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {(simulation.percentual_consultoria || simulation.seguro) && (
          <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border + '80' }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="stats-chart" size={20} color={colors.accent} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Custos e consultoria</Text>
            </View>
            {simulation.percentual_consultoria !== undefined && (
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>% Consultoria</Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>{simulation.percentual_consultoria}%</Text>
              </View>
            )}
            {simulation.seguro !== undefined && (
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Seguro</Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>{formatCurrency(Number(simulation.seguro || 0))}</Text>
              </View>
            )}
          </View>
        )}

        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border + '80' }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="information-circle" size={20} color={colors.accent} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Informações</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Tipo:</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>{simulation.simulation_type}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Data:</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>
              {new Date(simulation.created_at).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              })}
            </Text>
          </View>
        </View>
      </ScrollView>

      {alert && (
        <AlertDialog
          visible={!!alert}
          title={alert.title}
          message={alert.message}
          buttons={alert.buttons}
          icon={alert.icon as any}
          iconColor={alert.iconColor}
          onDismiss={dismissAlert}
        />
      )}

      <MobileNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontSize: 14,
  },
  statusBadgeContainer: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  preApprovedCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 2,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  preApprovedLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: spacing.sm,
  },
  preApprovedValue: {
    fontSize: 36,
    fontWeight: 'bold',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  rejectButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  rejectButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  approveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  approveButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  sectionCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  banksRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  bankBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  bankBadgeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  bankInfo: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  bankInfoText: {
    fontSize: 14,
  },
  totalsList: {
    gap: 0,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  totalLabel: {
    fontSize: 14,
  },
  totalValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  divider: {
    height: 1,
    marginVertical: spacing.xs,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 14,
  },
  formulasCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.xl,
    borderWidth: 1,
  },
  formulasText: {
    fontSize: 12,
    lineHeight: 18,
  },
  formulasBold: {
    fontWeight: 'bold',
  },
});
