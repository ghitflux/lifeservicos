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

interface Contract {
  id: string;
  status: string;
  requested_amount: number;
  total_amount: number;
  installments: number;
  installment_value: number;
  interest_rate: number;
  created_at: string;
  disbursed_at?: string;
  product?: { id: string; name: string };
  bank?: { id: string; name: string };
}

export default function ContratosMobile() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { alert, dismissAlert } = useAlert();
  const [items, setItems] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchContracts = async () => {
    try {
      const response = await api.get('/mobile/contracts');
      const data = response.data || [];
      setItems(data);
    } catch (error: any) {
      console.error('Erro ao carregar contratos:', error?.response?.data || error?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchContracts();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchContracts();
  }, []);

  const getToneColor = (tone: string) => {
    if (tone === 'success') return colors.success || '#22c55e';
    if (tone === 'warning') return colors.warning || '#f59e0b';
    if (tone === 'error') return colors.error || '#ef4444';
    return colors.accent;
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <Header title="Meus Contratos" showBackButton />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Carregando contratos...</Text>
        </View>
        <MobileNav />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Header title="Meus Contratos" subtitle="Contratos ativos e histórico" showBackButton />
      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 80 + insets.bottom }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        {items.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: colors.card }]}>
            <Ionicons name="briefcase-outline" size={48} color={colors.textTertiary} />
            <Text style={[styles.emptyText, { color: colors.text }]}>Nenhum contrato ainda</Text>
            <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
              Seus contratos aparecerão aqui após a aprovação
            </Text>
          </View>
        ) : (
          items.map((item) => {
            const statusMeta = mapSimulationStatus(item.status);
            const statusColor = getToneColor(statusMeta.tone);
            return (
              <View key={item.id} style={[styles.card, { backgroundColor: colors.card }]}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardTitleGroup}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>
                      {item.product?.name || 'Contrato'}
                    </Text>
                    <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                      {item.bank?.name || 'Banco'} • #{item.id.substring(0, 8)}
                    </Text>
                  </View>
                  <View style={[styles.statusPill, { borderColor: statusColor, backgroundColor: statusColor + '20' }]}>
                    <Text style={[styles.statusText, { color: statusColor }]}>{statusMeta.label}</Text>
                  </View>
                </View>

                <View style={styles.row}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Valor Solicitado</Text>
                  <Text style={[styles.value, { color: colors.text }]}>{formatCurrency(item.requested_amount)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Valor Total</Text>
                  <Text style={[styles.value, { color: colors.text }]}>{formatCurrency(item.total_amount)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Parcelas</Text>
                  <Text style={[styles.value, { color: colors.text }]}>{item.installments}x de {formatCurrency(item.installment_value)}</Text>
                </View>
                {item.disbursed_at && (
                  <View style={styles.row}>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>Liberado em</Text>
                    <Text style={[styles.value, { color: colors.text }]}>{new Date(item.disbursed_at).toLocaleDateString('pt-BR')}</Text>
                  </View>
                )}
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
