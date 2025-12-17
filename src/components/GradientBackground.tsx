import React, { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/contexts/ThemeContext';

interface GradientBackgroundProps {
  children: ReactNode;
}

export default function GradientBackground({ children }: GradientBackgroundProps) {
  const { colors } = useTheme();

  return (
    <LinearGradient
      colors={[colors.backgroundGradientStart || colors.background, colors.backgroundGradientEnd || colors.background]}
      style={styles.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
});
