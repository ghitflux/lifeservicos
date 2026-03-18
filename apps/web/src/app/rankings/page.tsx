"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  RankingTable,
  PodiumCard,
  CampaignCard,
  DateRangeFilter,
  DateRangeFilterWithCalendar, // ✅ NOVO: Componente com Calendar
  ProgressBar,
  Button,
  Card
} from "@lifecalling/ui";
import { CampaignModal } from "@/components/CampaignModal";
import { ContractsDetailsModal } from "@/components/rankings/ContractsDetailsModal";
import { useAuth } from "@/lib/auth";
import { useMemo, useState } from "react";
import { Download, Plus, Trophy, Eye, FileText } from "lucide-react";
import { toast } from "sonner";
import { startOfMonthBrasilia, endOfMonthBrasilia, formatDateBrasilia } from "@/lib/timezone";

export default function RankingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<any>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState<any>(null);

  // Estados para modal de contratos
  const [showContractsModal, setShowContractsModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedUserName, setSelectedUserName] = useState<string>("");

  // Estados para filtro por período (padrão: mês atual)
  const [startDate, setStartDate] = useState<string>(() => {
    const now = new Date();
    return formatDateBrasilia(startOfMonthBrasilia(now));
  });
  const [endDate, setEndDate] = useState<string>(() => {
    const now = new Date();
    return formatDateBrasilia(endOfMonthBrasilia(now));
  });


  // Query: Pódio (Top 3)
  const { data: podiumData, isLoading: podiumLoading } = useQuery({
    queryKey: ["rankings", "podium", startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append("from", new Date(startDate).toISOString());
      params.append("to", new Date(endDate).toISOString());
      const response = await api.get(`/rankings/podium?${params.toString()}`);
      return response.data;
    },
    staleTime: 30000,
    gcTime: 60000
  });

  // Query: Ranking completo de todos os usuários
  const { data: rankingData, isLoading: rankingLoading } = useQuery({
    queryKey: ["rankings", "agents", startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append("from", new Date(startDate).toISOString());
      params.append("to", new Date(endDate).toISOString());
      const response = await api.get(`/rankings/agents?${params.toString()}`);
      return response.data;
    },
    staleTime: 30000,
    gcTime: 60000
  });

  // Query: Campanhas ativas
  const { data: activeCampaigns } = useQuery({
    queryKey: ["campaigns", "active"],
    queryFn: async () => {
      const response = await api.get("/campaigns/active");
      return response.data;
    }
  });

  // Query: Próximas campanhas
  const { data: upcomingCampaigns } = useQuery({
    queryKey: ["campaigns", "upcoming"],
    queryFn: async () => {
      const response = await api.get("/campaigns/upcoming");
      return response.data;
    }
  });

  // Query: Campanhas encerradas
  const { data: finishedCampaigns } = useQuery({
    queryKey: ["campaigns", "finished"],
    queryFn: async () => {
      const response = await api.get("/campaigns/finished");
      return response.data;
    }
  });

  // Query: KPIs dos contratos do atendente (apenas para atendentes)
  const { data: myContractsData } = useQuery({
    queryKey: ["my-contracts-summary", user?.id, startDate, endDate],
    queryFn: async () => {
      if (!user?.id) return null;
      const params = new URLSearchParams();
      params.append("from", new Date(startDate).toISOString());
      params.append("to", new Date(endDate).toISOString());
      params.append("per_page", "1"); // Só precisa do summary
      const response = await api.get(`/rankings/agents/${user.id}/contracts?${params.toString()}`);
      return response.data;
    },
    enabled: user?.role === "atendente"
  });

  // Helper: formatar moeda
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  // Mutations
  const createCampaignMutation = useMutation({
    mutationFn: async (data: any) => (await api.post("/campaigns", data)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success("Campanha criada com sucesso!");
      setShowCampaignModal(false);
    },
    onError: (error: any) => toast.error(error.response?.data?.detail || "Erro ao criar campanha")
  });

  const updateCampaignMutation = useMutation({
    mutationFn: async (data: any) => (await api.put(`/campaigns/${data.id}`, data)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success("Campanha atualizada com sucesso!");
      setShowEditModal(false);
      setEditingCampaign(null);
    },
    onError: (error: any) => toast.error(error.response?.data?.detail || "Erro ao atualizar campanha")
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: async (campaignId: number) => (await api.delete(`/campaigns/${campaignId}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success("Campanha excluída com sucesso!");
      setShowDeleteModal(false);
      setCampaignToDelete(null);
    },
    onError: (error: any) => toast.error(error.response?.data?.detail || "Erro ao excluir campanha")
  });

  // Handlers
  const handleDateRangeChange = (start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
  };

  const handleClearDateRange = () => {
    const now = new Date();
    setStartDate(formatDateBrasilia(startOfMonthBrasilia(now)));
    setEndDate(formatDateBrasilia(endOfMonthBrasilia(now)));
  };

  const handleExportReport = async () => {
    try {
      const params = new URLSearchParams();
      params.append("kind", "agents");
      params.append("from", new Date(startDate).toISOString());
      params.append("to", new Date(endDate).toISOString());

      const response = await api.get(`/rankings/export.csv?${params.toString()}`, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `ranking_${startDate}_${endDate}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();

      toast.success("Relatório exportado com sucesso!");
    } catch (error: any) {
      toast.error("Erro ao exportar relatório");
    }
  };

  // Formatação de dados para a tabela (filtrado: apenas atendentes, excluir usuários específicos)
  const tableData = useMemo(() => {
    if (!rankingData?.items) return [];

    // Filtrar apenas atendentes + Balcão, excluindo usuários internos/sistema
    const filteredItems = rankingData.items.filter((agent: any) => {
      const nameLower = agent.name?.toLowerCase() || "";

      // Balcão sempre aparece no ranking
      if (nameLower === "balcão" || nameLower === "balcao") {
        return true;
      }

      // Lista de usuários/padrões a excluir
      const excludedPatterns = [
        "peltson",
        "administrador",
        "admin",
        "calculista",
        "supervisor",
        "sistema",
        "fechamento"
      ];

      // Excluir se o nome contém qualquer padrão excluído
      if (excludedPatterns.some(pattern => nameLower.includes(pattern))) {
        return false;
      }

      // Excluir roles não-atendentes
      const excludedRoles = ["super_admin", "admin", "supervisor", "calculista"];
      if (agent.role && excludedRoles.includes(agent.role.toLowerCase())) {
        return false;
      }

      // Se tem role, só aceitar "atendente"
      if (agent.role && agent.role.toLowerCase() !== "atendente") {
        return false;
      }

      return true;
    });

    return filteredItems.map((agent: any, idx: number) => ({
      pos: idx + 1,
      user_id: agent.user_id,
      name: agent.name,
      contracts: agent.contracts || 0,
      consultoria_liq: agent.consultoria_liq || 0,
      meta_contratos: agent.meta_contratos || 0,
      meta_consultoria: agent.meta_consultoria || 15000,
      atingimento_contratos: agent.atingimento_contratos || 0,
      atingimento_consultoria: agent.atingimento_consultoria || 0
    }));
  }, [rankingData]);

  // Gerar pódio a partir dos dados da tabela de rankings (top 3)
  const filteredPodiumData = useMemo(() => {
    if (!tableData || tableData.length === 0) return null;

    // Pegar os top 3 da tabela de rankings
    const top3 = tableData.slice(0, 3).map((agent: any) => ({
      position: agent.pos,
      user_id: agent.user_id,
      name: agent.name,
      contracts: agent.contracts,
      consultoria_liq: agent.consultoria_liq
    }));

    return {
      period: podiumData?.period || { from: startDate, to: endDate },
      podium: top3
    };
  }, [tableData, podiumData, startDate, endDate]);

  // Renderizar célula de progresso
  function ProgressCell(row: any) {
    const progress = row.atingimento_consultoria || 0;
    const variant = progress < 50 ? "danger" : progress < 80 ? "warning" : "success";
    return (
      <div className="min-w-[160px]">
        <ProgressBar value={progress} max={100} size="sm" variant={variant} />
        <div className="text-xs text-muted-foreground mt-1">{progress.toFixed(1)}% da meta</div>
      </div>
    );
  }

  // Renderizar célula de ranking
  function RankCell(row: any) {
    const medals = ["🥇", "🥈", "🥉"];
    if (row.pos <= 3) {
      return (
        <div className="flex items-center gap-2">
          <span className="text-2xl">{medals[row.pos - 1]}</span>
          <span className="font-bold text-lg">{row.pos}</span>
        </div>
      );
    }
    return <span>{row.pos}</span>;
  }

  const isAdmin = user?.role === "super_admin" || user?.role === "admin";
  const isAdminOrSupervisor = user?.role === "super_admin" || user?.role === "admin" || user?.role === "supervisor";

  return (
    <div className="container mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Trophy className="h-8 w-8 text-yellow-600" />
            Rankings
          </h1>
          <p className="text-muted-foreground mt-1">
            Acompanhe seu desempenho e o ranking geral da equipe
          </p>
        </div>
      </div>

      {/* Filtro de Período com Calendar */}
      <div className="border rounded-lg p-4 bg-card">
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Filtrar por Período</h3>
        <DateRangeFilterWithCalendar
          startDate={startDate}
          endDate={endDate}
          onDateRangeChange={handleDateRangeChange}
          onClear={handleClearDateRange}
          label="Período:"
          className="w-full max-w-2xl"
        />
      </div>


      {/* Pódio - Top 3 */}
      <div>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-600" />
          Pódio - Top 3
        </h2>
        {rankingLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-muted animate-pulse rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Reorganizar para colocar o 1º lugar no meio */}
            {filteredPodiumData?.podium?.length > 0 ? (
              <>
                {/* 2º Lugar (esquerda) - índice 1 do array filtrado */}
                {filteredPodiumData.podium.length >= 2 && filteredPodiumData.podium[1] && (
                  <div className="order-1 md:order-1">
                    <PodiumCard
                      key={`podium-2-${filteredPodiumData.podium[1].user_id}`}
                      position={filteredPodiumData.podium[1].position}
                      userName={filteredPodiumData.podium[1].name}
                      contracts={filteredPodiumData.podium[1].contracts}
                      consultoriaLiq={filteredPodiumData.podium[1].consultoria_liq}
                    />
                  </div>
                )}

                {/* 1º Lugar (meio) - índice 0 do array filtrado */}
                {filteredPodiumData.podium[0] && (
                  <div className="order-2 md:order-2">
                    <PodiumCard
                      key={`podium-1-${filteredPodiumData.podium[0].user_id}`}
                      position={filteredPodiumData.podium[0].position}
                      userName={filteredPodiumData.podium[0].name}
                      contracts={filteredPodiumData.podium[0].contracts}
                      consultoriaLiq={filteredPodiumData.podium[0].consultoria_liq}
                    />
                  </div>
                )}

                {/* 3º Lugar (direita) - índice 2 do array filtrado */}
                {filteredPodiumData.podium.length >= 3 && filteredPodiumData.podium[2] && (
                  <div className="order-3 md:order-3">
                    <PodiumCard
                      key={`podium-3-${filteredPodiumData.podium[2].user_id}`}
                      position={filteredPodiumData.podium[2].position}
                      userName={filteredPodiumData.podium[2].name}
                      contracts={filteredPodiumData.podium[2].contracts}
                      consultoriaLiq={filteredPodiumData.podium[2].consultoria_liq}
                    />
                  </div>
                )}
              </>
            ) : (
              <div className="col-span-3 text-center py-12 text-muted-foreground">
                Nenhum dado disponível para o período selecionado
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabela de Ranking Geral */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Ranking Geral</h2>
          <Button onClick={handleExportReport} variant="outline" size="sm" disabled={rankingLoading}>
            <Download className="h-4 w-4 mr-2" />
            Exportar Relatório
          </Button>
        </div>
        {rankingLoading ? (
          <div className="border rounded-lg p-6 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : tableData.length > 0 ? (
          <RankingTable
            data={tableData}
            columns={[
              { key: "pos", header: "#", render: RankCell },
              { key: "name", header: "Usuário" },
              { key: "contracts", header: "Contratos", format: "number" },
              { key: "consultoria_liq", header: "Consultoria Líq.", format: "currency" },
              { key: "meta_consultoria", header: "Meta", format: "currency" },
              { key: "progress", header: "Progresso", render: ProgressCell },
              ...(isAdminOrSupervisor ? [{
                key: "actions",
                header: "Ações",
                render: (row: any) => (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedUserId(row.user_id);
                      setSelectedUserName(row.name);
                      setShowContractsModal(true);
                    }}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Ver Detalhes
                  </Button>
                )
              }] : [])
            ]}
            highlightTop3
          />
        ) : (
          <div className="text-center py-12 border rounded-lg text-muted-foreground">
            Nenhum dado de ranking disponível para o período selecionado
          </div>
        )}
      </div>

      {/* Meus Contratos (apenas para atendentes) */}
      {user?.role === "atendente" && (
        <Card className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h2 className="text-xl font-semibold mb-2 flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Meus Contratos Efetivados
              </h2>

              {/* KPIs rápidos */}
              {myContractsData?.summary && (
                <div className="flex gap-4 text-sm text-muted-foreground mt-2">
                  <span>
                    <strong>{myContractsData.summary.total_contracts}</strong> contrato(s)
                  </span>
                  <span>•</span>
                  <span>
                    <strong>{formatCurrency(myContractsData.summary.total_consultoria)}</strong> em consultoria
                  </span>
                </div>
              )}
            </div>

            <Button
              onClick={() => {
                setSelectedUserId(user.id);
                setSelectedUserName(user.name);
                setShowContractsModal(true);
              }}
            >
              <Eye className="h-4 w-4 mr-2" />
              Ver Detalhes
            </Button>
          </div>
        </Card>
      )}

      {/* Campanhas Ativas */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-semibold">🔥 Campanhas Ativas</h2>
            <p className="text-sm text-muted-foreground mt-1">Campanhas em andamento</p>
          </div>
          {isAdmin && (
            <Button onClick={() => setShowCampaignModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Campanha
            </Button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4">
          {activeCampaigns?.items?.length > 0 ? (
            activeCampaigns.items.map((campaign: any) => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                onEdit={isAdmin ? (c) => { setEditingCampaign(c); setShowEditModal(true); } : undefined}
                onDelete={isAdmin ? (c) => { setCampaignToDelete(c); setShowDeleteModal(true); } : undefined}
                canManage={isAdmin}
              />
            ))
          ) : (
            <div className="text-center py-12 border border-dashed rounded-lg text-muted-foreground">
              Nenhuma campanha ativa no momento
            </div>
          )}
        </div>
      </div>

      {/* Próximas Campanhas */}
      {upcomingCampaigns?.items?.length > 0 && (
        <div>
          <h2 className="text-2xl font-semibold mb-4">🔵 Próximas Campanhas</h2>
          <div className="grid grid-cols-1 gap-4">
            {upcomingCampaigns.items.map((campaign: any) => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                onEdit={isAdmin ? (c) => { setEditingCampaign(c); setShowEditModal(true); } : undefined}
                onDelete={isAdmin ? (c) => { setCampaignToDelete(c); setShowDeleteModal(true); } : undefined}
                canManage={isAdmin}
              />
            ))}
          </div>
        </div>
      )}

      {/* Campanhas Encerradas */}
      {finishedCampaigns?.items?.length > 0 && (
        <div>
          <h2 className="text-2xl font-semibold mb-4">⚫ Campanhas Encerradas</h2>
          <div className="grid grid-cols-1 gap-4">
            {finishedCampaigns.items.map((campaign: any) => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                onEdit={isAdmin ? (c) => { setEditingCampaign(c); setShowEditModal(true); } : undefined}
                onDelete={isAdmin ? (c) => { setCampaignToDelete(c); setShowDeleteModal(true); } : undefined}
                canManage={isAdmin}
              />
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      <CampaignModal
        open={showCampaignModal}
        onOpenChange={setShowCampaignModal}
        onSubmit={(data) => createCampaignMutation.mutate(data)}
        isLoading={createCampaignMutation.isPending}
        mode="create"
      />

      <CampaignModal
        open={showEditModal}
        onOpenChange={setShowEditModal}
        onSubmit={(data) => updateCampaignMutation.mutate({ ...data, id: editingCampaign?.id })}
        isLoading={updateCampaignMutation.isPending}
        mode="edit"
        initialData={editingCampaign}
      />

      {/* Modal de Confirmação de Exclusão */}
      {showDeleteModal && campaignToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Confirmar Exclusão</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Tem certeza que deseja excluir a campanha <span className="font-semibold">{campaignToDelete.nome}</span>? Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowDeleteModal(false);
                  setCampaignToDelete(null);
                }}
                disabled={deleteCampaignMutation.isPending}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteCampaignMutation.mutate(campaignToDelete.id)}
                disabled={deleteCampaignMutation.isPending}
              >
                {deleteCampaignMutation.isPending ? "Excluindo..." : "Excluir"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Detalhes de Contratos (Admin/Supervisor) */}
      {selectedUserId && (
        <ContractsDetailsModal
          open={showContractsModal}
          onOpenChange={setShowContractsModal}
          userId={selectedUserId}
          userName={selectedUserName}
          startDate={startDate}
          endDate={endDate}
        />
      )}
    </div>
  );
}
