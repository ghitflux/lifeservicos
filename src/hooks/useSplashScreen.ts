import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { useTheme } from '@/contexts/ThemeContext';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore if splash screen isn't available
});

export function useSplashScreen() {
  const { loading } = useTheme();

  useEffect(() => {
    const hideSplash = async () => {
      if (!loading) {
        try {
          await SplashScreen.hideAsync();
        } catch (error) {
          console.log('Error hiding splash screen:', error);
        }
      }
    };

    hideSplash();
  }, [loading]);

  return { isReady: !loading };
}
