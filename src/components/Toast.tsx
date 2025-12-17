import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { borderRadius, spacing } from '@/constants/theme';

type ToastTone = 'info' | 'success' | 'error';

export function Toast({
  visible,
  message,
  tone = 'info',
  durationMs = 3500,
  onHide,
  style,
}: {
  visible: boolean;
  message: string;
  tone?: ToastTone;
  durationMs?: number;
  onHide?: () => void;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-8)).current;

  const icon = useMemo(() => {
    if (tone === 'success') return 'checkmark-circle-outline';
    if (tone === 'error') return 'alert-circle-outline';
    return 'information-circle-outline';
  }, [tone]);

  const toneColor = useMemo(() => {
    if (tone === 'success') return colors.success || '#22c55e';
    if (tone === 'error') return colors.error || '#ef4444';
    return colors.accent;
  }, [colors.accent, colors.error, colors.success, tone]);

  useEffect(() => {
    if (!visible) return;

    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -8, duration: 180, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) onHide?.();
      });
    }, durationMs);

    return () => clearTimeout(timer);
  }, [durationMs, onHide, opacity, translateY, visible]);

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        { backgroundColor: colors.card, borderColor: colors.border, opacity, transform: [{ translateY }] },
        style,
      ]}
    >
      <Ionicons name={icon as any} size={18} color={toneColor} />
      <Text style={[styles.text, { color: colors.textSecondary }]}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    top: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  text: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
});

