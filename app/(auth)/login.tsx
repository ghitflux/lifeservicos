import { View, Text, TextInput, StyleSheet, Pressable, ActivityIndicator, ImageBackground, Dimensions } from 'react-native';
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
        resizeMode="cover"
      >
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

        <Pressable
          style={({ pressed }) => [
            styles.createAccountButton,
            {
              opacity: pressed ? 0.85 : 1,
            },
          ]}
          onPress={() => router.push('/(auth)/register')}
        >
          <Ionicons name="person-add-outline" size={15} color="#FFFFFF" />
          <Text style={styles.createAccountText}>Criar conta</Text>
        </Pressable>
        <Text style={styles.createAccountHint}>
          Ainda não tem conta? Crie uma agora para solicitar sua simulação.
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
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '80%',
  },
  content: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingBottom: '15%',
  },
  form: {
    gap: spacing.md,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderColor: 'rgba(255, 255, 255, 0.35)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
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
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderColor: 'rgba(255, 255, 255, 0.35)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
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
  createAccountButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm + spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderColor: 'rgba(255, 255, 255, 0.35)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  createAccountText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  createAccountHint: {
    marginTop: spacing.sm,
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 15,
    color: 'rgba(255, 255, 255, 0.85)',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});

