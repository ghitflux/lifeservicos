import { View, Text, TextInput, StyleSheet, Pressable, ActivityIndicator, ImageBackground } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { typography, borderRadius, spacing } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { AlertDialog } from '@/components';
import { useAuth } from '@/hooks/useAuth';
import { useAlert } from '@/hooks/useAlert';
import { loadCredentials } from '@/utils/credentials';

const LoginBackground = require('../../assets/login-bg.png');

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

  useEffect(() => {
    let mounted = true;
    const loadSaved = async () => {
      const saved = await loadCredentials();
      if (!saved || !mounted) return;
      setEmail((prev) => prev || saved.email);
      setPassword((prev) => prev || saved.password);
    };
    loadSaved();
    return () => {
      mounted = false;
    };
  }, []);

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
    <View style={styles.container}>
      <ImageBackground
        source={LoginBackground}
        style={styles.backgroundImage}
        resizeMode="contain"
      >
      <View pointerEvents="none" style={styles.backdrop} />
      <View style={styles.content}>
        <View style={styles.form}>
        <TextInput
          style={[styles.input, { color: '#FFFFFF' }]}
          placeholder="E-mail"
          placeholderTextColor="rgba(255, 255, 255, 0.6)"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <View style={styles.passwordContainer}>
          <TextInput
            style={[styles.passwordInput, { color: '#FFFFFF' }]}
            placeholder="Senha"
            placeholderTextColor="rgba(255, 255, 255, 0.6)"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
          />
          <Pressable
            style={styles.eyeIconButton}
            onPress={() => setShowPassword(!showPassword)}
          >
            <View style={styles.eyeIconCircle}>
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={20}
                color="#00D4FF"
              />
            </View>
          </Pressable>
        </View>

        <Pressable
          style={[styles.button, { backgroundColor: colors.accent, opacity: loading ? 0.7 : 1 }]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#000000" />
          ) : (
            <Text style={[styles.buttonText, { color: '#000000' }]}>Entrar</Text>
          )}
        </Pressable>

        {/* Seção de Criar Conta - Melhorada */}
        <View style={styles.createAccountSection}>
          <Text style={styles.dividerText}>OU</Text>

          <Pressable
            style={({ pressed }) => [
              styles.createAccountButton,
              {
                opacity: pressed ? 0.85 : 1,
              },
            ]}
            onPress={() => router.push('/(auth)/register')}
          >
            <View style={styles.createAccountIconContainer}>
              <Ionicons name="person-add" size={22} color="#00D4FF" />
            </View>
            <View style={styles.createAccountTextContainer}>
              <Text style={styles.createAccountTitle}>Criar Nova Conta</Text>
              <Text style={styles.createAccountSubtitle}>Rápido e sem burocracia</Text>
            </View>
            <Ionicons name="arrow-forward" size={20} color="#00D4FF" />
          </Pressable>

          <Text style={styles.createAccountHint}>
            Ainda não tem conta? Cadastre-se gratuitamente e{'\n'}solicite sua simulação com as melhores condições!
          </Text>
        </View>

        {/* Link Esqueceu a senha */}
        <Pressable
          style={styles.forgotPasswordButton}
          onPress={() => router.push('/(auth)/forgot-password')}
        >
          <Text style={styles.forgotPasswordText}>Esqueceu a senha?</Text>
        </Pressable>

        <Text style={styles.footerNote}>
          Não somos um banco, trabalhamos em prol do Servidor Público
        </Text>
        </View>
      </View>

      </ImageBackground>
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
    backgroundColor: '#0a0a0a',
  },
  backgroundImage: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7, 12, 22, 0.55)',
  },
  content: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingBottom: '8%',
  },
  form: {
    gap: spacing.md,
    backgroundColor: 'rgba(10, 16, 28, 0.7)',
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 15,
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  passwordContainer: {
    position: 'relative',
  },
  passwordInput: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    paddingRight: 56,
    fontSize: 15,
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  eyeIconButton: {
    position: 'absolute',
    right: spacing.sm,
    top: '50%',
    transform: [{ translateY: -20 }],
  },
  eyeIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 212, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 255, 0.3)',
  },
  button: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.sm,
    shadowColor: '#00D4FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  forgotPasswordButton: {
    alignSelf: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.sm,
  },
  forgotPasswordText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#00D4FF',
    textDecorationLine: 'underline',
  },
  createAccountSection: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  dividerText: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.7)',
    letterSpacing: 1,
  },
  createAccountButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(0, 212, 255, 0.15)',
    borderWidth: 2,
    borderColor: 'rgba(0, 212, 255, 0.4)',
    shadowColor: '#00D4FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  createAccountIconContainer: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: 'rgba(0, 212, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 255, 0.3)',
  },
  createAccountTextContainer: {
    flex: 1,
  },
  createAccountTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  createAccountSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  createAccountHint: {
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 17,
    color: 'rgba(255, 255, 255, 0.85)',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  footerNote: {
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 17,
    color: 'rgba(255, 255, 255, 0.75)',
    marginTop: spacing.xs,
  },
});
