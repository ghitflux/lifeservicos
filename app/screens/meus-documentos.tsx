import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header, MobileNav, AlertDialog } from '@/components';
import { useTheme } from '@/contexts/ThemeContext';
import { borderRadius, spacing } from '@/constants/theme';
import { api } from '@/services/api';
import { formatDateSafe } from '@/utils/formatters';
import { mapSimulationStatus } from '@/utils/status';
import { useAlert } from '@/hooks/useAlert';

interface Document {
  id: string;
  document_type: string;
  document_filename: string;
  status: string;
  created_at: string;
  document_url?: string;
}

export default function MeusDocumentos() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { alert, showError, dismissAlert } = useAlert();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const response = await api.get('/mobile/documents');
      const docs = response.data || [];
      setDocuments(docs);
      setInfoMessage(null);
    } catch (error: any) {
      console.error('Error fetching documents:', error);
      setInfoMessage('Não foi possível carregar seus anexos. Tente novamente ou envie pelo módulo web.');
      setDocuments([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchDocuments();
  }, []);

  const getStatusText = (status: string) => {
    return mapSimulationStatus(status).label;
  };

  const getStatusColor = (status: string) => {
    const tone = mapSimulationStatus(status).tone;
    if (tone === 'success') return colors.success || '#22c55e';
    if (tone === 'warning') return colors.warning || '#f59e0b';
    if (tone === 'error') return colors.error || '#ef4444';
    return colors.accent;
  };

  const handleDownload = async (doc: Document) => {
    const base = api.defaults.baseURL?.replace(/\/$/, '') || '';
    const url = `${base}/mobile/documents/${doc.id}`;
    try {
      await Linking.openURL(url);
    } catch (_e) {
      showError('Erro', 'Não foi possível abrir o documento');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <Header title="Meus Documentos" showBackButton />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Carregando documentos...</Text>
        </View>
        <MobileNav />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Header title="Meus Documentos" showBackButton />

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 80 + insets.bottom }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        <Pressable
          style={[styles.uploadButton, { backgroundColor: colors.card }]}
          onPress={() => router.push('/screens/enviar-documento')}
        >
          <Ionicons name="cloud-upload" size={32} color={colors.accent} />
          <Text style={[styles.uploadText, { color: colors.accent }]}>Enviar Novo Documento</Text>
        </Pressable>

        {documents.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={64} color={colors.textTertiary} />
            <Text style={[styles.emptyText, { color: colors.text }]}>Nenhum documento enviado</Text>
            <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
              Envie seus documentos para agilizar o processo
            </Text>
            {infoMessage && (
              <Text style={[styles.emptySubtext, { color: colors.textSecondary, marginTop: spacing.sm }]}>
                {infoMessage}
              </Text>
            )}
          </View>
        ) : (
          documents.map((doc) => (
            <Pressable key={doc.id} style={[styles.documentCard, { backgroundColor: colors.card }]} onPress={() => handleDownload(doc)}>
              <Ionicons name="document" size={24} color={colors.accent} />
              <View style={styles.documentInfo}>
                <Text style={[styles.documentName, { color: colors.text }]}>
                  {doc.document_type || 'Documento'} - {doc.document_filename}
                </Text>
                <Text style={[styles.documentStatus, { color: getStatusColor(doc.status) }]}>
                  {getStatusText(doc.status)}
                </Text>
                <Text style={[styles.documentDate, { color: colors.textTertiary }]}>
                  {formatDateSafe(doc.created_at)}
                </Text>
              </View>
              <Ionicons name="download" size={20} color={colors.accent} />
            </Pressable>
          ))
        )}
      </ScrollView>
      
      <MobileNav />

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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontSize: 14,
  },
  uploadButton: {
    margin: spacing.lg,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  uploadText: {
    fontSize: 16,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: spacing.md,
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  documentCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  documentInfo: {
    flex: 1,
  },
  documentName: {
    fontSize: 16,
    fontWeight: '600',
  },
  documentStatus: {
    fontSize: 14,
    marginTop: 2,
    fontWeight: '600',
  },
  documentDate: {
    fontSize: 12,
    marginTop: 2,
  },
});
