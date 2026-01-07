import { View, Text, TextInput, StyleSheet, Pressable, ActivityIndicator, ImageBackground } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { borderRadius, spacing } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { AlertDialog } from '@/components';
import { useAlert } from '@/hooks/useAlert';
import { api } from '@/services/api';
import { maskCPF } from '@/utils/formatters';

const LoginBackground = require('../../assets/login-bg.png');

export default function ForgotPassword() {
  const router = useRouter();
  const { colors } = useTheme();
  const { alert, showAlert, showError, dismissAlert } = useAlert();
  const [email, setEmail] = useState('');
  const [cpf, setCpf] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleResetPassword = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !cpf || !newPassword || !confirmPassword) {
      showError('Erro', 'Preencha todos os campos');
      return;
    }

    // Validação básica de e-mail
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      showError('Erro', 'Por favor, informe um e-mail válido');
      return;
    }

    const cpfDigits = cpf.replace(/\D/g, '');
    if (cpfDigits.length !== 11) {
      showError('Erro', 'Informe um CPF válido');
      return;
    }

    if (newPassword.length < 6) {
      showError('Erro', 'A senha deve ter no mínimo 6 caracteres');
      return;
    }

    if (newPassword !== confirmPassword) {
      showError('Erro', 'As senhas não conferem');
      return;
    }

    setLoading(true);

    try {
      await api.post('/auth/reset-password-cpf', {
        email: trimmedEmail,
        cpf: cpfDigits,
        new_password: newPassword,
      });

      showAlert({
        title: 'Senha Atualizada!',
        message: 'Sua senha foi redefinida com sucesso. Faça login com a nova senha.',
        icon: 'checkmark-circle',
        iconColor: '#4CAF50',
        buttons: [
          {
            text: 'Ir para o Login',
            onPress: () => {
              dismissAlert();
              router.replace('/(auth)/login');
            },
            style: 'default',
          },
        ],
      });
    } catch (error: any) {
      console.error('[ForgotPassword] Error:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Erro ao redefinir a senha';
      showError('Erro', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <ImageBackground
        source={LoginBackground}
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        {/* Botão Voltar */}
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <View style={styles.backButtonCircle}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </View>
        </Pressable>

        <View style={styles.content}>
          <View style={styles.form}>
            {/* Título e Descrição */}
            <View style={styles.header}>
              <View style={styles.iconContainer}>
              <Ionicons name="lock-closed" size={48} color="#00D4FF" />
            </View>
            <Text style={styles.title}>Redefinir Senha</Text>
            <Text style={styles.description}>
              Informe seu e-mail e CPF cadastrados para criar uma nova senha.
            </Text>
          </View>

          {/* Campo de E-mail */}
          <TextInput
            style={[styles.input, { color: '#FFFFFF' }]}
            placeholder="Seu e-mail"
            placeholderTextColor="rgba(255, 255, 255, 0.6)"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!loading}
          />

          {/* Campo de CPF */}
          <TextInput
            style={[styles.input, { color: '#FFFFFF' }]}
            placeholder="CPF"
            placeholderTextColor="rgba(255, 255, 255, 0.6)"
            value={cpf}
            onChangeText={(text) => setCpf(maskCPF(text))}
            keyboardType="numeric"
            editable={!loading}
          />

          {/* Nova senha */}
          <TextInput
            style={[styles.input, { color: '#FFFFFF' }]}
            placeholder="Nova senha"
            placeholderTextColor="rgba(255, 255, 255, 0.6)"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            editable={!loading}
          />

          {/* Confirmar senha */}
          <TextInput
            style={[styles.input, { color: '#FFFFFF' }]}
            placeholder="Confirmar senha"
            placeholderTextColor="rgba(255, 255, 255, 0.6)"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            editable={!loading}
          />

          {/* Botão Enviar */}
          <Pressable
            style={[
              styles.button,
              {
                backgroundColor: colors.accent,
                opacity: loading ? 0.7 : 1,
              },
            ]}
            onPress={handleResetPassword}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#000000" />
            ) : (
              <>
                <Ionicons name="key-outline" size={20} color="#000000" />
                <Text style={[styles.buttonText, { color: '#000000' }]}>
                  Redefinir Senha
                </Text>
              </>
            )}
          </Pressable>

            {/* Dicas de Segurança */}
          <View style={styles.tipsContainer}>
            <Text style={styles.tipsTitle}>Dicas de Segurança:</Text>
            <View style={styles.tipItem}>
              <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
              <Text style={styles.tipText}>
                Use o mesmo e-mail e CPF do cadastro
              </Text>
            </View>
            <View style={styles.tipItem}>
              <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
              <Text style={styles.tipText}>
                A senha deve ter no mínimo 6 caracteres
              </Text>
            </View>
            <View style={styles.tipItem}>
              <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
              <Text style={styles.tipText}>
                Nunca compartilhe sua senha
              </Text>
            </View>
          </View>

            {/* Botão Voltar ao Login */}
            <Pressable
              style={styles.backToLoginButton}
              onPress={() => router.replace('/(auth)/login')}
            >
              <Ionicons name="arrow-back-circle-outline" size={18} color="#00D4FF" />
              <Text style={styles.backToLoginText}>Voltar ao Login</Text>
            </Pressable>
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
  backButton: {
    position: 'absolute',
    top: 50,
    left: spacing.lg,
    zIndex: 10,
  },
  backButtonCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: '10%',
  },
  form: {
    gap: spacing.lg,
  },
  header: {
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(0, 212, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(0, 212, 255, 0.3)',
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
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
  button: {
    flexDirection: 'row',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
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
  tipsContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  tipsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#00D4FF',
    marginBottom: spacing.xs,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  tipText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: 'rgba(255, 255, 255, 0.85)',
  },
  backToLoginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  backToLoginText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#00D4FF',
    textDecorationLine: 'underline',
  },
});
