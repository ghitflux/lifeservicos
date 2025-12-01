import { View, Text, TextInput, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { borderRadius, spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { AlertDialog } from '@/components';
import { useAlert } from '@/hooks/useAlert';
import { maskCPF, maskPhone } from '@/utils/formatters';

export default function Register() {
  const router = useRouter();
  const { colors } = useTheme();
  const { register } = useAuth();
  const { alert, showError, showSuccess, dismissAlert } = useAlert();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [cpf, setCPF] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    // Validations
    const cpfNumbers = cpf.replace(/\D/g, '');
    const phoneNumbers = whatsapp.replace(/\D/g, '');

    if (!name || !email || !password || !confirmPassword || !cpfNumbers || !phoneNumbers) {
      showError('Erro', 'Por favor, preencha todos os campos');
      return;
    }

    if (cpfNumbers.length !== 11) {
      showError('Erro', 'CPF inválido. Digite 11 dígitos.');
      return;
    }

    if (phoneNumbers.length < 10) {
      showError('Erro', 'Informe um WhatsApp válido');
      return;
    }

    if (password !== confirmPassword) {
      showError('Erro', 'As senhas não coincidem');
      return;
    }

    if (password.length < 6) {
      showError('Erro', 'A senha deve ter no mínimo 6 caracteres');
      return;
    }

    setLoading(true);
    const result = await register({
      name,
      email,
      password,
      cpf: cpfNumbers,
      phone: phoneNumbers,
    });
    setLoading(false);

    if (result.success) {
      showSuccess(
        'Sucesso',
        'Conta criada com sucesso! Faça login para continuar.',
        () => router.replace('/(auth)/login')
      );
    } else {
      showError('Erro', result.error || 'Erro ao criar conta');
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: colors.text }]}>Criar Conta</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Preencha seus dados para começar</Text>

      <View style={styles.form}>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
          placeholder="Nome completo"
          placeholderTextColor={colors.placeholder}
          value={name}
          onChangeText={setName}
        />

        <TextInput
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
          placeholder="Email"
          placeholderTextColor={colors.placeholder}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <TextInput
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
          placeholder="CPF (000.000.000-00)"
          placeholderTextColor={colors.placeholder}
          value={cpf}
          onChangeText={(text) => setCPF(maskCPF(text))}
          keyboardType="numeric"
          maxLength={14}
        />

        <TextInput
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
          placeholder="WhatsApp (00) 99999-9999"
          placeholderTextColor={colors.placeholder}
          value={whatsapp}
          onChangeText={(text) => setWhatsapp(maskPhone(text))}
          keyboardType="phone-pad"
          maxLength={15}
        />

        <TextInput
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
          placeholder="Senha"
          placeholderTextColor={colors.placeholder}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TextInput
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
          placeholder="Confirmar senha"
          placeholderTextColor={colors.placeholder}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
        />

        <Pressable
          style={[styles.button, { backgroundColor: colors.primary, opacity: loading ? 0.7 : 1 }]}
          onPress={handleRegister}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={[styles.buttonText, { color: colors.text }]}>Criar Conta</Text>
          )}
        </Pressable>

        <Pressable onPress={() => router.back()}>
          <Text style={[styles.link, { color: colors.accent }]}>Já tem conta? Entrar</Text>
        </Pressable>
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
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    justifyContent: 'center',
    minHeight: '100%',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: spacing.xl,
  },
  form: {
    gap: spacing.md,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 16,
  },
  button: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '600',
  },
  link: {
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});

