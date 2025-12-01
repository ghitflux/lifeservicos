import { View, Text, StyleSheet, ScrollView, Pressable, Image, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Header, MobileNav, Input, AlertDialog } from '@/components';
import { useDocumentPicker } from '@/hooks/useDocumentPicker';
import { useTheme } from '@/contexts/ThemeContext';
import { borderRadius, spacing } from '@/constants/theme';
import * as ImagePicker from 'expo-image-picker';
import { api } from '@/services/api';
import { useAlert } from '@/hooks/useAlert';

export default function EnviarDocumento() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { alert, showError, showSuccess, dismissAlert } = useAlert();
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [documentType, setDocumentType] = useState('');
  const [loading, setLoading] = useState(false);
  const { pickDocument } = useDocumentPicker();

  const handlePickDocument = async () => {
    const file = await pickDocument();
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      showError('Permissão negada', 'Precisamos de acesso à câmera');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
      aspect: [4, 3],
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setSelectedFile(result.assets[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      showError('Erro', 'Selecione um documento primeiro');
      return;
    }

    if (!documentType) {
      showError('Erro', 'Selecione o tipo de documento');
      return;
    }

    if (!selectedFile.uri && !selectedFile.fileCopyUri) {
      showError('Erro', 'Não foi possível ler o arquivo selecionado');
      return;
    }

    setLoading(true);

    const formData = new FormData();
    const filename = selectedFile.name || selectedFile.fileName || `document_${Date.now()}.jpg`;

    formData.append('document', {
      // expo-image-picker usa uri, DocumentPicker usa fileCopyUri
      uri: selectedFile.uri || selectedFile.fileCopyUri,
      name: filename,
      type: selectedFile.mimeType || selectedFile.type || 'application/octet-stream',
    } as any);

    formData.append('simulation_type', 'document_upload');
    formData.append('document_type', documentType);

    const uploadOnce = async () => api.post('/mobile/simulations/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 20000,
    });

    try {
      try {
        const response = await uploadOnce();
        const message = response.data?.message || 'Documento enviado com sucesso!';
        showSuccess('Sucesso', message);
        setSelectedFile(null);
        setDocumentType('');
      } catch (error: any) {
        // Re-tenta automaticamente uma vez em caso de erro de rede inicial (cenário observado)
        const isNetworkError = error?.code === 'ERR_NETWORK' || error?.message === 'Network Error';
        if (isNetworkError) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const response = await uploadOnce();
          const message = response.data?.message || 'Documento enviado com sucesso!';
          showSuccess('Sucesso', message);
          setSelectedFile(null);
          setDocumentType('');
          return;
        }
        throw error;
      }
    } catch (error: any) {
      console.error('[Upload] Error:', error);
      const errorMessage = String(error.response?.data?.detail || error.message || 'Erro ao enviar documento');
      showError('Erro', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title="Enviar Documento" showBackButton />

      <ScrollView 
        style={styles.content} 
        contentContainerStyle={{ paddingBottom: 80 + insets.bottom }}
      >
        <View style={[styles.infoCard, { backgroundColor: colors.cardSecondary }]}>
          <Ionicons name="information-circle" size={24} color={colors.accent} />
          <Text style={[styles.infoText, { color: colors.text }]}>
            Envie fotos ou PDFs dos seus documentos
          </Text>
        </View>

        <View style={styles.buttonGroup}>
          <Pressable style={[styles.optionButton, { backgroundColor: colors.card }]} onPress={handleTakePhoto}>
            <Ionicons name="camera" size={48} color={colors.accent} />
            <Text style={[styles.optionText, { color: colors.accent }]}>Tirar Foto</Text>
          </Pressable>

          <Pressable style={[styles.optionButton, { backgroundColor: colors.card }]} onPress={handlePickDocument}>
            <Ionicons name="document" size={48} color={colors.accent} />
            <Text style={[styles.optionText, { color: colors.accent }]}>Escolher Arquivo</Text>
          </Pressable>
        </View>

        {selectedFile && (
          <View style={[styles.previewCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.previewTitle, { color: colors.text }]}>Foto Capturada</Text>
            {selectedFile.uri && selectedFile.mimeType?.startsWith('image/') && (
              <Image source={{ uri: selectedFile.uri }} style={styles.previewImage} />
            )}
            <View style={styles.fileInfo}>
              <Ionicons name="document-text" size={24} color={colors.textSecondary} />
              <View style={styles.fileDetails}>
                <Text style={[styles.fileName, { color: colors.text }]}>{selectedFile.name || 'Imagem'}</Text>
                <Text style={[styles.fileSize, { color: colors.textSecondary }]}>
                  {selectedFile.size ? `${(selectedFile.size / 1024).toFixed(2)} KB` : ''}
                </Text>
              </View>
            </View>

            <View style={styles.photoActionButtons}>
              <Pressable
                style={[styles.retakeButton, { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1 }]}
                onPress={() => setSelectedFile(null)}
              >
                <Ionicons name="refresh-outline" size={20} color={colors.accent} />
                <Text style={[styles.retakeButtonText, { color: colors.accent }]}>Tirar Outra Foto</Text>
              </Pressable>
            </View>

            <View style={styles.typeSelector}>
              <Text style={[styles.typeLabel, { color: colors.text }]}>Tipo de Documento *</Text>
              <View style={styles.typeButtons}>
                {['RG', 'CPF', 'CNH', 'Comprovante', 'Contracheque'].map((type) => (
                  <Pressable
                    key={type}
                    style={[
                      styles.typeButton,
                      { backgroundColor: documentType === type ? colors.accent : colors.background },
                    ]}
                    onPress={() => setDocumentType(type)}
                  >
                    <Text
                      style={[
                        styles.typeButtonText,
                        { color: documentType === type ? colors.text : colors.textSecondary },
                      ]}
                    >
                      {type}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        )}

        {selectedFile && (
          <View style={styles.uploadContainer}>
            <Pressable
              style={[
                styles.sendPhotoButton,
                {
                  backgroundColor: colors.accent,
                  opacity: documentType ? 1 : 0.6
                }
              ]}
              onPress={handleUpload}
              disabled={!documentType || loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <>
                  <Ionicons name="cloud-upload" size={24} color={colors.text} />
                  <Text style={[styles.sendPhotoButtonText, { color: colors.text }]}>
                    Enviar Foto
                  </Text>
                </>
              )}
            </Pressable>
            <Text style={[styles.helperText, { color: colors.textSecondary }]}>
              Selecione o tipo de documento para continuar
            </Text>
          </View>
        )}

        <View style={[styles.documentsCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.documentsTitle, { color: colors.text }]}>Documentos Aceitos</Text>
          <View style={styles.documentItem}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            <Text style={[styles.documentText, { color: colors.textSecondary }]}>RG ou CNH</Text>
          </View>
          <View style={styles.documentItem}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            <Text style={[styles.documentText, { color: colors.textSecondary }]}>CPF</Text>
          </View>
          <View style={styles.documentItem}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            <Text style={[styles.documentText, { color: colors.textSecondary }]}>Comprovante de Residência</Text>
          </View>
          <View style={styles.documentItem}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            <Text style={[styles.documentText, { color: colors.textSecondary }]}>Contracheque</Text>
          </View>
        </View>
      </ScrollView>

      {alert && (
        <AlertDialog
          visible={!!alert}
          title={alert.title}
          message={alert.message}
          buttons={alert.buttons}
          icon={alert.icon as any}
          iconColor={alert.iconColor}
          onDismiss={dismissAlert}
        />
      )}

      <MobileNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  infoCard: {
    margin: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  infoText: {
    flex: 1,
    fontSize: 14,
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  optionButton: {
    flex: 1,
    padding: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    gap: spacing.sm,
  },
  optionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  previewCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: spacing.md,
  },
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.md,
  },
  fileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  fileDetails: {
    flex: 1,
  },
  fileName: {
    fontSize: 16,
    fontWeight: '600',
  },
  fileSize: {
    fontSize: 12,
    marginTop: 2,
  },
  photoActionButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginVertical: spacing.md,
  },
  retakeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  retakeButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  uploadContainer: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  sendPhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    gap: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  sendPhotoButtonText: {
    fontSize: 18,
    fontWeight: '700',
  },
  helperText: {
    fontSize: 12,
    textAlign: 'center',
  },
  documentsCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  documentsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: spacing.md,
  },
  documentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  documentText: {
    fontSize: 14,
  },
  typeSelector: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  typeLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  typeButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  typeButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  typeButtonText: {
    fontSize: 13,
    fontWeight: '500',
  },
});
