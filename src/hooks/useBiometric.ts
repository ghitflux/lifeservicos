import * as LocalAuthentication from 'expo-local-authentication';
import { useState, useEffect } from 'react';

export function useBiometric() {
  const [isAvailable, setIsAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<string[]>([]);

  useEffect(() => {
    checkBiometricAvailability();
  }, []);

  const checkBiometricAvailability = async () => {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    setIsAvailable(compatible);

    if (compatible) {
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      const typeNames = types.map(type => {
        switch (type) {
          case LocalAuthentication.AuthenticationType.FINGERPRINT:
            return 'Impressão Digital';
          case LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION:
            return 'Reconhecimento Facial';
          case LocalAuthentication.AuthenticationType.IRIS:
            return 'Íris';
          default:
            return 'Biometria';
        }
      });
      setBiometricType(typeNames);
    }
  };

  const authenticate = async (promptMessage: string = 'Autentique-se') => {
    if (!isAvailable) {
      return { success: false, error: 'Biometria não disponível' };
    }

    const hasEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasEnrolled) {
      return { success: false, error: 'Nenhuma biometria cadastrada no dispositivo' };
    }

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage,
        cancelLabel: 'Cancelar',
        disableDeviceFallback: false,
      });

      if (result.success) {
        return { success: true, error: undefined };
      } else {
        return { success: false, error: 'Autenticação falhou' };
      }
    } catch (error) {
      return { success: false, error: 'Erro na autenticação' };
    }
  };

  return {
    isAvailable,
    biometricType,
    authenticate,
  };
}
