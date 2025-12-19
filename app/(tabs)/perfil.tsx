import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { borderRadius, spacing } from '@/constants/theme';
import { Header, MobileNav, AlertDialog } from '@/components';
import { useAuth } from '@/hooks/useAuth';
import { useAlert } from '@/hooks/useAlert';
import { api } from '@/services/api';
import { useEffect, useState } from 'react';
import { clearCredentials } from '@/utils/credentials';

export default function Perfil() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user, logout } = useAuth();
  const { alert, showDestructive, dismissAlert } = useAlert();
  const [stats, setStats] = useState({ simulations: 0, activeContracts: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, [user]);

  const loadStats = async () => {
    try {
      setLoading(true);
      const simulationsRes = await api.get('/mobile/simulations').catch(() => ({ data: [] }));

      const allSimulations = simulationsRes.data || [];
      const simulations = allSimulations.length;
      
      // Contratos ativos são simulações aprovadas/efetivadas
      const activeContracts = allSimulations.filter((c: any) =>
        [
          'approved', 
          'disbursed', 
          'active', 
          'finance_approved', 
          'contracted', 
          'integrated', 
          'paid', 
          'signed',
          'contrato_efetivado',
          'simulacao_aprovada',
          'approved_by_client',
          'aprovada_pelo_cliente',
          'cliente_aprovada'
        ].includes(c.status)
      ).length;

      setStats({ simulations, activeContracts });
    } catch (error) {
      console.log('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    router.push('/(tabs)/dashboard');
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  const handleDeleteAccount = () => {
    showDestructive(
      'Excluir Conta',
      'Ao confirmar, seus dados de acesso serão removidos deste dispositivo e você retornará para a tela de login. Seus dados no sistema web não serão removidos.',
      async () => {
        try {
          await clearCredentials();
          await logout();
          router.replace({
            pathname: '/(auth)/login',
            params: { accountDeleted: '1' },
          });
        } catch {
          router.replace('/(auth)/login');
        }
      }
    );
  };

  const getAvatarLetter = () => {
    return user?.name?.charAt(0).toUpperCase() || 'U';
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Header title="Perfil" showBackButton onBackPress={handleBack} showAvatar={false} />

      <ScrollView 
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 80 + insets.bottom }}
      >
        <View style={[styles.profileCard, { backgroundColor: colors.card }]}>
          <View style={[styles.avatar, { backgroundColor: colors.cardSecondary, borderColor: colors.accent }]}>
            <Text style={[styles.avatarText, { color: colors.text }]}>{getAvatarLetter()}</Text>
          </View>
          <Text style={[styles.userName, { color: colors.text }]}>{user?.name || 'Usuário'}</Text>
          <Text style={[styles.userEmail, { color: colors.textSecondary }]}>{user?.email || ''}</Text>

          <View style={[styles.statsContainer, { borderTopColor: colors.border }]}>
            <View style={styles.statItem}>
              {loading ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <>
                  <Text style={[styles.statValue, { color: colors.accent }]}>{stats.simulations}</Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Simulações</Text>
                </>
              )}
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statItem}>
              {loading ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <>
                  <Text style={[styles.statValue, { color: colors.accent }]}>{stats.activeContracts}</Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Contratos Ativos</Text>
                </>
              )}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Conta</Text>

          <Pressable
            style={[styles.menuItem, { backgroundColor: colors.card }]}
            onPress={() => router.push('/screens/dados-pessoais')}
          >
            <Ionicons name="person-outline" size={24} color={colors.text} />
            <View style={styles.menuContent}>
              <Text style={[styles.menuText, { color: colors.text }]}>Dados Pessoais</Text>
              <Text style={[styles.menuSubtext, { color: colors.textSecondary }]}>CPF, WhatsApp, Email</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </Pressable>

          <Pressable
            style={[styles.menuItem, { backgroundColor: colors.card }]}
            onPress={() => router.push('/screens/meus-documentos')}
          >
            <Ionicons name="document-text-outline" size={24} color={colors.text} />
            <View style={styles.menuContent}>
              <Text style={[styles.menuText, { color: colors.text }]}>Meus Documentos</Text>
              <Text style={[styles.menuSubtext, { color: colors.textSecondary }]}>Contracheques, comprovantes</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </Pressable>

          <Pressable
            style={[styles.menuItem, { backgroundColor: colors.card }]}
            onPress={() => router.push('/(tabs)/notificacoes')}
          >
            <Ionicons name="notifications-outline" size={24} color={colors.text} />
            <View style={styles.menuContent}>
              <Text style={[styles.menuText, { color: colors.text }]}>Notificações</Text>
              <Text style={[styles.menuSubtext, { color: colors.textSecondary }]}>Gerencie suas preferências</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </Pressable>

          <Pressable
            style={[styles.menuItem, { backgroundColor: colors.card }]}
            onPress={() => router.push('/screens/contratos-mobile')}
          >
            <Ionicons name="briefcase-outline" size={24} color={colors.text} />
            <View style={styles.menuContent}>
              <Text style={[styles.menuText, { color: colors.text }]}>Contratos Mobile (Financeiro)</Text>
              <Text style={[styles.menuSubtext, { color: colors.textSecondary }]}>Fila financeira mobile</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </Pressable>

          <Pressable 
            style={[styles.menuItem, { backgroundColor: colors.card }]}
            onPress={() => router.push('/screens/seguranca-privacidade')}
          >
            <Ionicons name="shield-checkmark-outline" size={24} color={colors.text} />
            <View style={styles.menuContent}>
              <Text style={[styles.menuText, { color: colors.text }]}>Segurança e Privacidade</Text>
              <Text style={[styles.menuSubtext, { color: colors.textSecondary }]}>Senha, autenticação</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Suporte</Text>

          <Pressable 
            style={[styles.menuItem, { backgroundColor: colors.card }]}
            onPress={() => router.push('/screens/ajuda-suporte')}
          >
            <Ionicons name="help-circle-outline" size={24} color={colors.text} />
            <View style={styles.menuContent}>
              <Text style={[styles.menuText, { color: colors.text }]}>Ajuda e Suporte</Text>
              <Text style={[styles.menuSubtext, { color: colors.textSecondary }]}>Central de ajuda, contato</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </Pressable>

          <Pressable
            style={[styles.menuItem, { backgroundColor: colors.card }]}
            onPress={() => router.push('/screens/politicas')}
          >
            <Ionicons name="document-text-outline" size={24} color={colors.text} />
            <View style={styles.menuContent}>
              <Text style={[styles.menuText, { color: colors.text }]}>Políticas e Termos</Text>
              <Text style={[styles.menuSubtext, { color: colors.textSecondary }]}>
                Privacidade, Termos de Uso e Exclusão
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </Pressable>
        </View>

        <Text style={[styles.version, { color: colors.textSecondary }]}>Versão 1.0.0</Text>

        <Pressable
          style={[styles.logoutButton, { backgroundColor: colors.card, borderColor: colors.error }]}
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={24} color={colors.error} />
          <Text style={[styles.logoutText, { color: colors.error }]}>Sair da Conta</Text>
        </Pressable>

        <Pressable
          style={[styles.deleteButton, { backgroundColor: colors.error + '10', borderColor: colors.error }]}
          onPress={handleDeleteAccount}
        >
          <Ionicons name="trash-outline" size={24} color={colors.error} />
          <Text style={[styles.deleteText, { color: colors.error }]}>Excluir Conta</Text>
        </Pressable>
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
  profileCard: {
    margin: spacing.md,
    padding: spacing.xl,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
    borderWidth: 2,
  },
  avatarText: {
    fontSize: 36,
  },
  userName: {
    fontSize: 24,
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    marginBottom: spacing.md,
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    width: '100%',
    justifyContent: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
  },
  statDivider: {
    width: 1,
    height: 40,
    marginHorizontal: spacing.md,
  },
  section: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 14,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  menuContent: {
    flex: 1,
  },
  menuText: {
    fontSize: 16,
    marginBottom: 2,
  },
  menuSubtext: {
    fontSize: 12,
  },
  version: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    gap: spacing.sm,
  },
  logoutText: {
    fontSize: 16,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.xl,
    borderWidth: 1,
    gap: spacing.sm,
  },
  deleteText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
