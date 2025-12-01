import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Input, Button, Header, MobileNav, AlertDialog } from '@/components';
import { useTheme } from '@/contexts/ThemeContext';
import { borderRadius, spacing } from '@/constants/theme';
import { api } from '@/services/api';
import { useAlert } from '@/hooks/useAlert';

export default function NovaSimulacao() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { alert, showError, dismissAlert } = useAlert();
  const [amount, setAmount] = useState('');
  const [installments, setInstallments] = useState('');
  const [interestRate] = useState('2.5'); // Fixed rate for now
  const [loading, setLoading] = useState(false);

  const handleSimulate = async () => {
    if (!amount || !installments) {
      showError('Erro', 'Preencha todos os campos');
      return;
    }

    const requestedAmount = parseFloat(amount);
    const numInstallments = parseInt(installments);
    const rate = parseFloat(interestRate);

    setLoading(true);
    try {
      // Create simulation on backend
      const response = await api.post('/mobile/simulations', {
        simulation_type: 'multi_bank',
        requested_amount: requestedAmount,
        installments: numInstallments,
        interest_rate: rate,
      });

      const simulation = response.data;

      // Navigate to simulation details with the created simulation ID
      router.push({
        pathname: '/screens/detalhes-simulacao',
        params: { id: simulation.id },
      });
    } catch (error: any) {
      console.error('Simulation error:', error);
      showError('Erro', error.response?.data?.detail || 'Erro ao criar simulação');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Header title="Nova Simulação" showBackButton />

      <ScrollView 
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 80 + insets.bottom }}
      >
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Dados da Simulação</Text>

          <Input
            label="Valor Desejado (R$)"
            placeholder="Ex: 10000"
            keyboardType="numeric"
            value={amount}
            onChangeText={setAmount}
          />

          <Input
            label="Número de Parcelas"
            placeholder="Ex: 24"
            keyboardType="numeric"
            value={installments}
            onChangeText={setInstallments}
          />

          <Input
            label="Taxa de Juros (%)"
            value={interestRate}
            editable={false}
          />

          <Text style={[styles.info, { color: colors.textSecondary }]}>
            * Taxa de juros fixa mensal
          </Text>
        </View>

        <View style={styles.buttonContainer}>
          <Button
            title={loading ? "Criando simulação..." : "Simular"}
            onPress={handleSimulate}
            disabled={loading}
          />
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
  },
  card: {
    margin: spacing.lg,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: spacing.lg,
  },
  info: {
    fontSize: 12,
    marginTop: spacing.sm,
  },
  buttonContainer: {
    padding: spacing.lg,
  },
});

