import React, { createContext, useContext, ReactNode } from 'react';
import { ThemeMode, getColors, darkColors } from '@/constants/theme';

interface ThemeContextType {
  theme: ThemeMode;
  colors: ReturnType<typeof getColors>;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Always use dark theme
  const theme: ThemeMode = 'dark';
  const colors = darkColors;

  // Dummy functions to maintain compatibility
  const toggleTheme = () => {
    // Do nothing - theme is always dark
  };

  const setTheme = (_newTheme: ThemeMode) => {
    // Do nothing - theme is always dark
  };

  return (
    <ThemeContext.Provider value={{ theme, colors, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

