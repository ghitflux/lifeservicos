import { View, StyleSheet, Pressable, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { borderRadius } from '@/constants/theme';

export default function ThemeToggle() {
  const { theme, toggleTheme, colors } = useTheme();
  const isDark = theme === 'dark';
  const translateX = useRef(new Animated.Value(isDark ? 0 : 24)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: isDark ? 0 : 24,
        useNativeDriver: true,
        tension: 100,
        friction: 8,
      }),
      Animated.sequence([
        Animated.spring(scale, {
          toValue: 0.8,
          useNativeDriver: true,
          tension: 200,
          friction: 3,
        }),
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          tension: 200,
          friction: 3,
        }),
      ]),
    ]).start();
  }, [isDark, translateX, scale]);

  const handlePress = () => {
    toggleTheme();
  };

  return (
    <Pressable
      style={[
        styles.container,
        {
          backgroundColor: isDark ? colors.backgroundSecondary : colors.cardSecondary,
        },
      ]}
      onPress={handlePress}
    >
      <Animated.View
        style={[
          styles.toggle,
          {
            transform: [{ translateX }, { scale }],
            backgroundColor: isDark ? colors.card : colors.background,
          },
        ]}
      >
        <Ionicons
          name={isDark ? 'moon' : 'sunny'}
          size={20}
          color={isDark ? colors.accent : '#FFC107'}
        />
      </Animated.View>
      <View style={styles.iconsContainer}>
        <Ionicons
          name="sunny"
          size={16}
          color={!isDark ? '#FFC107' : colors.textTertiary}
          style={styles.icon}
        />
        <Ionicons
          name="moon"
          size={16}
          color={isDark ? colors.accent : colors.textTertiary}
          style={styles.icon}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 56,
    height: 32,
    borderRadius: 16,
    padding: 2,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  toggle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  iconsContainer: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  icon: {
    zIndex: 0,
  },
});

