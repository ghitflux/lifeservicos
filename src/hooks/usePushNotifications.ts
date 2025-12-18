import { useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  registerForPushNotificationsAsync,
  setupNotificationListeners,
} from '@/services/pushNotifications';
import { api } from '@/services/api';

export function usePushNotifications() {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const notificationListener = useRef<any>();
  const responseListener = useRef<any>();
  const router = useRouter();

  useEffect(() => {
    // Registrar para push notifications
    registerForPushNotificationsAsync()
      .then((token) => {
        setExpoPushToken(token);
        // TODO: Enviar token para o backend para armazenar
        if (token) {
          savePushToken(token);
        }
      })
      .catch((error) => {
        console.error('Erro ao registrar push notifications:', error);
      });

    // Configurar listeners
    const listeners = setupNotificationListeners(
      (receivedNotification) => {
        setNotification(receivedNotification);
      },
      (response) => {
        // Quando o usuário clica na notificação
        const data = response.notification.request.content.data;

        // Navegar para a tela apropriada baseado no tipo de notificação
        if (data?.simulationId) {
          router.push({
            pathname: '/screens/detalhes-simulacao',
            params: { id: data.simulationId },
          });
        } else if (data?.type === 'simulation') {
          router.push('/(tabs)/simulacoes');
        } else {
          router.push('/(tabs)/notificacoes');
        }
      }
    );

    notificationListener.current = listeners.notificationListener;
    responseListener.current = listeners.responseListener;

    return () => {
      listeners.remove();
    };
  }, []);

  const savePushToken = async (token: string) => {
    try {
      // Persistir para tentar sincronizar após login (primeiro acesso pode dar 401)
      await SecureStore.setItemAsync('expoPushToken', token);

      await api.post('/mobile/push-token', {
        token,
        platform: Platform.OS,
      });
      console.log('Push token salvo:', token);
    } catch (error) {
      // Pode falhar antes do login (401). Mantém token salvo para sincronizar depois.
      console.warn('Não foi possível salvar push token agora (será sincronizado após login).');
    }
  };

  return {
    expoPushToken,
    notification,
  };
}
