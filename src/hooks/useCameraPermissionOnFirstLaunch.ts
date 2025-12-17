import { useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Camera } from 'expo-camera';

const CAMERA_PERMISSION_REQUESTED_KEY = 'cameraPermissionRequested_v1';

export function useCameraPermissionOnFirstLaunch() {
  useEffect(() => {
    let canceled = false;

    (async () => {
      try {
        const alreadyRequested = await SecureStore.getItemAsync(CAMERA_PERMISSION_REQUESTED_KEY);
        if (canceled || alreadyRequested) return;

        await Camera.requestCameraPermissionsAsync();
        if (canceled) return;
        await SecureStore.setItemAsync(CAMERA_PERMISSION_REQUESTED_KEY, '1');
      } catch (error) {
        // Silencioso: se falhar, o app ainda deve funcionar; a permissão será solicitada quando necessário.
        console.warn('[CameraPermission] Failed to request camera permission:', error);
      }
    })();

    return () => {
      canceled = true;
    };
  }, []);
}
