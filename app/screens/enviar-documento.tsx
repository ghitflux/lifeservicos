import { View, Text, StyleSheet, ScrollView, Pressable, Image, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header, MobileNav, AlertDialog } from '@/components';
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
  const [documentType, setDocumentType] = useState('Contracheque');
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

    if (!selectedFile.uri && !selectedFile.fileCopyUri) {
      showError('Erro', 'Não foi possível ler o arquivo selecionado');
      return;
    }

    setLoading(true);

    const formData = new FormData();
    const filename = selectedFile.name || selectedFile.fileName || `document_${Date.now()}.jpg`;

    formData.append('document', {
      uri: selectedFile.uri || selectedFile.fileCopyUri,
      name: filename,
      type: selectedFile.mimeType || selectedFile.type || 'application/octet-stream',
    } as any);

    formData.append('simulation_type', 'document_upload');
    if (documentType) {
      formData.append('document_type', documentType);
    }

    const uploadOnce = async () =>
      api.post('/mobile/simulations/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 20000,
      });

    const handleSuccess = (response: any) => {
      const data = response?.data || {};
      let message = data?.message || 'Documento enviado com sucesso!';
      const clientType = data?.client_type;
      const hasActiveContract = Boolean(data?.has_active_contract);

      if (String(documentType || '').toLowerCase() === 'contracheque') {
        if (clientType === 'new_client' && !hasActiveContract) {
          message = `${message}\n\nRetorno em até 24h úteis.`;
        } else if (clientType === 'existing_client' || hasActiveContract) {
          message = `${message}\n\nRetorno em até 7 dias úteis.`;
        }
      }

      showSuccess('Sucesso', message);
      setSelectedFile(null);
      setDocumentType('Contracheque');
    };

    try {
      try {
        const response = await uploadOnce();
        handleSuccess(response);
      } catch (error: any) {
        const isNetworkError = error?.code === 'ERR_NETWORK' || error?.message === 'Network Error';
        if (isNetworkError) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const response = await uploadOnce();
          handleSuccess(response);
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
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { backgroundColor: colors.cardSecondary, borderColor: colors.accent + '60' }]}>
          <View style={styles.heroHeader}>
            <View style={[styles.heroIcon, { backgroundColor: colors.accent + '20' }]}> 
              <Ionicons name="document-attach" size={26} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.heroTitle, { color: colors.text }]}>Envie seu contracheque</Text>
              <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
                Envie foto ou anexo do seu contracheque para prosseguirmos com sua simulação.
              </Text>
            </View>
          </View>

          <View style={styles.slaChips}>
            <View style={[styles.slaChip, { borderColor: colors.accent + '50' }]}>
              <Ionicons name="time-outline" size={16} color={colors.accent} />
              <View>
                <Text style={[styles.slaLabel, { color: colors.text }]}>Novo contrato</Text>
                <Text style={[styles.slaValue, { color: colors.accent }]}>Retorno em até 24h úteis</Text>
              </View>
            </View>
            <View style={[styles.slaChip, { borderColor: colors.accent + '50' }]}>
              <Ionicons name="refresh-outline" size={16} color={colors.accent} />
              <View>
                <Text style={[styles.slaLabel, { color: colors.text }]}>Recontratação</Text>
                <Text style={[styles.slaValue, { color: colors.accent }]}>Retorno em até 7 dias úteis</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={[styles.stepsCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.stepsTitle, { color: colors.text }]}>Como enviar</Text>
          <View style={styles.stepItem}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text style={[styles.stepText, { color: colors.textSecondary }]}>Escolha foto ou PDF do contracheque.</Text>
          </View>
          <View style={styles.stepItem}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text style={[styles.stepText, { color: colors.textSecondary }]}>Garanta que os dados estejam legíveis.</Text>
          </View>
          <View style={styles.stepItem}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text style={[styles.stepText, { color: colors.textSecondary }]}>Selecione o tipo e envie para agilizar.</Text>
          </View>
        </View>

        <View style={[styles.typeSelector, { backgroundColor: colors.card, borderColor: colors.border + '60' }]}>
          <Text style={[styles.typeLabel, { color: colors.text }]}>Tipo de Documento (opcional)</Text>
          <View style={styles.typeButtons}>
            {['Contracheque', 'RG', 'CPF', 'CNH', 'Comprovante'].map((type) => (
              <Pressable
                key={type}
                style={[
                  styles.typeButton,
                  { backgroundColor: documentType === type ? colors.accent : colors.background, borderColor: colors.border },
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
          <Text style={[styles.helperText, { color: colors.textSecondary }]}>
            Priorize o contracheque mais recente para acelerar sua análise.
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
            <Text style={[styles.previewTitle, { color: colors.text }]}>Documento selecionado</Text>
            {selectedFile.uri && selectedFile.mimeType?.startsWith('image/') && (
              <Image source={{ uri: selectedFile.uri }} style={styles.previewImage} />
            )}
            <View style={styles.fileInfo}>
              <Ionicons name="document-text" size={24} color={colors.textSecondary} />
              <View style={styles.fileDetails}>
                <Text style={[styles.fileName, { color: colors.text }]}>{selectedFile.name || 'Arquivo'}</Text>
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
                <Text style={[styles.retakeButtonText, { color: colors.accent }]}>Trocar arquivo</Text>
              </Pressable>
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
                  opacity: loading ? 0.7 : 1,
                },
              ]}
              onPress={handleUpload}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <>
                  <Ionicons name="cloud-upload" size={24} color={colors.text} />
                  <Text style={[styles.sendPhotoButtonText, { color: colors.text }]}>
                    Enviar documento
                  </Text>
                </>
              )}
            </Pressable>
            <Text style={[styles.helperText, { color: colors.textSecondary }]}>
              Confirmaremos o recebimento por aqui.
            </Text>
          </View>
        )}

        <View style={[styles.documentsCard, { backgroundColor: colors.card }]}> 
          <Text style={[styles.documentsTitle, { color: colors.text }]}>Documentos Aceitos</Text>
          <View style={styles.documentItem}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            <Text style={[styles.documentText, { color: colors.textSecondary }]}>Contracheque (preferencial)</Text>
          </View>
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
  hero: {
    margin: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    gap: spacing.md,
  },
  heroHeader: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  heroSubtitle: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
  },
  slaChips: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  slaChip: {
    flex: 1,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  slaLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  slaValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  stepsCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  stepsTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stepText: {
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
    textAlign: 'left',
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
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  typeLabel: {
    fontSize: 14,
    fontWeight: '600',
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
    borderWidth: 1,
  },
  typeButtonText: {
    fontSize: 13,
    fontWeight: '500',
  },
});
