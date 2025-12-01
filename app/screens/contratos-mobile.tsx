import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { Header, MobileNav, AlertDialog } from '@/components';
import { spacing, borderRadius } from '@/constants/theme';
import { api } from '@/services/api';
import { useAlert } from '@/hooks/useAlert';
import { mapSimulationStatus } from '@/utils/status';
import { formatCurrency } from '@/utils/formatters';

interface FinanceItem {
  id: string;
  status: string;
  requested_amount: number;
  total_amount: number;
  installments: number;
  created_at: string;
  user?: { id: number; name: string; email: string };
  banks?: any[];
  percentual_consultoria?: number;
  seguro?: number;
}

export default function ContratosMobile() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { alert, showConfirm, showDestructive, showSuccess, showError, dismissAlert } = useAlert();
  const [items, setItems] = useState<FinanceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const fetchQueue = async () => {
    try {
      const response = await api.get('/finance/mobile/queue');
      const data = response.data?.items || [];
      setItems(data);
    } catch (error: any) {
      console.error('Erro ao carregar fila financeira mobile:', error?.response?.data || error?.message);
      showError('Erro', error?.response?.data?.detail || 'Não foi possível carregar a fila financeira mobile');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setActioningId(null);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchQueue();
  }, []);

  const actionWrapper = async (fn: () => Promise<void>) => {
    try {
      await fn();
      await fetchQueue();
    } catch (error: any) {
      const msg = error?.response?.data?.detail || 'Ação não concluída';
      showError('Erro', msg);
    }
  };

  const handleApprove = (id: string) => {
    showConfirm('Enviar ao Financeiro', 'Confirmar envio desta simulação para o financeiro?', async () => {
      setActioningId(id);
      await actionWrapper(() => api.post(`/finance/mobile/${id}/approve`));
      showSuccess('Enviado', 'Simulação enviada ao financeiro');
    });
  };

  const handleDisburse = (id: string) => {
    showConfirm('Efetivar contrato', 'Confirmar efetivação do contrato e geração de receita?', async () => {
      setActioningId(id);
      await actionWrapper(() => api.post(`/finance/mobile/${id}/disburse`));
      showSuccess('Efetivado', 'Contrato efetivado com sucesso');
    });
  };

  const handleCancel = (id: string) => {
    showDestructive('Cancelar simulação', 'Deseja cancelar esta simulação na fila financeira?', async () => {
      setActioningId(id);
      await actionWrapper(() => api.post(`/finance/mobile/${id}/cancel`));
      showSuccess('Cancelada', 'Simulação cancelada');
    });
  };

  const getToneColor = (tone: string) => {
    if (tone === 'success') return colors.success || '#22c55e';
    if (tone === 'warning') return colors.warning || '#f59e0b';
    if (tone === 'error') return colors.error || '#ef4444';
    return colors.accent;
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <Header title="Contratos Mobile" showBackButton />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Carregando fila financeira...</Text>
        </View>
        <MobileNav />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Header title="Contratos Mobile" subtitle="Fila financeira (mobile)" showBackButton />
      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 80 + insets.bottom }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        {items.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: colors.card }]}>
            <Ionicons name="checkmark-done-circle" size={48} color={colors.textTertiary} />
            <Text style={[styles.emptyText, { color: colors.text }]}>Nenhum contrato na fila</Text>
            <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
              Aprove simulações pelo app ou web para vê-las aqui
            </Text>
          </View>
        ) : (
          items.map((item) => {
            const statusMeta = mapSimulationStatus(item.status);
            const statusColor = getToneColor(statusMeta.tone);
            const isActing = actioningId === item.id;
            return (
              <View key={item.id} style={[styles.card, { backgroundColor: colors.card }]}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardTitleGroup}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>
                      {item.user?.name || 'Cliente mobile'}
                    </Text>
                    <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                      #{item.id.substring(0, 8)} • {new Date(item.created_at || '').toLocaleDateString('pt-BR')}
                    </Text>
                  </View>
                  <View style={[styles.statusPill, { borderColor: statusColor, backgroundColor: statusColor + '20' }]}>
                    <Text style={[styles.statusText, { color: statusColor }]}>{statusMeta.label}</Text>
                  </View>
                </View>

                <View style={styles.row}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Solicitado</Text>
                  <Text style={[styles.value, { color: colors.text }]}>{formatCurrency(item.requested_amount)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Total</Text>
                  <Text style={[styles.value, { color: colors.text }]}>{formatCurrency(item.total_amount)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Parcelas</Text>
                  <Text style={[styles.value, { color: colors.text }]}>{item.installments}x</Text>
                </View>

                <View style={styles.actionsRow}>
                  <Pressable
                    style={[
                      styles.actionButton,
                      { borderColor: colors.error, backgroundColor: colors.card },
                      isActing && { opacity: 0.6 },
                    ]}
                    disabled={isActing}
                    onPress={() => handleCancel(item.id)}
                  >
                    <Ionicons name="close-circle" size={18} color={colors.error} />
                    <Text style={[styles.actionText, { color: colors.error }]}>Cancelar</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.actionButton,
                      { borderColor: colors.accent, backgroundColor: colors.card },
                      isActing && { opacity: 0.6 },
                    ]}
                    disabled={isActing}
                    onPress={() => handleApprove(item.id)}
                  >
                    <Ionicons name="send" size={18} color={colors.accent} />
                    <Text style={[styles.actionText, { color: colors.accent }]}>Enviar ao Fin.</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.actionButton,
                      { borderColor: colors.success, backgroundColor: colors.success + '20' },
                      isActing && { opacity: 0.6 },
                    ]}
                    disabled={isActing}
                    onPress={() => handleDisburse(item.id)}
                  >
                    <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                    <Text style={[styles.actionText, { color: colors.success }]}>Efetivar</Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
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
    padding: spacing.md,
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
  emptyState: {
    padding: spacing.xl,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '700',
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
  card: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  cardTitleGroup: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  cardSubtitle: {
    fontSize: 12,
  },
  statusPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 2,
  },
  label: {
    fontSize: 14,
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
