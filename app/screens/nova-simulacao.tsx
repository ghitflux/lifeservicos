import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Image, Pressable } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Header, MobileNav, AlertDialog } from '@/components';
import { useTheme } from '@/contexts/ThemeContext';
import { borderRadius, spacing } from '@/constants/theme';
import { api } from '@/services/api';
import { useAlert } from '@/hooks/useAlert';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

export default function NovaSimulacao() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { alert, showError, showSuccess, dismissAlert } = useAlert();
  const [loading, setLoading] = useState(false);
  const [document, setDocument] = useState<any>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [clientType, setClientType] = useState<'new_client' | 'existing_client' | null>(null);

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setDocument(result.assets[0]);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      showError('Erro', 'Erro ao selecionar imagem');
    }
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();

      if (status !== 'granted') {
        showError('Permissão Negada', 'Precisamos de permissão para acessar a câmera');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setDocument(result.assets[0]);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      showError('Erro', 'Erro ao tirar foto');
    }
  };

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
      });

      if (result.type === 'success') {
        setDocument(result);
      }
    } catch (error) {
      console.error('Error picking document:', error);
      showError('Erro', 'Erro ao selecionar documento');
    }
  };

  const handleUpload = async () => {
    if (!document) {
      showError('Erro', 'Selecione um documento antes de enviar');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();

      const fileExtension = document.uri.split('.').pop()?.toLowerCase() || 'jpg';
      const mimeType = fileExtension === 'pdf' ? 'application/pdf' : `image/${fileExtension}`;

      formData.append('document', {
        uri: document.uri,
        type: mimeType,
        name: document.name || `contracheque.${fileExtension}`,
      } as any);

      formData.append('simulation_type', 'document_upload');

      const response = await api.post('/mobile/simulations/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      // Usa resposta da API para sinalizar prazo correto (novo contrato x recontratação)
      const serverClientType = (response.data as any)?.client_type;
      const hasActiveContract = Boolean((response.data as any)?.has_active_contract);
      if (hasActiveContract || serverClientType === 'existing_client') {
        setClientType('existing_client');
      } else {
        setClientType('new_client');
      }

      setUploadSuccess(true);

    } catch (error: any) {
      console.error('Upload error:', error);
      showError('Erro', error.response?.data?.detail || 'Erro ao enviar documento');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToSimulations = () => {
    router.push('/(tabs)/simulacoes');
  };

  if (uploadSuccess) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <Header title="Simulação Enviada" showBackButton={false} />

        <ScrollView
          style={styles.content}
          contentContainerStyle={[styles.successContainer, { paddingBottom: 80 + insets.bottom }]}
        >
          <Ionicons name="checkmark-circle" size={120} color={colors.success || '#22c55e'} />

          <Text style={[styles.successTitle, { color: colors.text }]}>
            Documento Enviado com Sucesso!
          </Text>

          <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
            {clientType === 'new_client' ? (
              <>
                <Ionicons name="time-outline" size={48} color={colors.accent} style={{ marginBottom: spacing.md }} />
                <Text style={[styles.infoTitle, { color: colors.text }]}>
                  Processo em Análise
                </Text>
                <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                  Seu contracheque está sendo analisado por nossa equipe para um novo contrato.
                </Text>
                <Text style={[styles.infoHighlight, { color: colors.accent }]}>
                  Retorno em até 24h úteis
                </Text>
                <Text style={[styles.infoSubtext, { color: colors.textTertiary }]}>
                  Você receberá uma notificação assim que a análise for concluída.
                </Text>
              </>
            ) : (
              <>
                <Ionicons name="calendar-outline" size={48} color={colors.accent} style={{ marginBottom: spacing.md }} />
                <Text style={[styles.infoTitle, { color: colors.text }]}>
                  Análise em Andamento
                </Text>
                <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                  Estamos analisando sua recontratação.
                </Text>
                <Text style={[styles.infoHighlight, { color: colors.accent }]}>
                  Retorno em até 7 dias úteis
                </Text>
                <Text style={[styles.infoSubtext, { color: colors.textTertiary }]}>
                  Você receberá uma notificação com o resultado da análise.
                </Text>
              </>
            )}
            <Text style={[styles.infoNote, { color: colors.textSecondary }]}>
              Novos contratos: até 24h úteis. Recontratações: até 7 dias úteis.
            </Text>
          </View>

          <Button
            title="Voltar para Simulações"
            onPress={handleBackToSimulations}
            style={{ marginTop: spacing.xl }}
          />
        </ScrollView>

        <MobileNav />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Header title="Nova Simulação" showBackButton />

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 80 + insets.bottom }}
      >
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.iconContainer}>
            <Ionicons name="document-attach" size={64} color={colors.accent} />
          </View>

          <Text style={[styles.cardTitle, { color: colors.text }]}>
            Envie seu Contracheque
          </Text>

          <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
            Envie apenas o contracheque para iniciar sua simulação. Outros documentos serão solicitados somente após a aprovação da análise.
          </Text>

          {document ? (
            <View style={[styles.documentPreview, { backgroundColor: colors.background }]}>
              {document.uri && (document.mimeType?.startsWith('image') || document.uri.match(/\.(jpg|jpeg|png)$/i)) ? (
                <Image source={{ uri: document.uri }} style={styles.previewImage} />
              ) : (
                <View style={styles.pdfPreview}>
                  <Ionicons name="document-text" size={48} color={colors.accent} />
                  <Text style={[styles.pdfText, { color: colors.text }]}>PDF Selecionado</Text>
                </View>
              )}
              <Pressable
                style={[styles.removeButton, { backgroundColor: colors.error || '#ef4444' }]}
                onPress={() => setDocument(null)}
              >
                <Ionicons name="close" size={20} color="#fff" />
              </Pressable>
            </View>
          ) : (
            <View style={styles.uploadOptions}>
              <Pressable
                style={[styles.uploadOption, { backgroundColor: colors.background }]}
                onPress={handleTakePhoto}
              >
                <Ionicons name="camera" size={32} color={colors.accent} />
                <Text style={[styles.uploadOptionText, { color: colors.text }]}>
                  Tirar Foto
                </Text>
              </Pressable>

              <Pressable
                style={[styles.uploadOption, { backgroundColor: colors.background }]}
                onPress={handlePickImage}
              >
                <Ionicons name="image" size={32} color={colors.accent} />
                <Text style={[styles.uploadOptionText, { color: colors.text }]}>
                  Galeria
                </Text>
              </Pressable>

              <Pressable
                style={[styles.uploadOption, { backgroundColor: colors.background }]}
                onPress={handlePickDocument}
              >
                <Ionicons name="document" size={32} color={colors.accent} />
                <Text style={[styles.uploadOptionText, { color: colors.text }]}>
                  Arquivo PDF
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.buttonContainer}>
          <Button
            title={loading ? "Enviando..." : "Enviar Contracheque"}
            onPress={handleUpload}
            disabled={loading || !document}
          />
        </View>

        <View style={[styles.infoBox, { backgroundColor: colors.card }]}>
          <Ionicons name="information-circle" size={24} color={colors.accent} />
          <Text style={[styles.infoBoxText, { color: colors.textSecondary }]}>
            Formatos aceitos: JPG, PNG, PDF. Certifique-se de que o contracheque está legível. Outros documentos serão pedidos depois da análise, se necessário.
          </Text>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  card: {
    margin: spacing.lg,
    padding: spacing.xl,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: spacing.lg,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  cardDescription: {
    fontSize: 14,
    marginBottom: spacing.xl,
    textAlign: 'center',
    lineHeight: 20,
  },
  uploadOptions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  uploadOption: {
    flex: 1,
    padding: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    gap: spacing.sm,
  },
  uploadOptionText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  documentPreview: {
    width: '100%',
    height: 300,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  pdfPreview: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pdfText: {
    fontSize: 16,
    fontWeight: '600',
  },
  removeButton: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonContainer: {
    padding: spacing.lg,
  },
  infoBox: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  infoBoxText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  successContainer: {
    flex: 1,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  infoCard: {
    width: '100%',
    padding: spacing.xl,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  infoTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  infoText: {
    fontSize: 14,
    marginBottom: spacing.md,
    textAlign: 'center',
    lineHeight: 20,
  },
  infoHighlight: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  infoSubtext: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  infoNote: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: spacing.md,
  },
});
