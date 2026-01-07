import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl, Animated, Easing, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/contexts/ThemeContext';
import { borderRadius, spacing } from '@/constants/theme';
import { Header, MobileNav } from '@/components';
import { api } from '@/services/api';
import { mapSimulationStatus } from '@/utils/status';

export default function Dashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
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

  const benefitBanners = [
    {
      title: 'Melhores taxas',
      description: 'Temos as melhores taxas do mercado.',
      icon: 'trending-down',
      colors: ['#0ea5e9', '#2563eb'],
    },
    {
      title: 'Menos burocracia',
      description: 'Tudo simples e direto pelo app.',
      icon: 'sparkles',
      colors: ['#f97316', '#f59e0b'],
    },
    {
      title: 'Acompanhamento',
      description: 'Acompanhamento individual do início ao fim.',
      icon: 'person-circle',
      colors: ['#22c55e', '#16a34a'],
    },
  ];
  const bannerScrollRef = useRef<ScrollView>(null);
  const bannerIndexRef = useRef(0);
  const bannerCardWidth = Math.min(320, Math.round(width * 0.78));

  // Animação pulsante para o card de simulação
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.02,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  useEffect(() => {
    if (!bannerCardWidth) return;

    const step = bannerCardWidth + spacing.md;
    const interval = setInterval(() => {
      bannerIndexRef.current = (bannerIndexRef.current + 1) % benefitBanners.length;
      bannerScrollRef.current?.scrollTo({
        x: bannerIndexRef.current * step,
        animated: true,
      });
    }, 3800);

    return () => clearInterval(interval);
  }, [bannerCardWidth, benefitBanners.length]);

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

      {/* Retorno da Análise - Mostrar primeiro se houver simulação em análise */}
      {dashboardData.latestSimulation && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Retorno da Análise</Text>
          <Pressable
            style={({ pressed }) => [
              styles.statusCard,
              { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, opacity: pressed ? 0.7 : 1 }
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

      {/* Card de Solicitar Simulação */}
      <View style={[styles.prominentSection, { paddingHorizontal: spacing.md }]}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <Pressable
            style={({ pressed }) => [
              styles.prominentCard,
              { opacity: pressed ? 0.95 : 1 }
            ]}
            onPress={handleEnviarDocumento}
          >
            <LinearGradient
              colors={['#10b981', '#059669', '#047857']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.gradientCard}
            >
              {/* Badge destaque */}
              <View style={styles.highlightBadge}>
                <Ionicons name="star" size={14} color="#fbbf24" />
                <Text style={styles.highlightBadgeText}>OFERTA EXCLUSIVA</Text>
              </View>

              {/* Ícone principal */}
              <View style={styles.prominentCardHeader}>
                <View style={styles.prominentIconContainer}>
                  <LinearGradient
                    colors={['rgba(255, 255, 255, 0.25)', 'rgba(255, 255, 255, 0.15)']}
                    style={styles.iconGradient}
                  >
                    <Ionicons name="document-text" size={38} color="#ffffff" />
                  </LinearGradient>
                </View>
              </View>

              {/* Conteúdo principal */}
              <View style={styles.prominentCardBody}>
                <Text style={styles.prominentTitle}>
                  Solicite sua simulação
                </Text>
                <Text style={styles.prominentSubtitle}>
                  Envie o contracheque e receba a análise rapidamente.
                </Text>

                {/* Botão de ação */}
                <View style={styles.prominentButtonContainer}>
                  <Text style={styles.prominentButtonText}>Enviar contracheque agora</Text>
                  <Ionicons name="arrow-forward-circle" size={22} color="#047857" />
                </View>
              </View>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </View>

      {/* Banners de Benefícios */}
      <View style={[styles.section, { paddingTop: 0 }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Vantagens</Text>
        <ScrollView
          ref={bannerScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={bannerCardWidth + spacing.md}
          decelerationRate="fast"
          contentContainerStyle={{ paddingHorizontal: spacing.md }}
        >
          {benefitBanners.map((banner, index) => (
            <LinearGradient
              key={`${banner.title}-${index}`}
              colors={banner.colors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.benefitBanner,
                { width: bannerCardWidth, marginRight: index === benefitBanners.length - 1 ? 0 : spacing.md },
              ]}
            >
              <View style={styles.benefitBannerHeader}>
                <View style={styles.benefitIconWrap}>
                  <Ionicons name={banner.icon as any} size={20} color="#ffffff" />
                </View>
                <Text style={styles.benefitTitle}>{banner.title}</Text>
              </View>
              <Text style={styles.benefitDescription}>{banner.description}</Text>
            </LinearGradient>
          ))}
        </ScrollView>
      </View>

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
                  { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, opacity: pressed ? 0.7 : 1 }
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
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.lg,
    color: '#FFFFFF',
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
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  gradientCard: {
    padding: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  highlightBadge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  highlightBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  prominentCardHeader: {
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  prominentIconContainer: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  iconGradient: {
    width: '100%',
    height: '100%',
    borderRadius: borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  prominentCardBody: {
    alignItems: 'center',
    gap: spacing.sm,
    width: '100%',
  },
  prominentTitle: {
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  prominentSubtitle: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  prominentButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    backgroundColor: '#ffffff',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  prominentButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#047857',
    letterSpacing: 0.3,
  },
  benefitBanner: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    minHeight: 120,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  benefitBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  benefitIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
  },
  benefitDescription: {
    fontSize: 12,
    lineHeight: 16,
    color: 'rgba(255, 255, 255, 0.9)',
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

