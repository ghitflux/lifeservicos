import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { typography, borderRadius, spacing } from '@/constants/theme';
import { Header, MobileNav } from '@/components';
import { formatCurrency } from '@/utils/formatters';

export default function ResultadoSimulacao() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const requestedAmount = parseFloat(params.requestedAmount as string) || 29536.54;
  const installments = parseInt(params.installments as string) || 96;
  const interestRate = parseFloat(params.interestRate as string) || 8;
  const installmentValue = parseFloat(params.installmentValue as string) || 1613.31;
  const totalAmount = parseFloat(params.totalAmount as string) || 45734.90;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Header 
        title="Resultado da Simulação" 
        subtitle="#1234" 
        showBackButton 
      />

      <ScrollView 
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 80 + insets.bottom }}
      >
        <View style={[styles.preApprovedCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.preApprovedLabel, { color: colors.success }]}>Valor Pré-Liberado para Você!</Text>
          <Text style={[styles.preApprovedValue, { color: colors.success }]}>R$ {formatCurrency(requestedAmount)}</Text>
        </View>

        <View style={styles.actionsRow}>
          <Pressable style={[styles.rejectButton, { backgroundColor: colors.error }]}>
            <Ionicons name="close" size={20} color={colors.text} />
            <Text style={[styles.rejectButtonText, { color: colors.text }]}>Reprovar</Text>
          </Pressable>
          <Pressable style={[styles.approveButton, { backgroundColor: colors.success }]}>
            <Ionicons name="checkmark" size={20} color={colors.text} />
            <Text style={[styles.approveButtonText, { color: colors.text }]}>Aprovar e Enviar</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Bancos Incluídos</Text>
          <View style={styles.banksRow}>
            <Pressable style={[styles.bankButton, { backgroundColor: colors.cardSecondary, borderColor: colors.accent }]}>
              <Text style={[styles.bankButtonText, { color: colors.text }]}>DAYCOVAL</Text>
            </Pressable>
            <Pressable style={[styles.bankButton, { backgroundColor: colors.cardSecondary, borderColor: colors.accent }]}>
              <Text style={[styles.bankButtonText, { color: colors.text }]}>CAIXA</Text>
            </Pressable>
          </View>
          <View style={styles.bankInfo}>
            <Text style={[styles.bankInfoText, { color: colors.textSecondary }]}>Prazo: {installments} meses</Text>
            <Text style={[styles.bankInfoText, { color: colors.textSecondary }]}>% Consultoria: {interestRate}%</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="bar-chart" size={20} color={colors.accent} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Totais dos Bancos</Text>
          </View>
          <View style={[styles.totalsCard, { backgroundColor: colors.card }]}>
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>Valor Parcela Total</Text>
              <Text style={[styles.totalValue, { color: colors.text }]}>R$ {formatCurrency(installmentValue)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>Saldo Devedor Total</Text>
              <Text style={[styles.totalValue, { color: colors.text }]}>R$ {formatCurrency(totalAmount)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>Valor Liberado Total</Text>
              <Text style={[styles.totalValue, { color: colors.text }]}>R$ {formatCurrency(requestedAmount * 0.8)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>Seguro Obrigatório Banco</Text>
              <Text style={[styles.totalValue, { color: colors.text }]}>R$ 1.500,00</Text>
            </View>
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
  content: {
    flex: 1,
  },
  preApprovedCard: {
    margin: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  preApprovedLabel: {
    fontSize: 14,
    marginBottom: spacing.sm,
  },
  preApprovedValue: {
    fontSize: 36,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  rejectButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  rejectButtonText: {
    fontSize: 16,
  },
  approveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  approveButtonText: {
    fontSize: 16,
  },
  section: {
    padding: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
  },
  banksRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  bankButton: {
    flex: 1,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  bankButtonText: {
    fontSize: 14,
  },
  bankInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bankInfoText: {
    fontSize: 14,
  },
  totalsCard: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  totalLabel: {
    fontSize: 14,
  },
  totalValue: {
    fontSize: 14,
  },
});
