import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { borderRadius, spacing } from '@/constants/theme';
import { Header, MobileNav } from '@/components';
import { api } from '@/services/api';
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
}

export default function Simulacoes() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSimulations = async () => {
    try {
      const response = await api.get('/mobile/simulations');
      setSimulations(response.data);
    } catch (error) {
      console.error('Error fetching simulations:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSimulations();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchSimulations();
  }, []);

  const handleBack = () => {
    router.push('/(tabs)/dashboard');
  };

  const handleNewSimulation = () => {
    router.push('/screens/nova-simulacao');
  };

  const handleSimulationPress = (id: string) => {
    router.push({
      pathname: '/screens/detalhes-simulacao',
      params: { id },
    });
  };

  const getStatusColor = (status: string) => {
    const { tone } = mapSimulationStatus(status);
    if (tone === 'success') return colors.success || '#22c55e';
    if (tone === 'warning') return colors.warning || '#f59e0b';
    if (tone === 'error') return colors.error || '#ef4444';
    return colors.accent;
  };

  const getStatusText = (status: string) => {
    return mapSimulationStatus(status).label;
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <Header title="Simulações" showBackButton onBackPress={handleBack} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Carregando simulações...</Text>
        </View>
        <MobileNav />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Header title="Simulações" showBackButton onBackPress={handleBack} />

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 80 + insets.bottom }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        <Pressable
          style={[styles.newSimulation, { backgroundColor: colors.card, borderColor: colors.accent }]}
          onPress={handleNewSimulation}
        >
          <Ionicons name="document-attach" size={48} color={colors.accent} />
          <Text style={[styles.newSimulationText, { color: colors.accent }]}>Nova Simulação</Text>
          <Text style={[styles.newSimulationSubtext, { color: colors.textSecondary }]}>
            Envie aqui foto ou anexo do seu contracheque para fazermos sua simulação
          </Text>
        </Pressable>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Simulações Salvas</Text>

          {simulations.length === 0 ? (
            <View style={[styles.emptyState, { backgroundColor: colors.card }]}>
              <Ionicons name="document-outline" size={48} color={colors.textTertiary} />
              <Text style={[styles.emptyText, { color: colors.text }]}>Nenhuma simulação salva</Text>
              <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                Suas simulações aparecerão aqui
              </Text>
            </View>
          ) : (
            simulations.map((simulation) => (
              <Pressable
                key={simulation.id}
                style={[styles.simulationCard, { backgroundColor: colors.card }]}
                onPress={() => handleSimulationPress(simulation.id)}
              >
                <View style={styles.simulationHeader}>
                  <View>
                    <Text style={[styles.simulationAmount, { color: colors.text }]}>
                      R$ {simulation.requested_amount.toFixed(2).replace('.', ',')}
                    </Text>
                    <Text style={[styles.simulationInstallments, { color: colors.textSecondary }]}>
                      {simulation.installments}x de R$ {simulation.installment_value.toFixed(2).replace('.', ',')}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(simulation.status) + '20' }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(simulation.status) }]}>
                      {getStatusText(simulation.status)}
                    </Text>
                  </View>
                </View>
                <View style={styles.simulationFooter}>
                  <Text style={[styles.simulationDate, { color: colors.textTertiary }]}>
                    {new Date(simulation.created_at).toLocaleDateString('pt-BR')}
                  </Text>
                  <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                </View>
              </Pressable>
            ))
          )}
        </View>
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
  newSimulation: {
    margin: spacing.md,
    padding: spacing.xl,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  newSimulationText: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  newSimulationSubtext: {
    fontSize: 14,
    marginTop: 4,
  },
  section: {
    padding: spacing.md,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  emptyState: {
    padding: spacing.xl,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 4,
  },
  simulationCard: {
    padding: spacing.lg,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  simulationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  simulationAmount: {
    fontSize: 24,
    fontWeight: '700',
  },
  simulationInstallments: {
    fontSize: 14,
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  simulationFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  simulationDate: {
    fontSize: 12,
  },
});
