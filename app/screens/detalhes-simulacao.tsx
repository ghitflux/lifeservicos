import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useEffect, useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { borderRadius, spacing } from '@/constants/theme';
import { Header, MobileNav, AlertDialog, Toast } from '@/components';
import { formatCurrency } from '@/utils/formatters';
import { api } from '@/services/api';
import { useAlert } from '@/hooks/useAlert';
import { mapSimulationStatus } from '@/utils/status';
import { useAuth } from '@/hooks/useAuth';
import * as SecureStore from 'expo-secure-store';

interface Simulation {
  id: string;
  simulation_type: string;
  requested_amount: number;
  installments: number;
  interest_rate: number;
  installment_value: number;
  total_amount: number;
  status: string;
  created_at: string;
  banks_json?: any[];
  prazo?: number;
  coeficiente?: string;
  seguro?: number;
  percentual_consultoria?: number;
  analysis_status?: string;
  pending_documents?: { type: string; description?: string }[];
  analyst_notes?: string;
  documents?: { id: string; document_type?: string; document_filename?: string; created_at?: string }[];
}

export default function DetalhesSimulacao() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; pendingReupload?: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { alert, showError, showSuccess, showConfirm, showDestructive, dismissAlert } = useAlert();
  const { user } = useAuth();
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingReuploadLocked, setPendingReuploadLocked] = useState(!!params?.pendingReupload);
  const [showReuploadToast, setShowReuploadToast] = useState(false);
  const [reuploadToastShown, setReuploadToastShown] = useState(false);
  const pendingDocs = useMemo(() => {
    const raw = Array.isArray((simulation as any)?.pending_documents)
      ? ((simulation as any)?.pending_documents as any[])
      : [];

    return raw
      .map((doc) => {
        if (!doc || typeof doc !== 'object') return null;
        const type = String((doc as any).type ?? (doc as any).tipo ?? '').trim();
        const description = String((doc as any).description ?? (doc as any).descricao ?? '').trim();
        if (!type && !description) return null;
        return { type: type || 'Documento solicitado', description: description || undefined };
      })
      .filter(Boolean) as Array<{ type: string; description?: string }>;
  }, [simulation]);

  const analystNotes = useMemo(() => {
    const raw =
      (simulation as any)?.analyst_notes
      ?? (simulation as any)?.analystNotes
      ?? (simulation as any)?.analyst_message;
    const value = typeof raw === 'string' ? raw.trim() : '';
    return value || '';
  }, [simulation]);

  const pendencySignature = useMemo(() => {
    return JSON.stringify({
      analystNotes: analystNotes.trim(),
      pendingDocs: [...pendingDocs]
        .map((d) => ({
          type: String(d?.type || '').trim(),
          description: String(d?.description || '').trim(),
        }))
        .sort((a, b) => (a.type + a.description).localeCompare(b.type + b.description)),
    });
  }, [analystNotes, pendingDocs]);
  const liberadoTotal = useMemo(() => {
    if (!simulation) return 0;
    const banks = Array.isArray(simulation.banks_json) ? simulation.banks_json : [];
    const totalFromBanks = banks.reduce((sum, bank) => sum + Number(bank?.valorLiberado || 0), 0);
    if (totalFromBanks > 0) return totalFromBanks;
    if (simulation.total_amount && simulation.total_amount > 0) return simulation.total_amount;
    return simulation.requested_amount || 0;
  }, [simulation]);

  useEffect(() => {
    fetchSimulation();
  }, []);

  useEffect(() => {
    if (reuploadToastShown) return;
    if (!params?.pendingReupload) return;
    setShowReuploadToast(true);
    setReuploadToastShown(true);
  }, [params?.pendingReupload, reuploadToastShown]);

  useEffect(() => {
    if (!simulation?.id) return;

    (async () => {
      const key = `pendingReupload:v1:${simulation.id}`;
      try {
        const raw = await SecureStore.getItemAsync(key);
        if (!raw) {
          setPendingReuploadLocked(false);
          return;
        }

        const parsed = JSON.parse(raw);
        const storedSignature = String(parsed?.signature || '');
        if (!storedSignature || storedSignature !== pendencySignature) {
          await SecureStore.deleteItemAsync(key);
          setPendingReuploadLocked(false);
          return;
        }

        setPendingReuploadLocked(true);
      } catch {
        setPendingReuploadLocked(false);
      }
    })();
  }, [pendencySignature, simulation?.id]);

  // Toast informativo quando contrato está efetivado
  useEffect(() => {
    if (simulation && simulation.status === 'contrato_efetivado') {
      showSuccess(
        'Contrato Efetivado',
        'Seu contrato foi efetivado com sucesso! O agente responsável entrará em contato via WhatsApp para informar os próximos passos e finalizar o processo.'
      );
    }
  }, [simulation?.status]);

  const fetchSimulation = async () => {
    try {
      let data: any = null;

      // Tenta detalhe completo (admin); se 403, cai para lista do cliente
      try {
        const adminDetail = await api.get(`/mobile/admin/simulations/${params.id}`);
        data = adminDetail.data;
      } catch (err: any) {
        if (err?.response?.status !== 403 && err?.response?.status !== 404) {
          throw err;
        }

        const listResponse = await api.get('/mobile/simulations');
        data = (listResponse.data || []).find((sim: any) => String(sim.id) === String(params.id));
      }

      if (!data) {
        throw new Error('Simulação não encontrada');
      }

      setSimulation(data);

      // Debug: Verificar se os campos de pendência estão vindo
      console.log('[DetalhesSimulacao] Simulation data:', {
        id: data.id,
        status: data.status,
        analysis_status: data.analysis_status,
        analyst_notes: data.analyst_notes,
        pending_documents: data.pending_documents,
      });
    } catch (error: any) {
      console.error('Error fetching simulation:', error);
      const message = error?.response?.data?.detail || 'Não foi possível carregar a simulação';
      showError('Erro', message);
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const normalizedStatus = (simulation?.status || '').toLowerCase();
  const canManageStatus = ['admin', 'supervisor', 'financeiro'].includes((user?.role || '').toLowerCase());
  const isClientApproved =
    normalizedStatus.includes('approved_by_client') ||
    normalizedStatus.includes('cliente_aprovada') ||
    normalizedStatus.includes('aprovada');
  const isAdminApproved = normalizedStatus === 'approved'; // aguardando aprovação do cliente

  const getToneColor = (tone: string) => {
    if (tone === 'success') return colors.success || '#22c55e';
    if (tone === 'warning') return colors.warning || '#f59e0b';
    if (tone === 'error') return colors.error || '#ef4444';
    return colors.accent;
  };

  const handleApproveByClient = () => {
    showConfirm(
      'Aprovar simulação',
      'Você confirma que concorda com esta proposta?',
      async () => {
        try {
          await api.post(`/mobile/simulations/${params.id}/approve-by-client`);
          await fetchSimulation();
          showSuccess(
            'Sucesso',
            'Simulação aprovada e enviada para o setor financeiro. O agente responsável entrará em contato para finalização do contrato.'
          );
        } catch (error: any) {
          const message = error?.response?.data?.detail || 'Não foi possível aprovar a simulação';
          showError('Erro', message);
        }
      }
    );
  };

  const handleRejectByClient = () => {
    showDestructive(
      'Reprovar simulação',
      'Deseja reprovar esta simulação?',
      async () => {
        try {
          await api.post(`/mobile/simulations/${params.id}/reject-by-client`);
          await fetchSimulation();
          showSuccess('Reprovada', 'Simulação reprovada.');
        } catch (error: any) {
          const message = error?.response?.data?.detail || 'Não foi possível reprovar a simulação';
          showError('Erro', message);
        }
      }
    );
  };

  const handleSendToFinance = () => {
    showConfirm(
      'Enviar ao Financeiro',
      'Confirmar o envio desta simulação para o financeiro?',
      async () => {
        try {
          await api.post(`/finance/mobile/${params.id}/approve`);
          await fetchSimulation();
          showSuccess('Sucesso', 'Simulação enviada ao financeiro');
        } catch (error: any) {
          const message = error?.response?.data?.detail || 'Não foi possível enviar ao financeiro';
          showError('Erro', message);
        }
      }
    );
  };

  const handleCancelFinance = () => {
    showDestructive(
      'Cancelar simulação',
      'Deseja cancelar esta simulação?',
      async () => {
        try {
          await api.post(`/finance/mobile/${params.id}/cancel`);
          await fetchSimulation();
          showSuccess('Cancelada', 'Simulação cancelada no financeiro');
        } catch (error: any) {
          const message = error?.response?.data?.detail || 'Não foi possível cancelar a simulação';
          showError('Erro', message);
        }
      }
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <Header title="Detalhes da Simulação" showBackButton />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Carregando simulação...</Text>
        </View>
        <MobileNav />
      </SafeAreaView>
    );
  }

  if (!simulation) {
    return null;
  }

  const statusMeta = mapSimulationStatus(simulation.status);
  const statusColor = getToneColor(statusMeta.tone);
  const showFinanceActions =
    canManageStatus &&
    ['approved_by_client', 'cliente_aprovada', 'simulacao_aprovada', 'financeiro_pendente'].includes(normalizedStatus);
  const hasPendingDocs = normalizedStatus === 'pending_docs';
  const showSimulationResult = ['approved', 'approved_by_client', 'cliente_aprovada', 'simulacao_aprovada', 'financeiro_pendente', 'contrato_efetivado'].includes(
    normalizedStatus
  );
  const simulationTypeLabel =
    simulation.simulation_type === 'document_upload'
      ? 'Solicitação de Simulação'
      : (simulation.simulation_type || '').replace(/_/g, ' ');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Header
        title="Detalhes da Simulação"
        subtitle={`#${simulation.id.substring(0, 8)}`}
        showBackButton
      />

      <Toast
        visible={showReuploadToast}
        tone="success"
        message="Documento reenviado e agora deve aguardar a análise do nosso time. Logo entraremos em contato."
        onHide={() => setShowReuploadToast(false)}
        style={{ top: spacing.lg }}
      />

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 80 + insets.bottom }}
      >
        <View style={styles.statusBadgeContainer}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20', borderColor: statusColor + '50' }]}>
            <Ionicons
              name={
                statusMeta.tone === 'success'
                  ? 'checkmark-circle'
                  : statusMeta.tone === 'error'
                    ? 'close-circle'
                    : 'time'
              }
              size={14}
              color={statusColor}
            />
            <Text style={[styles.statusBadgeText, { color: statusColor }]}>
              {statusMeta.label}
            </Text>
          </View>
        </View>

        {showSimulationResult && (
          <View style={[styles.highlightCard, { backgroundColor: colors.card, borderColor: colors.accent + '60' }]}>
            <View style={styles.highlightHeader}>
              <View style={[styles.highlightIcon, { backgroundColor: colors.accent + '20' }]}>
                <Ionicons name="cash-outline" size={22} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.highlightLabel, { color: colors.text }]}>Valor liberado para você</Text>
                <Text style={[styles.highlightValue, { color: colors.accent }]}>{formatCurrency(liberadoTotal)}</Text>
                <Text style={[styles.highlightSub, { color: colors.textSecondary }]}>
                  Baseado na simulação enviada
                </Text>
              </View>
            </View>
          </View>
        )}

        {hasPendingDocs && (
          <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border + '80' }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="alert-circle" size={20} color={colors.warning || colors.accent} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Pendências de documentos</Text>
            </View>

            {/* Mensagem do Analista - PRIMEIRO */}
            {analystNotes && (
              <View style={[styles.analystNotesCard, { backgroundColor: colors.warning + '15', borderColor: colors.warning + '30' }]}>
                <View style={styles.analystNotesHeader}>
                  <Ionicons name="person" size={18} color={colors.warning || colors.accent} />
                  <Text style={[styles.analystNotesTitle, { color: colors.warning || colors.accent }]}>
                    Mensagem do Analista:
                  </Text>
                </View>
                <Text style={[styles.analystNotesText, { color: colors.text }]}>
                  {analystNotes}
                </Text>
              </View>
            )}

            {/* Documentos Solicitados - DEPOIS */}
            <View style={{ gap: spacing.xs, marginTop: analystNotes ? spacing.md : 0 }}>
              {pendingDocs.length > 0 ? (
                <>
                  <Text style={[styles.pendingDocsTitle, { color: colors.textSecondary }]}>
                    Documentos Solicitados:
                  </Text>
                  {pendingDocs.map((doc, index) => (
                    <View key={`${doc.type}-${index}`} style={styles.pendingItem}>
                      <Ionicons name="document-text" size={18} color={colors.accent} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.pendingLabel, { color: colors.text }]}>
                          {doc.type || 'Documento solicitado'}
                        </Text>
                        {doc.description ? (
                          <Text style={[styles.pendingDescription, { color: colors.textSecondary }]}>
                            {doc.description}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </>
              ) : (
                <Text style={[styles.pendingDescription, { color: colors.textSecondary }]}>
                  Temos uma pendência de documento. Reenvie o contracheque mais recente para continuar.
                </Text>
              )}
            </View>

            {!pendingReuploadLocked ? (
              <Pressable
                style={[styles.pendingButton, { borderColor: colors.accent + '70', backgroundColor: colors.accent + '12' }]}
                onPress={() => router.push({
                  pathname: '/screens/enviar-documento',
                  params: {
                    pendingDocs: JSON.stringify(pendingDocs),
                    analystNotes,
                    simulationId: simulation.id
                  }
                })}
              >
                <Ionicons name="cloud-upload" size={18} color={colors.accent} />
                <Text style={[styles.pendingButtonText, { color: colors.accent }]}>Enviar documento agora</Text>
              </Pressable>
            ) : (
              <Text style={[styles.pendingDescription, { color: colors.textSecondary, marginTop: spacing.md }]}>
                Documento reenviado. Aguarde a análise do nosso time.
              </Text>
            )}
          </View>
        )}

        {/* Card informativo para contrato efetivado */}
        {simulation.status === 'contrato_efetivado' && (
          <View style={[styles.infoCard, { backgroundColor: (colors.success || '#22c55e') + '15', borderColor: (colors.success || '#22c55e') + '40' }]}>
            <View style={styles.infoCardHeader}>
              <Ionicons name="checkmark-circle" size={24} color={colors.success || '#22c55e'} />
              <Text style={[styles.infoCardTitle, { color: colors.success || '#22c55e' }]}>
                Contrato Efetivado
              </Text>
            </View>
            <View style={styles.infoCardContent}>
              <Ionicons name="logo-whatsapp" size={20} color={colors.textSecondary} style={{ marginTop: 2 }} />
              <Text style={[styles.infoCardText, { color: colors.text }]}>
                O agente responsável entrará em contato via WhatsApp para informar os próximos passos e finalizar o processo.
              </Text>
            </View>
          </View>
        )}

        {showFinanceActions && (
          <View style={styles.actionsRow}>
            <Pressable style={[styles.rejectButton, { borderColor: (colors.error || '#ef4444') + '50', backgroundColor: colors.card }]} onPress={handleCancelFinance}>
              <Ionicons name="close-circle" size={20} color={colors.error || '#ef4444'} />
              <Text style={[styles.rejectButtonText, { color: colors.error || '#ef4444' }]}>Cancelar</Text>
            </Pressable>
            <Pressable style={[styles.approveButton, { backgroundColor: colors.success || '#22c55e' }]} onPress={handleSendToFinance}>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={[styles.approveButtonText, { color: '#fff' }]}>Enviar ao Financeiro</Text>
            </Pressable>
          </View>
        )}

        {!showFinanceActions && isAdminApproved && !isClientApproved && (
          <View style={styles.actionsRow}>
            <Pressable style={[styles.rejectButton, { borderColor: (colors.error || '#ef4444') + '50', backgroundColor: colors.card }]} onPress={handleRejectByClient}>
              <Ionicons name="close-circle" size={20} color={colors.error || '#ef4444'} />
              <Text style={[styles.rejectButtonText, { color: colors.error || '#ef4444' }]}>Reprovar</Text>
            </Pressable>
            <Pressable style={[styles.approveButton, { backgroundColor: colors.accent }]} onPress={handleApproveByClient}>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={[styles.approveButtonText, { color: '#fff' }]}>Aprovar</Text>
            </Pressable>
          </View>
        )}

        {showSimulationResult && (
          <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border + '80' }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="calculator" size={20} color={colors.accent} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Dados da Simulação</Text>
            </View>
            <View style={styles.totalsList}>
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>Valor Liberado</Text>
                <Text style={[styles.totalValue, { color: colors.accent }]}>
                  {formatCurrency(liberadoTotal)}
                </Text>
              </View>
              <View style={[styles.divider, { backgroundColor: colors.border + '50' }]} />

              {Array.isArray(simulation.banks_json) && simulation.banks_json.length > 0 && (
                <>
                  <View style={styles.dataSection}>
                    <Text style={[styles.dataLabel, { color: colors.textSecondary }]}>Produtos</Text>
                    <View style={styles.productsList}>
                      {simulation.banks_json
                        .filter((bank: any) => bank.product)
                        .map((bank: any, index: number) => (
                          <View key={`product-${index}`} style={[styles.productBadge, { backgroundColor: colors.accent + '15', borderColor: colors.accent + '30' }]}>
                            <Text style={[styles.productText, { color: colors.accent }]}>{bank.product}</Text>
                          </View>
                        ))}
                      {simulation.banks_json.filter((bank: any) => bank.product).length === 0 && (
                        <Text style={[styles.emptyDataText, { color: colors.textTertiary }]}>Nenhum produto especificado</Text>
                      )}
                    </View>
                  </View>
                  <View style={[styles.divider, { backgroundColor: colors.border + '50' }]} />

                  <View style={styles.dataSection}>
                    <Text style={[styles.dataLabel, { color: colors.textSecondary }]}>Bancos</Text>
                    <View style={styles.banksList}>
                      {simulation.banks_json.map((bank: any, index: number) => (
                        <View key={`bank-${index}`} style={[styles.bankBadge, { borderColor: colors.border }]}>
                          <Ionicons name="business" size={16} color={colors.text} />
                          <Text style={[styles.bankBadgeText, { color: colors.text }]}>
                            {(bank.bank || bank.banco || 'Banco').toString().toUpperCase()}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </>
              )}
            </View>
          </View>
        )}

        {Array.isArray(simulation.banks_json) && simulation.banks_json.length > 0 && (
          <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border + '80' }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="business" size={20} color={colors.accent} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Bancos e produtos</Text>
            </View>
            {simulation.banks_json.map((bank: any, index: number) => (
              <View key={`${bank.bank || bank.banco || 'bank'}-${index}`} style={{ marginBottom: spacing.sm }}>
                <View style={styles.banksRow}>
                  <View style={[styles.bankBadge, { borderColor: colors.border }]}>
                    <Text style={[styles.bankBadgeText, { color: colors.text }]}>
                      {(bank.bank || bank.banco || 'Banco').toString().toUpperCase()}
                    </Text>
                  </View>
                  {bank.product && (
                    <View style={[styles.bankBadge, { borderColor: colors.border }]}>
                      <Text style={[styles.bankBadgeText, { color: colors.textSecondary }]}>
                        {bank.product}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.bankInfo}>
                  <Text style={[styles.bankInfoText, { color: colors.textSecondary }]}>
                    Parcela: {formatCurrency(Number(bank.parcela || 0))}
                  </Text>
                  <Text style={[styles.bankInfoText, { color: colors.textSecondary }]}>
                    Saldo: {formatCurrency(Number(bank.saldoDevedor || 0))}
                  </Text>
                  <Text style={[styles.bankInfoText, { color: colors.textSecondary }]}>
                    Liberado: {formatCurrency(Number(bank.valorLiberado || 0))}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {(simulation.percentual_consultoria || simulation.seguro) && (
          <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border + '80' }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="stats-chart" size={20} color={colors.accent} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Custos e consultoria</Text>
            </View>
            {simulation.percentual_consultoria !== undefined && (
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>% Consultoria</Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>{simulation.percentual_consultoria}%</Text>
              </View>
            )}
            {simulation.seguro !== undefined && (
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Seguro</Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>{formatCurrency(Number(simulation.seguro || 0))}</Text>
              </View>
            )}
          </View>
        )}

        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border + '80' }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="information-circle" size={20} color={colors.accent} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Informações</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Tipo:</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>{simulationTypeLabel}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Data:</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>
              {new Date(simulation.created_at).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              })}
            </Text>
          </View>
          {Array.isArray(simulation.documents) && simulation.documents.length > 0 && (
            <>
              <View style={[styles.divider, { backgroundColor: colors.border + '50' }]} />
              <Text style={[styles.sectionSubtitle, { color: colors.text }]}>Documentos enviados</Text>
              {simulation.documents.map((doc, idx) => (
                <View key={`${doc.id || idx}`} style={styles.infoRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
                      {doc.document_type || 'Documento'}
                    </Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>
                      {doc.document_filename || 'Arquivo'}
                    </Text>
                  </View>
                  {doc.created_at && (
                    <Text style={[styles.infoValue, { color: colors.textSecondary }]}>
                      {new Date(doc.created_at).toLocaleDateString('pt-BR')}
                    </Text>
                  )}
                </View>
              ))}
            </>
          )}
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
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
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
  statusBadgeContainer: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  highlightCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  highlightHeader: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  highlightIcon: {
    width: 46,
    height: 46,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  highlightLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  highlightValue: {
    fontSize: 32,
    fontWeight: '800',
  },
  highlightSub: {
    fontSize: 12,
    marginTop: 4,
  },
  infoCard: {
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    borderWidth: 2,
    gap: spacing.md,
  },
  infoCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  infoCardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  infoCardContent: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  infoCardText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  rejectButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  rejectButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  approveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  approveButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  pendingItem: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  pendingLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  pendingDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  pendingNote: {
    fontSize: 12,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  analystNotesCard: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  analystNotesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  analystNotesTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  analystNotesText: {
    fontSize: 14,
    lineHeight: 20,
  },
  pendingDocsTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  pendingButton: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  pendingButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  sectionCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  sectionSubtitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  banksRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  bankBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  bankBadgeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  bankInfo: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  bankInfoText: {
    fontSize: 14,
  },
  totalsList: {
    gap: 0,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  totalLabel: {
    fontSize: 14,
  },
  totalValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  divider: {
    height: 1,
    marginVertical: spacing.xs,
  },
  dataSection: {
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  dataLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  productsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  productBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  productText: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyDataText: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  banksList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 14,
  },
  formulasCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.xl,
    borderWidth: 1,
  },
  formulasText: {
    fontSize: 12,
    lineHeight: 18,
  },
  formulasBold: {
    fontWeight: 'bold',
  },
});
