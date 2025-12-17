import { View, ViewProps } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';

interface SafeScreenContainerProps extends ViewProps {
  children: React.ReactNode;
  safeArea?: boolean;
  edges?: Array<'top' | 'bottom' | 'left' | 'right'>;
}

/**
 * SafeScreenContainer - Componente wrapper para garantir sincronização
 * de cores de fundo entre SafeAreaView e ScrollView
 *
 * Propósito: Evitar faixas brancas e piscadas durante transições
 */
export function SafeScreenContainer({
  children,
  safeArea = true,
  edges = ['top'],
  style,
  ...props
}: SafeScreenContainerProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const backgroundColor = { backgroundColor: colors.background };

  if (!safeArea) {
    return (
      <View
        style={[
          {
            flex: 1,
            backgroundColor: colors.background,
          },
          style,
        ]}
        {...props}
      >
        {children}
      </View>
    );
  }

  return (
    <SafeAreaView
      style={[
        {
          flex: 1,
          ...backgroundColor,
        },
        style,
      ]}
      edges={edges}
      {...props}
    >
      {children}
    </SafeAreaView>
  );
}
