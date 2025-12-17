import { useState, useCallback } from 'react';
import { AlertDialogButton } from '@/components/AlertDialog';

interface AlertConfig {
  title: string;
  message: string;
  buttons: AlertDialogButton[];
  icon?: string;
  iconColor?: string;
}

export function useAlert() {
  const [alert, setAlert] = useState<AlertConfig | null>(null);

  const showAlert = useCallback(
    (config: AlertConfig) => {
      setAlert(config);
    },
    []
  );

  const showError = useCallback(
    (title: string, message: string, onDismiss?: () => void) => {
      setAlert({
        title,
        message,
        icon: 'alert-circle',
        iconColor: '#E53E3E',
        buttons: [
          {
            text: 'OK',
            onPress: onDismiss,
            style: 'default',
          },
        ],
      });
    },
    []
  );

  const showSuccess = useCallback(
    (title: string, message: string, onDismiss?: () => void) => {
      setAlert({
        title,
        message,
        icon: 'checkmark-circle',
        iconColor: '#4CAF50',
        buttons: [
          {
            text: 'OK',
            onPress: onDismiss,
            style: 'default',
          },
        ],
      });
    },
    []
  );

  const showConfirm = useCallback(
    (
      title: string,
      message: string,
      onConfirm: () => void | Promise<void>,
      onCancel?: () => void,
      confirmText: string = 'CONFIRMAR',
      cancelText: string = 'CANCELAR'
    ) => {
      setAlert({
        title,
        message,
        icon: 'help-circle',
        buttons: [
          {
            text: cancelText,
            onPress: onCancel,
            style: 'cancel',
          },
          {
            text: confirmText,
            onPress: onConfirm,
            style: 'default',
          },
        ],
      });
    },
    []
  );

  const showDestructive = useCallback(
    (
      title: string,
      message: string,
      onConfirm: () => void | Promise<void>,
      onCancel?: () => void,
      confirmText: string = 'CONFIRMAR',
      cancelText: string = 'CANCELAR'
    ) => {
      setAlert({
        title,
        message,
        icon: 'warning',
        iconColor: '#FFC107',
        buttons: [
          {
            text: cancelText,
            onPress: onCancel,
            style: 'cancel',
          },
          {
            text: confirmText,
            onPress: onConfirm,
            style: 'destructive',
          },
        ],
      });
    },
    []
  );

  const dismissAlert = useCallback(() => {
    setAlert(null);
  }, []);

  return {
    alert,
    showAlert,
    showError,
    showSuccess,
    showConfirm,
    showDestructive,
    dismissAlert,
  };
}
