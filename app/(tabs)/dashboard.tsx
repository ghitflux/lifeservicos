import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { borderRadius, spacing } from '@/constants/theme';
import { Header, MobileNav } from '@/components';
import { api } from '@/services/api';
import { mapSimulationStatus } from '@/utils/status';

export default function Dashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboardData, setDashboardData] = useState<any>({
    margin: null,
    latestSimulation: null,
    recentActivity: [],
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [simulationsRes, margins] = await Promise.all([
        api.get('/mobile/simulations').catch(() => ({ data: [] })),
        api.get('/mobile/margins/current').catch(() => ({ data: null })),
      ]);

      const simulations = Array.isArray(simulationsRes.data) ? simulationsRes.data : [];

      // Get latest pending simulation
      const latestPending = simulations.find((s: any) =>
        ['pending', 'simulation_requested'].includes((s.status || '').toLowerCase())
      );

      // Recent activity: last simulations sorted by creation date
      const allActivity = simulations
        .map((s: any) => ({ ...s, type: 'simulation' }))
        .sort((a: any, b: any) => {
          const dateA = new Date(a.created_at || a.createdAt || 0).getTime();
          const dateB = new Date(b.created_at || b.createdAt || 0).getTime();
          return dateB - dateA;
        })
        .slice(0, 5);

      setDashboardData({
        margin: margins.data,
        latestSimulation: latestPending,
        recentActivity: allActivity,
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchDashboardData();
  }, []);

  const handleConsultarMargem = () => {
    router.push('/screens/detalhes-margem');
  };

  const handleEnviarDocumento = () => {
    router.push('/screens/enviar-documento');
  };

  const handleHistorico = () => {
    router.push('/(tabs)/historico');
  };

  const handleAjuda = () => {
    router.push('/screens/ajuda-suporte');
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
        <Header />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Carregando dashboard...</Text>
        </View>
        <MobileNav />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Header />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: 80 + insets.bottom }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >

      <View style={[styles.prominentSection, { paddingHorizontal: spacing.md }]}>
        <Pressable
          style={({ pressed }) => [
            styles.prominentCard,
            { backgroundColor: '#22c55e', opacity: pressed ? 0.9 : 1 }
          ]}
          onPress={handleEnviarDocumento}
        >
          <View style={styles.prominentCardHeader}>
            <View style={[styles.prominentIconContainer, { backgroundColor: 'rgba(255, 255, 255, 0.2)' }]}>
              <Ionicons name="document-outline" size={44} color="#ffffff" />
            </View>
          </View>
          <View style={styles.prominentCardBody}>
            <Text style={[styles.prominentTitle, { color: '#ffffff' }]}>Toque aqui para solicitar simulação</Text>
            <Text style={[styles.prominentSubtitle, { color: 'rgba(255, 255, 255, 0.95)' }]}>
              Envie foto ou documento do seu contracheque para fazermos sua simulação
            </Text>
            <View style={[styles.prominentButtonContainer, { backgroundColor: 'rgba(255, 255, 255, 0.2)', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.md, marginTop: spacing.md }]}>
              <Text style={[styles.prominentButtonText, { color: '#ffffff' }]}>Enviar contracheque</Text>
              <Ionicons name="arrow-forward" size={18} color="#ffffff" />
            </View>
          </View>
        </Pressable>
      </View>

      {dashboardData.latestSimulation && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Retorno da Análise</Text>
          <Pressable
            style={({ pressed }) => [
              styles.statusCard,
              { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 }
            ]}
            onPress={() => router.push({
              pathname: '/screens/detalhes-simulacao',
              params: { id: dashboardData.latestSimulation.id }
            })}
          >
            <View style={[styles.statusBadge, { backgroundColor: colors.warning }]}>
              <Ionicons name="time-outline" size={20} color={colors.text} />
            </View>
            <View style={styles.statusContent}>
              <Text style={[styles.statusTitle, { color: colors.text }]}>
                Análise de Margem
              </Text>
              <Text style={[styles.statusSubtitle, { color: colors.textSecondary }]}>
                Resultado da análise do contracheque
              </Text>
            </View>
            <View>
              <Text style={[styles.statusLink, { color: colors.accent }]}>Ver</Text>
            </View>
          </Pressable>
        </View>
      )}

      {dashboardData.recentActivity.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Histórico Recente</Text>
            <Pressable onPress={() => router.push('/(tabs)/historico')}>
              <Text style={[styles.seeAllLink, { color: colors.accent }]}>Ver Tudo</Text>
            </Pressable>
          </View>
          {dashboardData.recentActivity.map((activity: any) => {
            const statusMeta = mapSimulationStatus(activity.status);
            const statusColor = getToneColor(statusMeta.tone);

            return (
              <Pressable
                key={`sim-${activity.id}`}
                style={({ pressed }) => [
                  styles.activityCard,
                  { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 }
                ]}
                onPress={() => router.push({
                  pathname: '/screens/detalhes-simulacao',
                  params: { id: activity.id }
                })}
              >
                <View style={[styles.activityIcon, { backgroundColor: colors.accent + '20' }]}>
                  <Ionicons
                    name="calculator-outline"
                    size={20}
                    color={colors.accent}
                  />
                </View>
                <View style={styles.activityContent}>
                  <Text style={[styles.activityTitle, { color: colors.text }]}>
                    {`Simulação #${String(activity.id).substring(0, 8)}`}
                  </Text>
                  <Text style={[styles.activitySubtitle, { color: colors.textSecondary }]}>
                    {activity.requested_amount ? `R$ ${activity.requested_amount.toFixed(2).replace('.', ',')}` : 'Sem valor informado'}
                  </Text>
                </View>
                <Text style={[styles.activityStatus, { color: statusColor }]}>
                  {statusMeta.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontSize: 14,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  prominentSection: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.lg,
    color: '#000',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  seeAllLink: {
    fontSize: 14,
    fontWeight: '600',
  },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  activitySubtitle: {
    fontSize: 12,
  },
  activityStatus: {
    fontSize: 12,
    fontWeight: '600',
  },
  prominentCard: {
    padding: spacing.xl,
    borderRadius: borderRadius.xl,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
    gap: spacing.lg,
  },
  prominentCardHeader: {
    alignItems: 'center',
  },
  prominentIconContainer: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  prominentCardBody: {
    alignItems: 'center',
    gap: spacing.md,
  },
  prominentTitle: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  prominentSubtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  prominentButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  prominentButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    gap: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  statusBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  statusContent: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  statusSubtitle: {
    fontSize: 13,
  },
  statusLink: {
    fontSize: 14,
    fontWeight: '600',
  },
});

