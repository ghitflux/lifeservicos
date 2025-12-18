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
  const [documentType, setDocumentType] = useState('Contracheque');
  const [loading, setLoading] = useState(false);
  const { pickDocument } = useDocumentPicker();

  // Parse pending documents from params
  const [pendingDocs, setPendingDocs] = useState<Array<{ type: string; description?: string }>>([]);
  const [analystNotes, setAnalystNotes] = useState('');
  const [simulationId, setSimulationId] = useState('');

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

      for (const selectedFile of selectedFiles) {
        if (!selectedFile.uri && !selectedFile.fileCopyUri) {
          failCount++;
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
          if (documentType) {
            formData.append('document_type', documentType);
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
          setDocumentType('Contracheque');
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
        setDocumentType('Contracheque');
      } else {
        showError('Erro', 'Não foi possível enviar nenhum documento');
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
                    <Ionicons name="document-text" size={18} color={colors.accent} />
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

        <View style={[styles.hero, { backgroundColor: colors.cardSecondary, borderColor: colors.accent + '60' }]}>
          <View style={styles.heroHeader}>
            <View style={[styles.heroIcon, { backgroundColor: colors.accent + '20' }]}>
              <Ionicons name="document-attach" size={26} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.heroTitle, { color: colors.text }]}>
                {pendingDocs.length > 0 ? 'Envie os documentos solicitados' : 'Envie seu contracheque'}
              </Text>
              <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
                {pendingDocs.length > 0
                  ? 'Você pode enviar múltiplos arquivos de uma vez.'
                  : 'Envie foto ou anexo do seu contracheque para prosseguirmos com sua simulação.'}
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

        <View style={[styles.stepsCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
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
                    { color: documentType === type ? colors.background : colors.textSecondary },
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
          <Pressable style={[styles.optionButton, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]} onPress={handleTakePhoto}>
            <Ionicons name="camera" size={48} color={colors.accent} />
            <Text style={[styles.optionText, { color: colors.accent }]}>Tirar Foto</Text>
          </Pressable>

          <Pressable style={[styles.optionButton, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]} onPress={handlePickDocument}>
            <Ionicons name="document" size={48} color={colors.accent} />
            <Text style={[styles.optionText, { color: colors.accent }]}>Escolher Arquivo</Text>
          </Pressable>
        </View>

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
                  <Ionicons name="document-text" size={24} color={colors.textSecondary} />
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
                  <Ionicons name="cloud-upload" size={24} color={colors.background} />
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

        <View style={[styles.documentsCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}> 
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
