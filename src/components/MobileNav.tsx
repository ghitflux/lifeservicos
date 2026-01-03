import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useNotificationsContext } from '@/contexts/NotificationsContext';
import { spacing } from '@/constants/theme';

interface NavItem {
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
}

const navItems: NavItem[] = [
  { name: 'Início', icon: 'home-outline', route: '/(tabs)/dashboard' },
  { name: 'Histórico', icon: 'time-outline', route: '/(tabs)/historico' },
  { name: 'Simular', icon: 'calculator-outline', route: '/screens/enviar-documento' },
  { name: 'Notificações', icon: 'notifications-outline', route: '/(tabs)/notificacoes' },
  { name: 'Perfil', icon: 'person-outline', route: '/(tabs)/perfil' },
];

export default function MobileNav() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { unreadCount } = useNotificationsContext();

  const isActive = (route: string) => {
    // Normalize routes for comparison
    const normalizedPathname = pathname || '';
    const normalizedRoute = route.replace('/(tabs)/', '');
    
    // Check if current path matches the route
    if (normalizedPathname.includes(normalizedRoute)) {
      return true;
    }
    
    // Special case for dashboard/home
    if (route === '/(tabs)/dashboard' && (normalizedPathname === '' || normalizedPathname === '/')) {
      return true;
    }
    
    return false;
  };

  const handleNavigate = (route: string) => {
    router.push(route as any);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 8) }]}>
      {navItems.map((item) => {
        const active = isActive(item.route);
        const showBadge = item.route === '/(tabs)/notificacoes' && unreadCount > 0;
        const badgeText = unreadCount > 99 ? '99+' : String(unreadCount);
        return (
          <Pressable
            key={item.name}
            style={styles.navItem}
            onPress={() => handleNavigate(item.route)}
          >
            {active && (
              <View style={[styles.activeIndicator, { backgroundColor: colors.accent }]} />
            )}
            <View style={styles.iconWrapper}>
              <Ionicons
                name={item.icon}
                size={24}
                color={active ? colors.accent : colors.textTertiary}
              />
              {showBadge && (
                <View style={[styles.badge, { backgroundColor: colors.error }]}>
                  <Text style={[styles.badgeText, { color: colors.background }]}>
                    {badgeText}
                  </Text>
                </View>
              )}
            </View>
            <Text
              style={[
                styles.navLabel,
                { color: active ? colors.accent : colors.textTertiary },
              ]}
            >
              {item.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 8,
    paddingHorizontal: spacing.xs,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    gap: 4,
    position: 'relative',
  },
  iconWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeIndicator: {
    position: 'absolute',
    top: -8,
    width: 32,
    height: 3,
    borderRadius: 2,
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -12,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  navLabel: {
    fontSize: 12,
  },
});

