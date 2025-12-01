import { useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
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
      // TODO: Implementar endpoint no backend para salvar o push token
      // await api.post('/mobile/push-token', { token });
      console.log('Push token que seria salvo:', token);
    } catch (error) {
      console.error('Erro ao salvar push token:', error);
    }
  };

  return {
    expoPushToken,
    notification,
  };
}
