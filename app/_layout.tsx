import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { useSplashScreen } from '@/hooks/useSplashScreen';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useCameraPermissionOnFirstLaunch } from '@/hooks/useCameraPermissionOnFirstLaunch';

const queryClient = new QueryClient();

function ThemedStatusBar() {
  const { theme } = useTheme();
  return <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />;
}

function RootLayoutContent() {
  const { theme } = useTheme();
  useSplashScreen(); // Handle splash screen hiding
  usePushNotifications(); // Initialize push notifications
  useCameraPermissionOnFirstLaunch(); // Ask camera permission on first app access

  return (
    <>
      <ThemedStatusBar />
      <Stack
        screenOptions={{
          headerShown: false,
          animationEnabled: true,
          // Smooth transitions
          cardStyle: { backgroundColor: theme === 'dark' ? '#1A1A2E' : '#FFFFFF' },
          cardStyleInterpolator: ({ current, layouts }) => {
            return {
              cardStyle: {
                opacity: current.progress,
              },
            };
          },
          transitionSpec: {
            open: {
              animation: 'timing',
              config: {
                duration: 400,
              },
            },
            close: {
              animation: 'timing',
              config: {
                duration: 400,
              },
            },
          },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <RootLayoutContent />
        </QueryClientProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
