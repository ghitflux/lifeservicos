import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { borderRadius, spacing } from '@/constants/theme';
import { Header, MobileNav } from '@/components';
import { formatCurrency } from '@/utils/formatters';
import { api } from '@/services/api';
import { useState, useEffect } from 'react';

interface MarginHistory {
  date: string;
  value: number;
  status: 'current' | 'past';
}

interface MarginData {
  availableMargin: number;
  totalMargin: number;
  usedMargin: number;
  history: MarginHistory[];
}

export default function DetalhesMargem() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [marginData, setMarginData] = useState<MarginData | null>(null);

  useEffect(() => {
    fetchMarginData();
  }, []);

  const fetchMarginData = async () => {
    try {
      const response = await api.get('/mobile/margins/current');
      const data = response.data;

      setMarginData({
        availableMargin: data.available_margin || 0,
        totalMargin: data.total_margin || 0,
        usedMargin: data.used_margin || 0,
        history: (data.history || []).map((item: any) => ({
          date: item.date,
          value: item.value,
          status: item.status || 'past',
        })),
      });
    } catch (error) {
      console.error('Error fetching margin data:', error);
      setMarginData(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <Header title="Detalhes da Margem" showBackButton />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
        <MobileNav />
      </SafeAreaView>
    );
  }

  if (!marginData) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <Header title="Detalhes da Margem" showBackButton />
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: colors.textSecondary }]}>
            Erro ao carregar dados da margem
          </Text>
        </View>
        <MobileNav />
      </SafeAreaView>
    );
  }

  const percentualDisponivel = marginData.totalMargin > 0
    ? Math.round((marginData.availableMargin / marginData.totalMargin) * 100)
    : 0;

  const margemHistory: MarginHistory[] = marginData.history.length > 0
    ? marginData.history
    : [];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Header title="Detalhes da Margem" showBackButton />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: 80 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        {/* Margem Atual */}
        <View style={[styles.marginCard, { backgroundColor: colors.card, borderColor: colors.accent + '50' }]}>
          <View style={styles.marginHeader}>
            <View style={styles.marginHeaderContent}>
              <Text style={[styles.marginLabel, { color: colors.textSecondary }]}>
                Margem Disponível
              </Text>
              <Text style={[styles.marginValue, { color: colors.accent }]}>
                {formatCurrency(marginData.availableMargin)}
              </Text>
            </View>
            <View style={[styles.iconContainer, { backgroundColor: colors.accent + '20' }]}>
              <Ionicons name="trending-up" size={24} color={colors.accent} />
            </View>
          </View>

          <View style={styles.marginDetails}>
            <View style={[styles.marginDetailRow, { borderTopColor: colors.border + '50' }]}>
              <Text style={[styles.marginDetailLabel, { color: colors.textSecondary }]}>
                Margem Bruta
              </Text>
              <Text style={[styles.marginDetailValue, { color: colors.text }]}>
                {formatCurrency(marginData.totalMargin)}
              </Text>
            </View>
            <View style={[styles.marginDetailRow, { borderTopColor: colors.border + '50' }]}>
              <Text style={[styles.marginDetailLabel, { color: colors.textSecondary }]}>
                Margem Utilizada
              </Text>
              <Text style={[styles.marginDetailValue, { color: colors.text }]}>
                {formatCurrency(marginData.usedMargin)}
              </Text>
            </View>
            <View style={[styles.marginDetailRow, { borderTopColor: colors.border + '50' }]}>
              <Text style={[styles.marginDetailLabel, { color: colors.textSecondary }]}>
                % Disponível
              </Text>
              <Text style={[styles.marginDetailValue, { color: colors.success }]}>
                {percentualDisponivel}%
              </Text>
            </View>
          </View>
        </View>

        {/* Histórico de Margem */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Histórico de Margem</Text>
          <View style={styles.historyList}>
            {margemHistory.length > 0 ? (
              margemHistory.map((item, index) => (
              <View
                key={index}
                style={[
                  styles.historyCard,
                  { backgroundColor: colors.card, borderColor: colors.border + '50' },
                  index === 0 && styles.historyCardFirst,
                ]}
              >
                <View style={styles.historyCardContent}>
                  <View
                    style={[
                      styles.historyIconContainer,
                      {
                        backgroundColor:
                          item.status === 'current' ? colors.success + '20' : colors.cardSecondary,
                      },
                    ]}
                  >
                    {item.status === 'current' ? (
                      <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                    ) : (
                      <Ionicons name="time-outline" size={20} color={colors.textSecondary} />
                    )}
                  </View>
                  <View style={styles.historyTextContainer}>
                    <Text style={[styles.historyDate, { color: colors.text }]}>{item.date}</Text>
                    <Text style={[styles.historyStatus, { color: colors.textSecondary }]}>
                      {item.status === 'current' ? 'Atual' : 'Histórico'}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.historyValue, { color: colors.text }]}>
                  {formatCurrency(item.value)}
                </Text>
              </View>
            ))
            ) : (
              <Text style={[styles.noHistoryText, { color: colors.textSecondary }]}>
                Nenhum histórico de margem disponível
              </Text>
            )}
          </View>
        </View>

        {/* Informações Adicionais */}
        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border + '50' }]}>
          <Text style={[styles.infoTitle, { color: colors.text }]}>Informações</Text>
          <View style={styles.infoContent}>
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              <Text style={[styles.infoBold, { color: colors.text }]}>Atualização:</Text> A
              margem é atualizada mensalmente com base no seu contracheque.
            </Text>
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              <Text style={[styles.infoBold, { color: colors.text }]}>Validade:</Text> A margem
              disponível é válida até o próximo processamento de folha.
            </Text>
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              <Text style={[styles.infoBold, { color: colors.text }]}>Reserva:</Text> Ao iniciar
              uma simulação, a margem é temporariamente reservada.
            </Text>
          </View>
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
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
  },
  marginCard: {
    margin: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
  },
  marginHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
  },
  marginHeaderContent: {
    flex: 1,
  },
  marginLabel: {
    fontSize: 14,
    marginBottom: spacing.sm,
  },
  marginValue: {
    fontSize: 36,
    fontWeight: 'bold',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  marginDetails: {
    gap: 0,
  },
  marginDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
  },
  marginDetailLabel: {
    fontSize: 14,
  },
  marginDetailValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  historyList: {
    gap: spacing.sm,
  },
  noHistoryText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  historyCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
  },
  historyCardFirst: {
    // No special styling needed, but kept for consistency
  },
  historyCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  historyIconContainer: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyTextContainer: {
    flex: 1,
  },
  historyDate: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 2,
  },
  historyStatus: {
    fontSize: 12,
  },
  historyValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  infoCard: {
    margin: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  infoContent: {
    gap: spacing.md,
  },
  infoText: {
    fontSize: 14,
    lineHeight: 20,
  },
  infoBold: {
    fontWeight: '600',
  },
});

