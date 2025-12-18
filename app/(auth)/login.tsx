import { View, Text, TextInput, StyleSheet, Pressable, ActivityIndicator, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { typography, borderRadius, spacing } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { AlertDialog } from '@/components';
import { useAuth } from '@/hooks/useAuth';
import { useAlert } from '@/hooks/useAlert';

const LifeAppLogo = require('../../assets/lifeapp.png');

export default function Login() {
  const router = useRouter();
  const params = useLocalSearchParams<{ accountDeleted?: string }>();
  const { colors } = useTheme();
  const { login } = useAuth();
  const { alert, showError, showSuccess, dismissAlert } = useAlert();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [accountDeletedShown, setAccountDeletedShown] = useState(false);

  useEffect(() => {
    if (accountDeletedShown) return;
    if (!params?.accountDeleted) return;

    showSuccess('Conta excluída', 'Sua conta foi excluída com sucesso.');
    setAccountDeletedShown(true);
  }, [accountDeletedShown, params?.accountDeleted, showSuccess]);

  const handleLogin = async () => {
    if (!email || !password) {
      showError('Erro', 'Por favor, preencha todos os campos');
      return;
    }

    setLoading(true);
    const result = await login(email, password);
    setLoading(false);

    if (result.success) {
      router.replace('/(tabs)/dashboard');
    } else {
      showError('Erro', result.error || 'Erro ao fazer login');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.iconContainer}>
        <Image source={LifeAppLogo} style={styles.logo} resizeMode="contain" />
      </View>
      
      <Text style={[styles.title, { color: colors.text }]}>Bem-vindo de volta</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Entre com sua conta para continuar</Text>

      <View style={styles.form}>
        <Text style={[styles.label, { color: colors.text }]}>Email</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
          placeholder="seu@email.com"
          placeholderTextColor={colors.placeholder}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={[styles.label, { color: colors.text }]}>Senha</Text>
        <View style={styles.passwordContainer}>
          <TextInput
            style={[styles.passwordInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
            placeholder="••••••••"
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

        <Pressable
          style={[styles.button, { backgroundColor: colors.primary, opacity: loading ? 0.7 : 1 }]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={[styles.buttonText, { color: colors.background }]}>Entrar</Text>
          )}
        </Pressable>

        <Pressable onPress={() => router.push('/(auth)/register')}>
          <Text style={[styles.link, { color: colors.accent }]}>Não tem conta? Criar conta</Text>
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
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logo: {
    width: 112,
    height: 112,
    borderRadius: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  form: {
    gap: spacing.md,
  },
  label: {
    fontSize: 14,
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 16,
  },
  passwordContainer: {
    position: 'relative',
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
    fontSize: 16,
  },
  link: {
    textAlign: 'center',
    marginTop: spacing.sm,
    fontSize: 14,
  },
});

