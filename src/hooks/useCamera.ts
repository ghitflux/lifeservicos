import { useState } from 'react';
import { Camera, CameraType } from 'expo-camera';
import { Alert } from 'react-native';

export function useCamera() {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  const requestPermission = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    setHasPermission(status === 'granted');
    return status === 'granted';
  };

  const takePicture = async (cameraRef: any) => {
    if (!cameraRef.current) {
      Alert.alert('Erro', 'Câmera não disponível');
      return null;
    }

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });
      return photo;
    } catch (error) {
      console.error('Error taking picture:', error);
      Alert.alert('Erro', 'Não foi possível tirar a foto');
      return null;
    }
  };

  return {
    hasPermission,
    requestPermission,
    takePicture,
  };
}
