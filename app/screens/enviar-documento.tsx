import { View, Text, StyleSheet, ScrollView, Pressable, Image, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Header, MobileNav, AlertDialog } from '@/components';
import { useDocumentPicker } from '@/hooks/useDocumentPicker';
import { useTheme } from '@/contexts/ThemeContext';
import { borderRadius, spacing } from '@/constants/theme';
import * as ImagePicker from 'expo-image-picker';
import { api } from '@/services/api';
import { useAlert } from '@/hooks/useAlert';
import * as SecureStore from 'expo-secure-store';

const toSecureStoreKeyPart = (value: string) => String(value || '').trim().replace(/[^A-Za-z0-9._-]/g, '_');
const pendingReuploadKey = (simulationId: string) => `pendingReupload_v1_${toSecureStoreKeyPart(simulationId)}`;

export default function EnviarDocumento() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { alert, showError, showSuccess, dismissAlert } = useAlert();
  const [selectedFiles, setSelectedFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const { pickDocument } = useDocumentPicker();

  // Parse pending documents from params
  const [pendingDocs, setPendingDocs] = useState<Array<{ type: string; description?: string }>>([]);
  const [analystNotes, setAnalystNotes] = useState('');
  const [simulationId, setSimulationId] = useState('');
  const isPendingContext = pendingDocs.length > 0 || !!analystNotes.trim();

  useEffect(() => {
    if (params.pendingDocs && typeof params.pendingDocs === 'string') {
      try {
        const docs = JSON.parse(params.pendingDocs);
        setPendingDocs(docs);
      } catch (e) {
        console.error('Error parsing pending docs:', e);
      }
    }
    if (params.analystNotes) {
      setAnalystNotes(String(params.analystNotes));
    }
    if (params.simulationId) {
      setSimulationId(String(params.simulationId).trim());
    }
  }, [params]);

  const handlePickDocument = async () => {
    const file = await pickDocument();
    if (file) {
      setSelectedFiles([...selectedFiles, file]);
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
      setSelectedFiles([...selectedFiles, result.assets[0]]);
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(selectedFiles.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      showError('Erro', 'Selecione pelo menos um documento');
      return;
    }

    setLoading(true);

    try {
      const isPendingReuploadContext = !!simulationId && (pendingDocs.length > 0 || !!analystNotes.trim());
      let successCount = 0;
      let failCount = 0;
      let lastErrorMessage: string | null = null;

      for (const selectedFile of selectedFiles) {
        if (!selectedFile.uri && !selectedFile.fileCopyUri) {
          failCount++;
          lastErrorMessage = 'Arquivo inválido (sem URI)';
          continue;
        }

        try {
          const formData = new FormData();
          const filename = selectedFile.name || selectedFile.fileName || `document_${Date.now()}.jpg`;

          formData.append('document', {
            uri: selectedFile.uri || selectedFile.fileCopyUri,
            name: filename,
            type: selectedFile.mimeType || selectedFile.type || 'application/octet-stream',
          } as any);

          formData.append('simulation_type', 'document_upload');
          if (!isPendingContext) {
            formData.append('document_type', 'Contracheque');
          }
          if (simulationId) {
            formData.append('simulation_id', simulationId);
          }

          const uploadOnce = async () =>
            api.post('/mobile/simulations/upload', formData, {
              headers: { 'Content-Type': 'multipart/form-data' },
              timeout: 20000,
            });

          try {
            await uploadOnce();
            successCount++;
          } catch (error: any) {
            const isNetworkError = error?.code === 'ERR_NETWORK' || error?.message === 'Network Error';
            if (isNetworkError) {
              await new Promise((resolve) => setTimeout(resolve, 1000));
              await uploadOnce();
              successCount++;
            } else {
              throw error;
            }
          }
        } catch (error) {
          console.error('[Upload] Error uploading file:', error);
          const status = (error as any)?.response?.status;
          const detail =
            (error as any)?.response?.data?.detail
            || (typeof (error as any)?.response?.data === 'string' ? (error as any)?.response?.data : null)
            || (error as any)?.message
            || 'Erro ao enviar documento';
          lastErrorMessage = status ? `HTTP ${status}: ${String(detail)}` : String(detail);
          failCount++;
        }
      }

      if (successCount > 0) {
        if (isPendingReuploadContext) {
          const safeId = toSecureStoreKeyPart(simulationId);
          const signature = JSON.stringify({
            analystNotes: analystNotes.trim(),
            pendingDocs: [...pendingDocs]
              .map((d) => ({
                type: String(d?.type || '').trim(),
                description: String(d?.description || '').trim(),
              }))
              .sort((a, b) => (a.type + a.description).localeCompare(b.type + b.description)),
          });
          if (safeId) {
            await SecureStore.setItemAsync(
              pendingReuploadKey(safeId),
              JSON.stringify({ sentAt: new Date().toISOString(), signature })
            );
          }

          setSelectedFiles([]);
          router.replace({
            pathname: '/screens/detalhes-simulacao',
            params: { id: simulationId, pendingReupload: '1' },
          });
          return;
        }

        const message =
          failCount > 0
            ? `${successCount} documento(s) enviado(s) com sucesso. ${failCount} falhou(aram).`
            : `${successCount} documento(s) enviado(s) com sucesso!`;
        showSuccess('Sucesso', message);
        setSelectedFiles([]);
      } else {
        showError(
          'Erro',
          lastErrorMessage
            ? `Não foi possível enviar nenhum documento. ${lastErrorMessage}`
            : 'Não foi possível enviar nenhum documento'
        );
      }
    } catch (error: any) {
      console.error('[Upload] Error:', error);
      const errorMessage = String(error.response?.data?.detail || error.message || 'Erro ao enviar documentos');
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
        <View style={styles.actionGroup}>
          <Pressable
            style={[styles.actionButton, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={handleTakePhoto}
          >
            <View style={[styles.actionIcon, { backgroundColor: colors.accent + '15' }]}>
              <Ionicons name="camera-outline" size={24} color={colors.accent} />
            </View>
            <Text style={[styles.actionTitle, { color: colors.text }]}>Tirar foto</Text>
            <Text style={[styles.actionSubtitle, { color: colors.textSecondary }]}>Abrir câmera</Text>
          </Pressable>

          <Pressable
            style={[styles.actionButton, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={handlePickDocument}
          >
            <View style={[styles.actionIcon, { backgroundColor: colors.accent + '15' }]}>
              <Ionicons name="document-text-outline" size={24} color={colors.accent} />
            </View>
            <Text style={[styles.actionTitle, { color: colors.text }]}>Anexar arquivo</Text>
            <Text style={[styles.actionSubtitle, { color: colors.textSecondary }]}>PDF ou imagem</Text>
          </Pressable>
        </View>

        {!isPendingContext && (
          <View style={[styles.infoToast, { backgroundColor: colors.cardSecondary, borderColor: colors.accent + '40' }]}>
            <Ionicons name="information-circle-outline" size={18} color={colors.accent} />
            <Text style={[styles.infoToastText, { color: colors.textSecondary }]}>
              Envie o contracheque mais recente. Foto ou PDF.
            </Text>
          </View>
        )}

        {/* Seção de Pendências do Analista */}
        {(analystNotes || pendingDocs.length > 0) && (
          <View style={[styles.pendencyCard, { backgroundColor: colors.cardSecondary, borderColor: colors.warning + '50' }]}>
            <View style={styles.pendencyHeader}>
              <View style={[styles.pendencyIcon, { backgroundColor: colors.warning + '20' }]}>
                <Ionicons name="alert-circle" size={24} color={colors.warning} />
              </View>
              <Text style={[styles.pendencyTitle, { color: colors.text }]}>Documentos Pendentes</Text>
            </View>

            {analystNotes && (
              <View style={styles.analystNotesSection}>
                <Text style={[styles.analystNotesLabel, { color: colors.textSecondary }]}>
                  Mensagem do Analista:
                </Text>
                <Text style={[styles.analystNotesText, { color: colors.text }]}>
                  {analystNotes}
                </Text>
              </View>
            )}

            {pendingDocs.length > 0 && (
              <View style={styles.pendingDocsList}>
                <Text style={[styles.pendingDocsLabel, { color: colors.textSecondary }]}>
                  Documentos Solicitados:
                </Text>
                {pendingDocs.map((doc, index) => (
                  <View key={index} style={[styles.pendingDocItem, { backgroundColor: colors.background }]}>
                    <Ionicons name="document-text-outline" size={18} color={colors.accent} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pendingDocType, { color: colors.text }]}>
                        {doc.type}
                      </Text>
                      {doc.description && (
                        <Text style={[styles.pendingDocDescription, { color: colors.textSecondary }]}>
                          {doc.description}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {selectedFiles.length > 0 && (
          <View style={[styles.previewCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
            <Text style={[styles.previewTitle, { color: colors.text }]}>
              {selectedFiles.length} documento(s) selecionado(s)
            </Text>
            {selectedFiles.map((file, index) => (
              <View key={index} style={styles.fileItem}>
                {file.uri && file.mimeType?.startsWith('image/') && (
                  <Image source={{ uri: file.uri }} style={styles.previewImageSmall} />
                )}
                <View style={styles.fileInfo}>
                  <Ionicons name="document-text-outline" size={24} color={colors.textSecondary} />
                  <View style={styles.fileDetails}>
                    <Text style={[styles.fileName, { color: colors.text }]}>
                      {file.name || `Arquivo ${index + 1}`}
                    </Text>
                    <Text style={[styles.fileSize, { color: colors.textSecondary }]}>
                      {file.size ? `${(file.size / 1024).toFixed(2)} KB` : ''}
                    </Text>
                  </View>
                  <Pressable
                    style={[styles.removeButton, { backgroundColor: colors.error + '15' }]}
                    onPress={() => handleRemoveFile(index)}
                  >
                    <Ionicons name="close" size={20} color={colors.error} />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {selectedFiles.length > 0 && (
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
                <ActivityIndicator color={colors.background} />
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={24} color={colors.background} />
                  <Text style={[styles.sendPhotoButtonText, { color: colors.background }]}>
                    Enviar {selectedFiles.length > 1 ? `${selectedFiles.length} documentos` : 'documento'}
                  </Text>
                </>
              )}
            </Pressable>
            <Text style={[styles.helperText, { color: colors.textSecondary }]}>
              {selectedFiles.length > 1
                ? 'Todos os arquivos serão enviados simultaneamente.'
                : 'Confirmaremos o recebimento por aqui.'}
            </Text>
          </View>
        )}
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
  actionGroup: {
    flexDirection: 'row',
    gap: spacing.md,
    margin: spacing.md,
  },
  actionButton: {
    flex: 1,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    gap: spacing.xs,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  actionSubtitle: {
    fontSize: 12,
  },
  infoToast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  infoToastText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
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
  pendencyCard: {
    margin: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    gap: spacing.md,
  },
  pendencyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pendencyIcon: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendencyTitle: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },
  analystNotesSection: {
    gap: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  analystNotesLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  analystNotesText: {
    fontSize: 14,
    lineHeight: 20,
  },
  pendingDocsList: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  pendingDocsLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  pendingDocItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  pendingDocType: {
    fontSize: 14,
    fontWeight: '600',
  },
  pendingDocDescription: {
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },
  fileItem: {
    marginBottom: spacing.md,
  },
  previewImageSmall: {
    width: '100%',
    height: 120,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.sm,
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
