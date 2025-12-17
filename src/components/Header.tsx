import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  showBackButton?: boolean;
  showAvatar?: boolean;
  onBackPress?: () => void;
}

export default function Header({
  title,
  subtitle,
  showBackButton = false,
  showAvatar = true,
  onBackPress,
}: HeaderProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useAuth();

  const userName = user?.name || 'Usuário';
  const userInitial = userName.charAt(0).toUpperCase();

  const handleBack = () => {
    if (onBackPress) {
      onBackPress();
    } else {
      router.back();
    }
  };

  const handleProfile = () => {
    router.push('/(tabs)/perfil');
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        {showBackButton ? (
          <Pressable onPress={handleBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
        ) : (
          <View style={styles.backButtonPlaceholder} />
        )}

        {title ? (
          <View style={styles.titleContainer}>
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            {subtitle && <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>}
          </View>
        ) : (
          <View style={styles.greetingContainer}>
            <Text style={[styles.greeting, { color: colors.text }]}>Olá, {userName}!</Text>
            <Text style={[styles.name, { color: colors.textSecondary }]}>Bem-vindo de volta</Text>
          </View>
        )}

        {showAvatar ? (
          <Pressable onPress={handleProfile} style={styles.avatarButton}>
            <View style={[styles.avatar, { backgroundColor: colors.card }]}>
              <Text style={[styles.avatarText, { color: colors.text }]}>{userInitial}</Text>
            </View>
          </Pressable>
        ) : (
          <View style={styles.backButtonPlaceholder} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    // backgroundColor applied dynamically
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonPlaceholder: {
    width: 40,
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    // color applied dynamically
  },
  subtitle: {
    fontSize: 14,
    marginTop: 2,
    // color applied dynamically
  },
  greetingContainer: {
    flex: 1,
  },
  greeting: {
    fontSize: 24,
    // color applied dynamically
  },
  name: {
    fontSize: 16,
    marginTop: 4,
    // color applied dynamically
  },
  avatarButton: {
    width: 40,
    height: 40,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    // backgroundColor applied dynamically
  },
  avatarText: {
    fontSize: 18,
    // color applied dynamically
  },
});

