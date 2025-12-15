import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Configurar como as notificações devem ser exibidas
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export interface PushNotificationToken {
  token: string;
  deviceId: string;
}

/**
 * Registra o dispositivo para receber push notifications
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  let token: string | null = null;

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Permissão de notificação negada');
      return null;
    }

    try {
      // Obter o projectId do app.json
      const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.expoConfig?.projectId;

      if (!projectId) {
        console.warn('⚠️ Push notifications: ProjectId não configurado. Push notifications remotas não funcionarão.');
        console.warn('💡 Notificações locais e in-app continuam funcionando normalmente.');
        return null;
      }

      token = (
        await Notifications.getExpoPushTokenAsync({
          projectId,
        })
      ).data;

      console.log('✅ Push token obtido com sucesso:', token);
    } catch (error: any) {
      if (error?.message?.includes('projectId')) {
        console.warn('⚠️ Push notifications: Erro ao obter token - ProjectId inválido ou não configurado');
        console.warn('💡 Para habilitar push notifications, configure o projectId no app.config.js');
      } else {
        console.error('❌ Erro ao obter push token:', error);
      }
    }

    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }
  } else {
    console.log('Push notifications só funcionam em dispositivos físicos');
  }

  return token;
}

/**
 * Configura listeners para notificações
 */
export function setupNotificationListeners(
  onNotificationReceived?: (notification: Notifications.Notification) => void,
  onNotificationResponse?: (response: Notifications.NotificationResponse) => void
) {
  // Listener para quando recebe uma notificação enquanto o app está aberto
  const notificationListener = Notifications.addNotificationReceivedListener(
    (notification) => {
      console.log('Notificação recebida:', notification);
      onNotificationReceived?.(notification);
    }
  );

  // Listener para quando o usuário interage com a notificação
  const responseListener = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      console.log('Usuário interagiu com notificação:', response);
      onNotificationResponse?.(response);
    }
  );

  return {
    notificationListener,
    responseListener,
    remove: () => {
      notificationListener?.remove?.();
      responseListener?.remove?.();
    },
  };
}

/**
 * Envia uma notificação local (para testes)
 */
export async function sendLocalNotification(
  title: string,
  body: string,
  data?: any
) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: true,
    },
    trigger: null, // null significa enviar imediatamente
  });
}
