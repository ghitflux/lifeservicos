import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { borderRadius, spacing } from '@/constants/theme';
import { Header, MobileNav } from '@/components';
import { api } from '@/services/api';
import { formatDateSafe } from '@/utils/formatters';
import { mapSimulationStatus } from '@/utils/status';

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
  type: 'simulation';
}

export default function Historico() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [items, setItems] = useState<Simulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const simulationsRes = await api.get('/mobile/simulations').catch(() => ({ data: [] }));
      const simulationsWithType: Simulation[] = (simulationsRes.data || []).map((sim: any) => ({
        ...sim,
        type: 'simulation' as const,
      }));

      const combined = simulationsWithType.sort((a, b) => {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        return dateB - dateA;
      });

      setItems(combined);
    } catch (error) {
      console.error('Error fetching history:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchHistory();
  }, []);

  const handleBack = () => {
    router.push('/(tabs)/dashboard');
  };

  const getStatusColor = (status: string) => {
    const tone = mapSimulationStatus(status).tone;
    if (tone === 'success') return colors.success || '#22c55e';
    if (tone === 'warning') return colors.warning || '#f59e0b';
    if (tone === 'error') return colors.error || '#ef4444';
    return colors.accent;
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
        <Header title="Histórico" subtitle="Acompanhe suas simulações" showBackButton onBackPress={handleBack} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Carregando histórico...</Text>
        </View>
        <MobileNav />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
      <Header 
        title="Histórico" 
        subtitle="Acompanhe suas simulações" 
        showBackButton 
        onBackPress={handleBack} 
      />

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 80 + insets.bottom }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        {items.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: colors.card }]}>
            <Ionicons name="time-outline" size={64} color={colors.textTertiary} />
            <Text style={[styles.emptyText, { color: colors.text }]}>Nenhum histórico ainda</Text>
            <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
              Suas atividades aparecerão aqui
            </Text>
          </View>
        ) : (
          items.map((simulation) => {
            const statusMeta = mapSimulationStatus(simulation.status);
            const statusColor = getStatusColor(simulation.status);
            const statusIcon =
              statusMeta.tone === 'success'
                ? 'checkmark-circle'
                : statusMeta.tone === 'error'
                  ? 'close-circle'
                  : statusMeta.tone === 'warning'
                    ? 'time'
                    : 'information-circle';

            const handleNavigateToDetails = () => {
              router.push({
                pathname: '/screens/detalhes-simulacao',
                params: { id: simulation.id }
              });
            };

            return (
              <Pressable
                key={`sim-${simulation.id}`}
                style={[styles.card, { backgroundColor: colors.card }]}
                onPress={handleNavigateToDetails}
              >
                <View style={styles.cardContent}>
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={[styles.cardType, { color: colors.text }]}>
                        {simulation.simulation_type} #{simulation.id.substring(0, 8)}
                      </Text>
                      <Text style={[styles.cardAmount, { color: colors.accent }]}>
                        R$ {simulation.requested_amount.toFixed(2).replace('.', ',')}
                      </Text>
                    </View>
                    <View style={[styles.statusIcon, { borderColor: statusColor }]}>
                      <Ionicons
                        name={statusIcon as any}
                        size={24}
                        color={statusColor}
                      />
                    </View>
                  </View>
                  <View style={styles.cardFooter}>
                    <Text style={[styles.cardStatus, { color: statusColor }]}>
                      {statusMeta.label}
                    </Text>
                    <Text style={[styles.cardDate, { color: colors.textSecondary }]}>
                      {formatDateSafe(simulation.created_at)}
                    </Text>
                  </View>
                </View>
                <Pressable
                  style={[styles.cardAction, { borderTopColor: colors.border }]}
                  onPress={handleNavigateToDetails}
                >
                  <Text style={[styles.cardActionText, { color: colors.accent }]}>Ver Detalhes</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.accent} />
                </Pressable>
              </Pressable>
            );
          })
        )}
      </ScrollView>
      
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
  card: {
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  cardContent: {
    padding: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  cardType: {
    fontSize: 16,
    marginBottom: 4,
  },
  cardAmount: {
    fontSize: 20,
  },
  cardSubtext: {
    fontSize: 12,
  },
  statusIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardStatus: {
    fontSize: 14,
  },
  cardDate: {
    fontSize: 12,
  },
  cardAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
    borderTopWidth: 1,
    gap: 8,
  },
  cardActionText: {
    fontSize: 14,
  },
  emptyState: {
    padding: 60,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    marginTop: 40,
  },
  emptyText: {
    fontSize: 18,
    marginTop: spacing.md,
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
