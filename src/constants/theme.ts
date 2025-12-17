// Theme Colors
export const darkColors = {
  // Near-black palette (requested #121212)
  primary: '#1A1A1A',
  secondary: '#121212',
  success: '#4CAF50',
  warning: '#FFC107',
  error: '#E53E3E',

  // Gradient/background colors - near black
  backgroundGradientStart: '#0B0B0B',
  backgroundGradientEnd: '#121212',
  
  // Dark theme backgrounds
  background: '#0B0B0B',
  backgroundSecondary: '#0E0E0E',
  card: '#121212',
  cardSecondary: '#161616',

  // Dark theme text
  text: '#FFFFFF',
  textSecondary: '#B0B0B0',
  textTertiary: '#9CA3AF',

  // Dark theme borders and dividers
  border: '#242424',
  divider: '#1E1E1E',
  placeholder: '#9CA3AF',

  // Accent colors (keep subtle/near-black)
  accent: '#1F1F1F',
  accentLight: '#2A2A2A',
};

export const lightColors = {
  primary: '#3B0951',
  secondary: '#5856D6',
  success: '#4CAF50',
  warning: '#FFC107',
  error: '#E53E3E',

  // Light theme backgrounds
  background: '#FFFFFF',
  backgroundSecondary: '#F9FAFB',
  card: '#FFFFFF',
  cardSecondary: '#F9FAFB',

  // Light theme text
  text: '#111827',
  textSecondary: '#4B5563',
  textTertiary: '#6B7280',

  // Light theme borders and dividers
  border: '#D1D5DB',
  divider: '#E5E7EB',
  placeholder: '#9CA3AF',

  // Accent colors
  accent: '#3B0951',
  accentLight: '#8B4FD9',
};

export type ThemeMode = "light" | "dark";

export const getColors = (mode: ThemeMode) => {
  return mode === "dark" ? darkColors : lightColors;
};

// Default export for backward compatibility (dark mode)
export const colors = darkColors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

export const typography = {
  h1: {
    fontSize: 32,
    fontWeight: "bold" as const,
  },
  h2: {
    fontSize: 24,
    fontWeight: "bold" as const,
  },
  h3: {
    fontSize: 20,
    fontWeight: "600" as const,
  },
  body: {
    fontSize: 16,
    fontWeight: "normal" as const,
  },
  caption: {
    fontSize: 14,
    fontWeight: "normal" as const,
  },
  small: {
    fontSize: 12,
    fontWeight: "normal" as const,
  },
};
