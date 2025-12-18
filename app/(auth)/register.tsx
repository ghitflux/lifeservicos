import { View, Text, TextInput, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { borderRadius, spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { AlertDialog } from '@/components';
import { useAlert } from '@/hooks/useAlert';
import { maskCPF, maskPhone } from '@/utils/formatters';
import { Ionicons } from '@expo/vector-icons';

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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [consentCreditSimulation, setConsentCreditSimulation] = useState(false);

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

    if (!consentCreditSimulation) {
      showError(
        'Erro',
        'Para concluir o cadastro, você precisa autorizar o acesso aos seus dados para finalidade de simulação de crédito.'
      );
      return;
    }

    setLoading(true);
    const result = await register({
      name,
      email,
      password,
      cpf: cpfNumbers,
      phone: phoneNumbers,
      consent_credit_simulation: consentCreditSimulation,
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

        <View style={styles.passwordContainer}>
          <TextInput
            style={[styles.passwordInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
            placeholder="Senha"
            placeholderTextColor={colors.placeholder}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
          />
          <Pressable 
            style={styles.eyeIcon}
            onPress={() => setShowPassword(!showPassword)}
          >
            <Ionicons name={showPassword ? "eye-off" : "eye"} size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.passwordContainer}>
          <TextInput
            style={[styles.passwordInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
            placeholder="Confirmar senha"
            placeholderTextColor={colors.placeholder}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showConfirmPassword}
          />
          <Pressable 
            style={styles.eyeIcon}
            onPress={() => setShowConfirmPassword(!showConfirmPassword)}
          >
            <Ionicons name={showConfirmPassword ? "eye-off" : "eye"} size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        <Pressable
          style={[styles.consentRow, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => setConsentCreditSimulation((prev) => !prev)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: consentCreditSimulation }}
        >
          <Ionicons
            name={consentCreditSimulation ? 'checkbox' : 'square-outline'}
            size={22}
            color={consentCreditSimulation ? colors.accent : colors.textSecondary}
          />
          <Text style={[styles.consentText, { color: colors.textSecondary }]}>
            Ao me cadastrar, autorizo o acesso aos meus dados para finalidade de simulação de crédito.{' '}
            <Text style={[styles.consentRequired, { color: colors.error }]}>*</Text>
          </Text>
        </Pressable>

        <Pressable
          style={[styles.button, { backgroundColor: colors.primary, opacity: loading ? 0.7 : 1 }]}
          onPress={handleRegister}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={[styles.buttonText, { color: colors.background }]}>Criar Conta</Text>
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
  passwordContainer: {
    position: 'relative',
    marginBottom: spacing.md,
  },
  passwordInput: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    paddingRight: 48,
    fontSize: 16,
  },
  eyeIcon: {
    position: 'absolute',
    right: spacing.md,
    top: '50%',
    transform: [{ translateY: -10 }],
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
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  consentText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  consentRequired: {
    fontWeight: '700',
  },
});

