import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Button, Input, Loading, Card, Header, MobileNav, AlertDialog } from '@/components';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency } from '@/utils/formatters';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { borderRadius, spacing } from '@/constants/theme';
import { api } from '@/services/api';
import { useAlert } from '@/hooks/useAlert';

interface MarginData {
  total_margin: number;
  used_margin: number;
  available_margin: number;
  employer: string;
  employment_type: string;
}

export default function ConsultarMargem() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { alert, showError, dismissAlert } = useAlert();
  const [cpf, setCpf] = useState('');
  const [loading, setLoading] = useState(false);
  const [marginData, setMarginData] = useState<MarginData | null>(null);

  const handleConsult = async () => {
    setLoading(true);
    try {
      // Backend expõe o saldo atual via /mobile/margins/current
      const response = await api.get('/mobile/margins/current');
      setMarginData(response.data);
    } catch (error: any) {
      console.error('Margin consultation error:', error);
      showError('Erro', error.response?.data?.detail || 'Erro ao consultar margem no backend web');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <Loading />;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Header title="Consultar Margem" showBackButton />
      <View style={styles.content}>
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={{ paddingBottom: 80 + insets.bottom }}
        >
          {!marginData ? (
            <View style={styles.section}>
              <View style={[styles.infoCard, { backgroundColor: colors.primary + '1A' }]}>
                <Ionicons name="information-circle-outline" size={24} color={colors.primary} />
                <Text style={[styles.infoText, { color: colors.text }]}>
                  Consulte sua margem consignável disponível
                </Text>
              </View>

              <Card>
                <Input
                  label="CPF"
                  placeholder="000.000.000-00"
                  keyboardType="numeric"
                  value={cpf}
                  onChangeText={setCpf}
                />

                <Button title="Consultar" onPress={handleConsult} />
              </Card>
            </View>
          ) : (
            <>
              <Card style={styles.successCard}>
                <Ionicons name="checkmark-circle" size={48} color={colors.success} />
                <Text style={[styles.successText, { color: colors.text }]}>Consulta Realizada!</Text>
              </Card>

              <Card style={styles.marginCard}>
                <View style={styles.marginItem}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Margem Total</Text>
                  <Text style={[styles.value, { color: colors.text }]}>
                    {formatCurrency(marginData.total_margin)}
                  </Text>
                </View>

                <View style={styles.marginItem}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Margem Utilizada</Text>
                  <Text style={[styles.value, { color: colors.error }]}>
                    {formatCurrency(marginData.used_margin)}
                  </Text>
                </View>

                <View style={[styles.separator, { backgroundColor: colors.border }]} />

                <View style={styles.marginItem}>
                  <Text style={[styles.labelBold, { color: colors.text }]}>Margem Disponível</Text>
                  <Text style={[styles.valueLarge, { color: colors.success }]}>
                    {formatCurrency(marginData.available_margin)}
                  </Text>
                </View>

                <View style={[styles.separator, { backgroundColor: colors.border }]} />

                <View style={styles.marginItem}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Empregador</Text>
                  <Text style={[styles.valueText, { color: colors.text }]}>{marginData.employer}</Text>
                </View>

                <View style={styles.marginItem}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Tipo de Vínculo</Text>
                  <Text style={[styles.valueText, { color: colors.text }]}>{marginData.employment_type}</Text>
                </View>
              </Card>

              <View style={[styles.buttonContainer, { paddingBottom: insets.bottom + 20 }]}>
                <Button
                  title="Nova Consulta"
                  variant="outline"
                  onPress={() => setMarginData(null)}
                />
              </View>
            </>
          )}
        </ScrollView>
      </View>

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
  },
  scrollView: {
    flex: 1,
  },
  section: {
    padding: spacing.lg,
  },
  infoCard: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  infoText: {
    flex: 1,
    fontSize: 14,
  },
  successCard: {
    margin: spacing.lg,
    padding: spacing.xl,
    alignItems: 'center',
  },
  successText: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  marginCard: {
    marginHorizontal: spacing.lg,
  },
  marginItem: {
    paddingVertical: spacing.sm,
  },
  label: {
    fontSize: 14,
    marginBottom: 4,
  },
  labelBold: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  value: {
    fontSize: 18,
    fontWeight: '500',
  },
  valueLarge: {
    fontSize: 24,
    fontWeight: '700',
  },
  valueText: {
    fontSize: 16,
    fontWeight: '500',
  },
  separator: {
    height: 1,
    marginVertical: spacing.sm,
  },
  buttonContainer: {
    padding: spacing.lg,
  },
});
