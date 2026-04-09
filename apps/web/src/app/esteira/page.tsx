"use client";
import { useLiveCaseEvents } from "@/lib/ws";
import { useState, useEffect, Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Badge, EsteiraCard, Tabs, TabsContent, TabsList, TabsTrigger, CaseSkeleton, KPICard, CasesTable, Pagination } from "@lifecalling/ui";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useMyStats } from "@/lib/hooks";
import { useAuth } from "@/lib/auth";
import { buildCasesQuery } from "@/lib/query";
import { toast } from "sonner";
import { Search, X, Building2, Activity, CheckCircle, AlertCircle, TrendingUp, DollarSign, Target, User, Phone, Briefcase, Hash, Calendar, CreditCard, MapPin, Copy, ChevronLeft, ChevronRight, Download, ShieldOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Case {
  id: number;
  status: string;
  client: {
    name: string;
    cpf: string;
    matricula: string;
    cargo?: string;
  };
  created_at: string;
  assigned_to?: string;
  telefone_preferencial?: string;
  observacoes?: string;
  banco?: string;
  entidade?: string;
  valor_mensalidade?: number;
}

function EsteiraPageContent() {
  useLiveCaseEvents();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();  // Adicionar hook de autenticação
  const [activeTab, setActiveTab] = useState("global");

  // Verificar se é admin ou supervisor
  const isAdminOrSupervisor = user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'supervisor';

  // Estados de paginação e filtro (simplificados)
  const [globalPage, setGlobalPage] = useState(1);
  const [globalPageSize, setGlobalPageSize] = useState(20);
  const [globalSearchTerm, setGlobalSearchTerm] = useState("");
  const [globalSelectedBanco, setGlobalSelectedBanco] = useState<string | null>(null);
  const [globalSelectedCargo, setGlobalSelectedCargo] = useState<string | null>(null);
  const [globalSelectedStatus, setGlobalSelectedStatus] = useState<string | null>(null);
  const [globalExcludeSiape, setGlobalExcludeSiape] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

  const [myPage, setMyPage] = useState(1);
  const [myPageSize, setMyPageSize] = useState(20);
  const [mySearchTerm, setMySearchTerm] = useState("");
  const [mySelectedBanco, setMySelectedBanco] = useState<string | null>(null);
  const [mySelectedCargo, setMySelectedCargo] = useState<string | null>(null);
  const [mySelectedStatus, setMySelectedStatus] = useState<string | null>(null);
  const [myExcludeSiape, setMyExcludeSiape] = useState(false);

  // Estados para a tab Esteira
  const [esteiraCurrentIndex, setEsteiraCurrentIndex] = useState(0);
  const [esteiraSelectedBanco, setEsteiraSelectedBanco] = useState<string | null>(null);
  const [esteiraSelectedCargo, setEsteiraSelectedCargo] = useState<string | null>(null);
  const [esteiraSelectedStatus, setEsteiraSelectedStatus] = useState<string | null>(null);
  const [esteiraSearchTerm, setEsteiraSearchTerm] = useState("");

  // Busca em tempo real (como módulo Clientes)

  const queryClient = useQueryClient();

  // Reset página quando filtros mudam
  useEffect(() => {
    setGlobalPage(1);
  }, [globalSelectedBanco, globalSelectedCargo, globalSelectedStatus, globalSearchTerm, globalExcludeSiape]);


  useEffect(() => {
    setMyPage(1);
  }, [mySelectedBanco, mySelectedCargo, mySelectedStatus, mySearchTerm, myExcludeSiape]);

  useEffect(() => {
    setGlobalPage(1);
  }, [globalPageSize]);

  useEffect(() => {
    setMyPage(1);
  }, [myPageSize]);

  // Restaurar estado da esteira quando a página carregar
  useEffect(() => {
    const savedPage = searchParams.get('page');
    const savedTab = searchParams.get('tab');
    const savedStatus = searchParams.get('status');
    const savedSearch = searchParams.get('search');

    console.log('Parâmetros da URL:', { savedPage, savedTab, savedStatus, savedSearch });

    // Só alterar a aba se houver parâmetro explícito na URL
    if (savedTab && (savedTab === 'mine' || savedTab === 'global')) {
      setActiveTab(savedTab);
    }
    // Se não houver parâmetro de aba, manter o padrão (global)

    if (savedPage) {
      const pageNum = parseInt(savedPage);
      const tabToUse = savedTab || 'global'; // Usar global como padrão se não houver tab
      console.log('Restaurando página:', { pageNum, tabToUse });
      
      if (tabToUse === 'mine') {
        setMyPage(pageNum);
      } else {
        setGlobalPage(pageNum);
      }
    }

    if (savedStatus) {
      const tabToUse = savedTab || 'global';
      if (tabToUse === 'mine') {
        setMySelectedStatus([savedStatus]);
      } else {
        setGlobalSelectedStatus([savedStatus]);
      }
    }

    if (savedSearch) {
      const tabToUse = savedTab || 'global';
      if (tabToUse === 'mine') {
        setMySearchTerm(savedSearch);
      } else {
        setGlobalSearchTerm(savedSearch);
      }
    }
  }, [searchParams]);

  // Query para mÃ©tricas do usuÃ¡rio
  const { data: myStats, isLoading: loadingStats } = useMyStats();

  // Query para listar atendimentos globais
  const { data: globalData, isLoading: loadingGlobal, error: errorGlobal } = useQuery({
    queryKey: [
      "cases",
      "global",
      globalPage,
      globalPageSize,
      globalSelectedBanco,
      globalSelectedCargo,
      globalSelectedStatus,
      globalSearchTerm,
      globalExcludeSiape,
    ],
    queryFn: async () => {
      const isManager = ["super_admin", "admin", "supervisor"].includes(user?.role ?? "");

      const orderBy = globalSelectedBanco ? `financiamentos_banco_desc:${globalSelectedBanco}` : "financiamentos_desc";

      const params = buildCasesQuery(
        isManager
          ? {
              page: globalPage,
              page_size: globalPageSize,
              order: orderBy,
              q: globalSearchTerm,
              banco: globalSelectedBanco || undefined,
              cargo: globalSelectedCargo || undefined,
              status: globalSelectedStatus ? [globalSelectedStatus] : undefined,
              exclude_siape: globalExcludeSiape || undefined,
            }
          : {
              page: globalPage,
              page_size: globalPageSize,
              order: orderBy,
              q: globalSearchTerm,
              banco: globalSelectedBanco || undefined,
              cargo: globalSelectedCargo || undefined,
              status: ["novo"],
              exclude_siape: globalExcludeSiape || undefined,
            }
      );

      const response = await api.get(`/cases?${params.toString()}`);
      return response.data;
    },
    staleTime: 5000,
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
    retry: 2,
  });

  const globalCases = globalData?.items ?? [];
  const globalTotal = globalData?.total ?? 0;
  const globalTotalPages = Math.ceil(globalTotal / globalPageSize);

  // Query para listar meus atendimentos
  const { data: myData, isLoading: loadingMine, error: errorMine } = useQuery({
    queryKey: ["cases", "mine", myPage, myPageSize, mySelectedBanco, mySelectedCargo, mySelectedStatus, mySearchTerm, myExcludeSiape],
    queryFn: async () => {
      const orderBy = mySelectedBanco ? `financiamentos_banco_desc:${mySelectedBanco}` : "financiamentos_desc";

      const params = buildCasesQuery({
        page: myPage,
        page_size: myPageSize,
        order: orderBy,
        q: mySearchTerm,
        banco: mySelectedBanco || undefined,
        cargo: mySelectedCargo || undefined,
        status: mySelectedStatus ? [mySelectedStatus] : undefined,
        mine: true,
        exclude_siape: myExcludeSiape || undefined,
      });

      const response = await api.get(`/cases?${params.toString()}`);
      return response.data;
    },
    staleTime: 5000,
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
    retry: 2,
  });

  const myCases = myData?.items ?? [];
  const myTotal = myData?.total ?? 0;
  const myTotalPages = Math.ceil(myTotal / myPageSize);

  // Query para a esteira (todos os casos com filtros aplicados)
  const { data: esteiraData, isLoading: loadingEsteira, error: errorEsteira } = useQuery({
    queryKey: ["cases", "esteira", esteiraSelectedBanco, esteiraSelectedCargo, esteiraSelectedStatus, esteiraSearchTerm],
    queryFn: async () => {
      const isManager = ["super_admin", "admin", "supervisor"].includes(user?.role ?? "");

      // Para esteira, sempre mostrar apenas casos novos
      const params = buildCasesQuery({
        page: 1,
        page_size: 1000, // Buscar muitos casos para navegação
        order: "id_desc", // Usar ordenação simples por ID
        q: esteiraSearchTerm,
        status: ["novo"], // Sempre mostrar apenas casos novos na esteira
      });

      console.log('[Esteira] User role:', user?.role);
      console.log('[Esteira] Is Manager:', isManager);
      console.log('[Esteira] Fetching cases with params:', params.toString());
      const response = await api.get(`/cases?${params.toString()}`);
      console.log('[Esteira] Response:', response.data);
      return response.data;
    },
    onError: (error) => {
      console.error('[Esteira] Error fetching cases:', error);
      console.error('[Esteira] Error details:', (error as any)?.response?.data);
    },
    enabled: !!user && activeTab === 'esteira',
    staleTime: 5000,
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
    retry: 2,
  });

  const esteiraCases = esteiraData?.items ?? [];
  const esteiraTotal = esteiraData?.total ?? 0;
  const currentCase = esteiraCases[esteiraCurrentIndex];

  // Query para buscar detalhes completos do caso atual na esteira
  const { data: currentCaseDetails, isLoading: loadingCaseDetails } = useQuery({
    queryKey: ["case", currentCase?.id],
    queryFn: async () => {
      if (!currentCase?.id) return null;
      const response = await api.get(`/cases/${currentCase.id}`);
      return response.data;
    },
    enabled: !!currentCase?.id && activeTab === 'esteira',
    staleTime: 5000,
    refetchOnWindowFocus: false,
  });

  // Funções de navegação da esteira
  const handleNextCase = () => {
    if (esteiraCurrentIndex < esteiraCases.length - 1) {
      setEsteiraCurrentIndex(esteiraCurrentIndex + 1);
    }
  };

  const handlePreviousCase = () => {
    if (esteiraCurrentIndex > 0) {
      setEsteiraCurrentIndex(esteiraCurrentIndex - 1);
    }
  };

  // Reset índice quando filtros mudam
  useEffect(() => {
    setEsteiraCurrentIndex(0);
  }, [esteiraSelectedBanco, esteiraSelectedCargo, esteiraSelectedStatus, esteiraSearchTerm]);

  // Mutation para pegar um atendimento na tab esteira (inline)
  const assignCaseEsteiraMutation = useMutation({
    mutationFn: async (caseId: number) => {
      const response = await api.post(`/cases/${caseId}/assign`);
      return { data: response.data, caseId };
    },
    onSuccess: (result) => {
      // Atualiza as queries após pegar um caso
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      queryClient.invalidateQueries({ queryKey: ["case", result.caseId] });
      toast.success("Atendimento atribuído com sucesso!");
      // NÃO redireciona - mantém na tab esteira para edição inline
    },
    onError: (error) => {
      toast.error("Erro ao atribuir atendimento. Tente novamente.");
      console.error("Assign case error:", error);
    },
  });

  // Mutation para pegar um atendimento nas outras tabs (redireciona)
  const assignCaseMutation = useMutation({
    mutationFn: async (caseId: number) => {
      const response = await api.post(`/cases/${caseId}/assign`);
      return { data: response.data, caseId };
    },
    onSuccess: (result) => {
      // Atualiza as queries após pegar um caso
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      toast.success("Atendimento atribuído com sucesso!");
      // Redireciona automaticamente para os detalhes do caso
      router.push(`/casos/${result.caseId}`);
    },
    onError: (error) => {
      toast.error("Erro ao atribuir atendimento. Tente novamente.");
      console.error("Assign case error:", error);
    },
  });

  const handleExportCsv = async () => {
    if (!isAdminOrSupervisor) return;
    setExportingCsv(true);
    try {
      const params = new URLSearchParams();
      if (globalSelectedStatus) params.set("status", globalSelectedStatus);
      if (globalSelectedBanco) params.set("entidade", globalSelectedBanco);
      if (globalExcludeSiape) params.set("exclude_siape", "true");

      const response = await api.get(`/cases/export/csv?${params.toString()}`, {
        responseType: "blob",
      });

      const url = URL.createObjectURL(new Blob([response.data], { type: "text/csv;charset=utf-8;" }));
      const link = document.createElement("a");
      link.href = url;
      const date = new Date().toISOString().slice(0, 10);
      link.download = `casos_${date}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Erro ao exportar CSV. Tente novamente.");
    } finally {
      setExportingCsv(false);
    }
  };

  const handlePegarAtendimento = (caseId: number) => {
    assignCaseMutation.mutate(caseId);
  };

  const handlePegarAtendimentoEsteira = (caseId: number) => {
    assignCaseEsteiraMutation.mutate(caseId);
  };

  const handleViewCase = (caseId: number) => {
    // Salvar estado atual da esteira no sessionStorage
    const currentPage = activeTab === 'mine' ? myPage : globalPage;
    const currentStatusFilter = activeTab === 'mine' ? mySelectedStatus : globalSelectedStatus;
    const currentSearchTerm = activeTab === 'mine' ? mySearchTerm : globalSearchTerm;
    const currentList = activeTab === 'mine' ? myCases : globalCases;

    // Forçar aba global se não estiver explicitamente em 'mine'
    const tabToSave = activeTab === 'mine' ? 'mine' : 'global';

    console.log('Salvando estado antes de navegar:', {
      currentPage,
      tabToSave,
      activeTab,
      globalPage,
      myPage
    });

    sessionStorage.setItem('esteira-page', currentPage.toString());
    sessionStorage.setItem('esteira-tab', tabToSave);
    sessionStorage.setItem('esteira-filters', JSON.stringify({
      status: currentStatusFilter,
      search: currentSearchTerm
    }));
    sessionStorage.setItem('esteira-case-ids', JSON.stringify((currentList ?? []).map((c) => c.id)));

    // Verificar se foi salvo corretamente
    const savedPage = sessionStorage.getItem('esteira-page');
    const savedTab = sessionStorage.getItem('esteira-tab');
    console.log('Verificação após salvar:', { savedPage, savedTab });

    router.push(`/casos/${caseId}`);
  };

  // Query para buscar filtros disponíveis (bancos, cargos e status)
  const { data: filtersData } = useQuery({
    queryKey: ["client-filters"],
    queryFn: async () => {
      const response = await api.get("/clients/filters");
      return response.data;
    },
    staleTime: 60000, // Cache por 1 minuto
  });

  const renderCaseList = (cases: Case[], showPegarButton: boolean, isLoading: boolean, error?: any) => {

    if (isLoading) {
      return (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
          {Array.from({ length: 6 }, (_, i) => (
            <CaseSkeleton key={i} />
          ))}
        </div>
      );
    }

    if (error) {
      console.error('Erro ao carregar atendimentos:', error);
      return (
        <div className="col-span-full text-center py-8 text-destructive">
          Erro ao carregar atendimentos. Tente novamente.
          <br />
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ["cases"] })}
            className="mt-2 text-sm underline"
          >
            Recarregar
          </button>
        </div>
      );
    }

    return (
      <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
        {Array.isArray(cases) && cases.map((caso) => (
          <EsteiraCard
            key={caso.id}
            caso={caso}
            onView={handleViewCase}
            onAssign={showPegarButton ? handlePegarAtendimento : undefined}
          />
        ))}
        {Array.isArray(cases) && cases.length === 0 && (
          <div className="col-span-full text-center py-8 text-muted-foreground">
            Nenhum atendimento encontrado
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Esteira de Atendimentos</h1>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="global">Global ({globalTotal})</TabsTrigger>
          <TabsTrigger value="mine">Meus Atendimentos ({myTotal})</TabsTrigger>
        </TabsList>

        <TabsContent value="global" className="mt-6">
          <div className="space-y-6">
            {/* Filtros */}
            <Card className="p-4 space-y-4">
              {/* Busca + ações admin */}
              <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome, CPF ou matrícula..."
                    value={globalSearchTerm}
                    onChange={(e) => setGlobalSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="text-sm text-muted-foreground">
                  {globalTotal} {globalTotal === 1 ? 'disponível' : 'disponíveis'}
                </div>
                {isAdminOrSupervisor && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportCsv}
                    disabled={exportingCsv}
                    className="h-9 gap-2"
                  >
                    <Download className="h-4 w-4" />
                    {exportingCsv ? "Exportando..." : "Exportar CSV"}
                  </Button>
                )}
              </div>

              {/* Filtros Rápidos - Dropdowns */}
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Dropdown Banco */}
                  {filtersData?.bancos && filtersData.bancos.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        <Building2 className="h-3.5 w-3.5" />
                        Banco
                      </label>
                      <select
                        value={globalSelectedBanco || ""}
                        onChange={(e) => {
                          setGlobalSelectedBanco(e.target.value || null);
                        }}
                        className="h-10 w-full px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground transition-colors hover:border-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="">Todos os bancos</option>
                        {filtersData.bancos.map((banco: any) => (
                          <option key={banco.value} value={banco.value}>
                            {banco.label} ({banco.count})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Dropdown Cargo */}
                  {filtersData?.cargos && filtersData.cargos.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        <User className="h-3.5 w-3.5" />
                        Cargo
                      </label>
                      <select
                        value={globalSelectedCargo || ""}
                        onChange={(e) => {
                          setGlobalSelectedCargo(e.target.value || null);
                        }}
                        className="h-10 w-full px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground transition-colors hover:border-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="">Todos os cargos</option>
                        {filtersData.cargos.map((cargo: any) => (
                          <option key={cargo.value} value={cargo.value}>
                            {cargo.label} ({cargo.count})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Dropdown Status - APENAS ADMIN */}
                  {isAdminOrSupervisor && filtersData?.status && filtersData.status.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        <Activity className="h-3.5 w-3.5" />
                        Status do Caso
                      </label>
                      <select
                        value={globalSelectedStatus || ""}
                        onChange={(e) => {
                          setGlobalSelectedStatus(e.target.value || null);
                        }}
                        className="h-10 w-full px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground transition-colors hover:border-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="">Todos os status</option>
                        {filtersData.status.map((status: any) => (
                          <option key={status.value} value={status.value}>
                            {status.label} ({status.count})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Toggle excluir SIAPE/GOV + Limpar filtros */}
                <div className="flex items-center gap-4 pt-1 flex-wrap">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={globalExcludeSiape}
                      onClick={() => setGlobalExcludeSiape(v => !v)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${globalExcludeSiape ? 'bg-primary' : 'bg-muted'}`}
                    >
                      <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg transition-transform ${globalExcludeSiape ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                    <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground cursor-pointer select-none" onClick={() => setGlobalExcludeSiape(v => !v)}>
                      <ShieldOff className="h-3.5 w-3.5" />
                      Excluir SIAPE/GOV
                    </label>
                  </div>

                  {(globalSelectedBanco || globalSelectedCargo || globalSelectedStatus || globalExcludeSiape) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setGlobalSelectedBanco(null);
                        setGlobalSelectedCargo(null);
                        setGlobalSelectedStatus(null);
                        setGlobalExcludeSiape(false);
                      }}
                      className="h-9"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Limpar filtros
                    </Button>
                  )}
                </div>
              </div>
            </Card>

            {renderCaseList(globalCases, true, loadingGlobal, errorGlobal)}

            {/* Paginação */}
            {globalTotal > 0 && (
              <Pagination
                currentPage={globalPage}
                totalPages={globalTotalPages}
                totalItems={globalTotal}
                itemsPerPage={globalPageSize}
                onPageChange={setGlobalPage}
                onItemsPerPageChange={(size) => {
                  setGlobalPageSize(size);
                }}
                itemsPerPageOptions={[20, 50, 100]}
              />
            )}
          </div>
        </TabsContent>

        <TabsContent value="mine" className="mt-6">
          <div className="space-y-6">
            {/* KPI Cards para Meus Atendimentos */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              <KPICard
                title="Total de Casos"
                value={myStats?.totalCases || 0}
                icon={Target}
              />
              <KPICard
                title="Casos Ativos"
                value={myStats?.activeCases || 0}
                icon={AlertCircle}
              />
              <KPICard
                title="Casos Finalizados"
                value={myStats?.completedCases || 0}
                icon={CheckCircle}
              />
              <KPICard
                title="Taxa de Conversão"
                value={`${myStats?.conversionRate || 0}%`}
                icon={TrendingUp}
              />
              <KPICard
                title="Volume Financeiro"
                value={`R$ ${(myStats?.totalVolume || 0).toLocaleString('pt-BR')}`}
                icon={DollarSign}
              />
            </div>

            {/* Filtros - Sistema Clientes */}
            <Card className="p-4 space-y-4">
              {/* Busca */}
              <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome, CPF ou matrícula..."
                    value={mySearchTerm}
                    onChange={(e) => {
                      setMySearchTerm(e.target.value);
                    }}
                    className="pl-10"
                  />
                </div>
                <div className="text-sm text-muted-foreground">
                  {myTotal} {myTotal === 1 ? 'caso' : 'casos'}
                </div>
              </div>

              {/* Filtros Rápidos - Dropdowns */}
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Dropdown Banco */}
                  {filtersData?.bancos && filtersData.bancos.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        <Building2 className="h-3.5 w-3.5" />
                        Banco
                      </label>
                      <select
                        value={mySelectedBanco || ""}
                        onChange={(e) => {
                          setMySelectedBanco(e.target.value || null);
                        }}
                        className="h-10 w-full px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground transition-colors hover:border-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="">Todos os bancos</option>
                        {filtersData.bancos.map((banco: any) => (
                          <option key={banco.value} value={banco.value}>
                            {banco.label} ({banco.count})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Dropdown Cargo */}
                  {filtersData?.cargos && filtersData.cargos.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        <User className="h-3.5 w-3.5" />
                        Cargo
                      </label>
                      <select
                        value={mySelectedCargo || ""}
                        onChange={(e) => {
                          setMySelectedCargo(e.target.value || null);
                        }}
                        className="h-10 w-full px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground transition-colors hover:border-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="">Todos os cargos</option>
                        {filtersData.cargos.map((cargo: any) => (
                          <option key={cargo.value} value={cargo.value}>
                            {cargo.label} ({cargo.count})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Dropdown Status */}
                  {filtersData?.status && filtersData.status.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        <Activity className="h-3.5 w-3.5" />
                        Status do Caso
                      </label>
                      <select
                        value={mySelectedStatus || ""}
                        onChange={(e) => {
                          setMySelectedStatus(e.target.value || null);
                        }}
                        className="h-10 w-full px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground transition-colors hover:border-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="">Todos os status</option>
                        {filtersData.status.map((status: any) => (
                          <option key={status.value} value={status.value}>
                            {status.label} ({status.count})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Toggle excluir SIAPE/GOV + Limpar filtros — Meus Atendimentos */}
                <div className="flex items-center gap-4 pt-1 flex-wrap">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={myExcludeSiape}
                      onClick={() => setMyExcludeSiape(v => !v)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${myExcludeSiape ? 'bg-primary' : 'bg-muted'}`}
                    >
                      <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg transition-transform ${myExcludeSiape ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                    <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground cursor-pointer select-none" onClick={() => setMyExcludeSiape(v => !v)}>
                      <ShieldOff className="h-3.5 w-3.5" />
                      Excluir SIAPE/GOV
                    </label>
                  </div>

                  {(mySelectedBanco || mySelectedCargo || mySelectedStatus || myExcludeSiape) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setMySelectedBanco(null);
                        setMySelectedCargo(null);
                        setMySelectedStatus(null);
                        setMyExcludeSiape(false);
                      }}
                      className="h-9"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Limpar filtros
                    </Button>
                  )}
                </div>
              </div>
            </Card>

            {/* <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Meus Atendimentos</h2>
              <Badge variant="secondary">
                {myTotal} {myTotal === 1 ? 'atendimento' : 'atendimentos'}
              </Badge>
            </div> */}

            {/* Tabela de Casos */}
            <CasesTable
              cases={myCases}
              onViewCase={handleViewCase}
              loading={loadingMine}
              className="mt-4"
              showFilters={false}
            />

            {/* PaginaÃ§Ã£o */}
            {myTotal > 0 && (
              <Pagination
                currentPage={myPage}
                totalPages={myTotalPages}
                totalItems={myTotal}
                itemsPerPage={myPageSize}
                onPageChange={setMyPage}
                onItemsPerPageChange={(size) => {
                  setMyPageSize(size);
                }}
                itemsPerPageOptions={[20, 50, 100]}
              />
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function EsteiraPage() {
  return (
    <Suspense fallback={<div>Carregando...</div>}>
      <EsteiraPageContent />
    </Suspense>
  );
}


