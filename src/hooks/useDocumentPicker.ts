import * as DocumentPicker from 'expo-document-picker';
import { Alert } from 'react-native';

export function useDocumentPicker() {
  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        return result.assets[0];
      }

      return null;
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert('Erro', 'Não foi possível selecionar o documento');
      return null;
    }
  };

  return {
    pickDocument,
  };
}
