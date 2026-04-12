"use client";
import { useLiveCaseEvents } from "@/lib/ws";
import { useState, useEffect, useRef, Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Badge, EsteiraCard, Tabs, TabsContent, TabsList, TabsTrigger, CaseSkeleton, KPICard, CasesTable, Pagination } from "@lifecalling/ui";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useMyStats } from "@/lib/hooks";
import { useAuth } from "@/lib/auth";
import { buildCasesQuery } from "@/lib/query";
import { toast } from "sonner";
import { Search, X, Building2, Activity, CheckCircle, AlertCircle, TrendingUp, DollarSign, Target, User, Phone, Briefcase, Hash, Calendar, CreditCard, MapPin, Copy, ChevronLeft, ChevronRight, Download, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SiapeMode = 'all' | 'only' | 'exclude';

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

const DEFAULT_TAB = "never_attended";
const RETURNED_TAB = "returned_to_pipeline";

// Combobox de banco com autocomplete
function BancoCombobox({
  value,
  onSelect,
  bancos,
}: {
  value: string | null;
  onSelect: (v: string | null) => void;
  bancos: Array<{ value: string; label: string; count: number }>;
}) {
  const [inputText, setInputText] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sincronizar label quando valor externo muda
  useEffect(() => {
    if (value) {
      const found = bancos.find((b) => b.value === value);
      setInputText(found ? found.label : value);
    } else {
      setInputText("");
    }
  }, [value, bancos]);

  // Fechar ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        // Se digitou mas não selecionou, restaurar label do valor atual
        if (value) {
          const found = bancos.find((b) => b.value === value);
          setInputText(found ? found.label : value);
        } else {
          setInputText("");
        }
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [value, bancos]);

  const filtered = useMemo(() => {
    if (!inputText || (value && bancos.find((b) => b.value === value)?.label === inputText)) {
      return bancos;
    }
    return bancos.filter((b) =>
      b.label.toLowerCase().includes(inputText.toLowerCase())
    );
  }, [inputText, bancos, value]);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          value={inputText}
          onChange={(e) => {
            setInputText(e.target.value);
            onSelect(null); // limpa seleção ao digitar
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Todos os bancos"
          className="h-10 w-full px-3 py-2 pr-16 rounded-lg border border-border bg-card text-sm text-foreground transition-colors hover:border-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {value && (
            <button
              type="button"
              onClick={() => { onSelect(null); setInputText(""); setOpen(false); }}
              className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-lg shadow-lg max-h-56 overflow-auto">
          <div
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { onSelect(null); setInputText(""); setOpen(false); }}
            className="px-3 py-2 text-sm text-muted-foreground hover:bg-muted cursor-pointer"
          >
            Todos os bancos
          </div>
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">Nenhum banco encontrado</div>
          )}
          {filtered.map((banco) => (
            <div
              key={banco.value}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onSelect(banco.value); setInputText(banco.label); setOpen(false); }}
              className={`px-3 py-2 text-sm cursor-pointer hover:bg-muted flex items-center justify-between gap-2 ${value === banco.value ? 'bg-primary/10 text-primary font-medium' : 'text-foreground'}`}
            >
              <span>{banco.label}</span>
              <span className="text-xs text-muted-foreground shrink-0">({banco.count})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Filtro SIAPE em 3 estados
function SiapeFilter({ value, onChange }: { value: SiapeMode; onChange: (v: SiapeMode) => void }) {
  const opts: { value: SiapeMode; label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'only', label: 'Apenas' },
    { value: 'exclude', label: 'Excluir' },
  ];
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        SIAPE
      </label>
      <div className="flex h-10 items-center rounded-lg border border-border bg-card overflow-hidden">
        {opts.map((opt, i) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex-1 h-full text-xs font-medium transition-colors ${
              i > 0 ? 'border-l border-border' : ''
            } ${
              value === opt.value
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function EsteiraPageContent() {
  useLiveCaseEvents();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState(DEFAULT_TAB);

  const isAdminOrSupervisor = user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'supervisor';

  // Estados — Global
  const [globalPage, setGlobalPage] = useState(1);
  const [globalPageSize, setGlobalPageSize] = useState(20);
  const [globalSearchTerm, setGlobalSearchTerm] = useState("");
  const [globalSelectedBanco, setGlobalSelectedBanco] = useState<string | null>(null);
  const [globalSelectedCargo, setGlobalSelectedCargo] = useState<string | null>(null);
  const [globalSelectedStatus, setGlobalSelectedStatus] = useState<string | null>(null);
  const [globalSelectedAgentId, setGlobalSelectedAgentId] = useState<string | null>(null);
  const [globalSiapeMode, setGlobalSiapeMode] = useState<SiapeMode>('all');
  const [exportingCsv, setExportingCsv] = useState(false);

  // Estados — Casos Novos
  const [neverAttendedPage, setNeverAttendedPage] = useState(1);
  const [neverAttendedPageSize, setNeverAttendedPageSize] = useState(20);
  const [neverAttendedSearchTerm, setNeverAttendedSearchTerm] = useState("");
  const [neverAttendedSelectedBanco, setNeverAttendedSelectedBanco] = useState<string | null>(null);
  const [neverAttendedSelectedCargo, setNeverAttendedSelectedCargo] = useState<string | null>(null);
  const [neverAttendedSiapeMode, setNeverAttendedSiapeMode] = useState<SiapeMode>('all');

  // Estados — Casos Retornados
  const [returnedPage, setReturnedPage] = useState(1);
  const [returnedPageSize, setReturnedPageSize] = useState(20);
  const [returnedSearchTerm, setReturnedSearchTerm] = useState("");
  const [returnedSelectedBanco, setReturnedSelectedBanco] = useState<string | null>(null);
  const [returnedSelectedCargo, setReturnedSelectedCargo] = useState<string | null>(null);
  const [returnedSelectedAgentId, setReturnedSelectedAgentId] = useState<string | null>(null);
  const [returnedSiapeMode, setReturnedSiapeMode] = useState<SiapeMode>('all');

  // Estados — Meus Atendimentos
  const [myPage, setMyPage] = useState(1);
  const [myPageSize, setMyPageSize] = useState(20);
  const [mySearchTerm, setMySearchTerm] = useState("");
  const [mySelectedBanco, setMySelectedBanco] = useState<string | null>(null);
  const [mySelectedCargo, setMySelectedCargo] = useState<string | null>(null);
  const [mySelectedStatus, setMySelectedStatus] = useState<string | null>(null);
  const [mySiapeMode, setMySiapeMode] = useState<SiapeMode>('all');

  // Estados — Esteira
  const [esteiraCurrentIndex, setEsteiraCurrentIndex] = useState(0);
  const [esteiraSelectedBanco, setEsteiraSelectedBanco] = useState<string | null>(null);
  const [esteiraSelectedCargo, setEsteiraSelectedCargo] = useState<string | null>(null);
  const [esteiraSelectedStatus, setEsteiraSelectedStatus] = useState<string | null>(null);
  const [esteiraSearchTerm, setEsteiraSearchTerm] = useState("");

  const queryClient = useQueryClient();

  // Reset página quando filtros mudam
  useEffect(() => {
    setGlobalPage(1);
  }, [globalSelectedBanco, globalSelectedCargo, globalSelectedStatus, globalSelectedAgentId, globalSearchTerm, globalSiapeMode]);

  useEffect(() => {
    setNeverAttendedPage(1);
  }, [neverAttendedSelectedBanco, neverAttendedSelectedCargo, neverAttendedSearchTerm, neverAttendedSiapeMode]);

  useEffect(() => {
    setReturnedPage(1);
  }, [returnedSelectedBanco, returnedSelectedCargo, returnedSelectedAgentId, returnedSearchTerm, returnedSiapeMode]);

  useEffect(() => {
    setMyPage(1);
  }, [mySelectedBanco, mySelectedCargo, mySelectedStatus, mySearchTerm, mySiapeMode]);

  useEffect(() => { setGlobalPage(1); }, [globalPageSize]);
  useEffect(() => { setNeverAttendedPage(1); }, [neverAttendedPageSize]);
  useEffect(() => { setReturnedPage(1); }, [returnedPageSize]);
  useEffect(() => { setMyPage(1); }, [myPageSize]);

  // Restaurar estado da esteira quando a página carregar
  useEffect(() => {
    const savedPage = searchParams.get('page');
    const savedTab = searchParams.get('tab');
    const savedStatus = searchParams.get('status');
    const savedSearch = searchParams.get('search');
    const savedBanco = searchParams.get('banco');
    const savedCargo = searchParams.get('cargo');
    const savedAgentId = searchParams.get('agent_id');
    const savedSiape = searchParams.get('siape');

    if (savedTab && (savedTab === 'mine' || savedTab === 'global' || savedTab === DEFAULT_TAB || savedTab === RETURNED_TAB)) {
      setActiveTab(savedTab);
    }

    if (savedPage) {
      const pageNum = parseInt(savedPage);
      const tabToUse = savedTab || DEFAULT_TAB;
      if (tabToUse === 'mine') setMyPage(pageNum);
      else if (tabToUse === DEFAULT_TAB) setNeverAttendedPage(pageNum);
      else if (tabToUse === RETURNED_TAB) setReturnedPage(pageNum);
      else setGlobalPage(pageNum);
    }

    if (savedStatus) {
      const tabToUse = savedTab || DEFAULT_TAB;
      const firstStatus = savedStatus.split(',').map((item) => item.trim()).find(Boolean) || null;
      if (tabToUse === 'mine') setMySelectedStatus(firstStatus);
      else if (tabToUse === 'global') setGlobalSelectedStatus(firstStatus);
    }

    if (savedSearch) {
      const tabToUse = savedTab || DEFAULT_TAB;
      if (tabToUse === 'mine') setMySearchTerm(savedSearch);
      else if (tabToUse === DEFAULT_TAB) setNeverAttendedSearchTerm(savedSearch);
      else if (tabToUse === RETURNED_TAB) setReturnedSearchTerm(savedSearch);
      else setGlobalSearchTerm(savedSearch);
    }

    if (savedBanco) {
      const tabToUse = savedTab || DEFAULT_TAB;
      if (tabToUse === 'mine') setMySelectedBanco(savedBanco);
      else if (tabToUse === DEFAULT_TAB) setNeverAttendedSelectedBanco(savedBanco);
      else if (tabToUse === RETURNED_TAB) setReturnedSelectedBanco(savedBanco);
      else setGlobalSelectedBanco(savedBanco);
    }

    if (savedCargo) {
      const tabToUse = savedTab || DEFAULT_TAB;
      if (tabToUse === 'mine') setMySelectedCargo(savedCargo);
      else if (tabToUse === DEFAULT_TAB) setNeverAttendedSelectedCargo(savedCargo);
      else if (tabToUse === RETURNED_TAB) setReturnedSelectedCargo(savedCargo);
      else setGlobalSelectedCargo(savedCargo);
    }

    if (savedAgentId) {
      const tabToUse = savedTab || DEFAULT_TAB;
      if (tabToUse === RETURNED_TAB) setReturnedSelectedAgentId(savedAgentId);
      else if (tabToUse === 'global') setGlobalSelectedAgentId(savedAgentId);
    }

    if (savedSiape === 'all' || savedSiape === 'only' || savedSiape === 'exclude') {
      const tabToUse = savedTab || DEFAULT_TAB;
      if (tabToUse === 'mine') setMySiapeMode(savedSiape);
      else if (tabToUse === DEFAULT_TAB) setNeverAttendedSiapeMode(savedSiape);
      else if (tabToUse === RETURNED_TAB) setReturnedSiapeMode(savedSiape);
      else setGlobalSiapeMode(savedSiape);
    }
  }, [searchParams]);

  const { data: myStats } = useMyStats();

  // Helpers para resolver banco/siape no query
  const resolveGlobalBancoParams = () => {
    if (globalSiapeMode === 'only') return { banco: 'SIAPE', exclude_siape: undefined };
    if (globalSiapeMode === 'exclude') return { banco: globalSelectedBanco || undefined, exclude_siape: true };
    return { banco: globalSelectedBanco || undefined, exclude_siape: undefined };
  };

  const resolveNeverAttendedBancoParams = () => {
    if (neverAttendedSiapeMode === 'only') return { banco: 'SIAPE', exclude_siape: undefined };
    if (neverAttendedSiapeMode === 'exclude') return { banco: neverAttendedSelectedBanco || undefined, exclude_siape: true };
    return { banco: neverAttendedSelectedBanco || undefined, exclude_siape: undefined };
  };

  const resolveReturnedBancoParams = () => {
    if (returnedSiapeMode === 'only') return { banco: 'SIAPE', exclude_siape: undefined };
    if (returnedSiapeMode === 'exclude') return { banco: returnedSelectedBanco || undefined, exclude_siape: true };
    return { banco: returnedSelectedBanco || undefined, exclude_siape: undefined };
  };

  const resolveMyBancoParams = () => {
    if (mySiapeMode === 'only') return { banco: 'SIAPE', exclude_siape: undefined };
    if (mySiapeMode === 'exclude') return { banco: mySelectedBanco || undefined, exclude_siape: true };
    return { banco: mySelectedBanco || undefined, exclude_siape: undefined };
  };

  // Query — Global
  const { data: globalData, isLoading: loadingGlobal, error: errorGlobal } = useQuery({
    queryKey: [
      "cases", "global",
      globalPage, globalPageSize,
      globalSelectedBanco, globalSelectedCargo, globalSelectedStatus, globalSelectedAgentId,
      globalSearchTerm, globalSiapeMode,
    ],
    queryFn: async () => {
      const isManager = ["super_admin", "admin", "supervisor"].includes(user?.role ?? "");
      const { banco, exclude_siape } = resolveGlobalBancoParams();
      const orderBy = banco ? `financiamentos_banco_desc:${banco}` : "financiamentos_desc";

      const params = buildCasesQuery(
        isManager
          ? {
              page: globalPage, page_size: globalPageSize, order: orderBy,
              q: globalSearchTerm, banco, cargo: globalSelectedCargo || undefined,
              status: globalSelectedStatus ? [globalSelectedStatus] : undefined,
              agent_id: globalSelectedAgentId ? Number(globalSelectedAgentId) : undefined,
              exclude_siape,
            }
          : {
              page: globalPage, page_size: globalPageSize, order: orderBy,
              q: globalSearchTerm, banco, cargo: globalSelectedCargo || undefined,
              status: ["novo"], exclude_siape,
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

  // Query — Casos Novos
  const { data: neverAttendedData, isLoading: loadingNeverAttended, error: errorNeverAttended } = useQuery({
    queryKey: [
      "cases", "never_attended",
      neverAttendedPage, neverAttendedPageSize,
      neverAttendedSelectedBanco, neverAttendedSelectedCargo,
      neverAttendedSearchTerm, neverAttendedSiapeMode,
    ],
    queryFn: async () => {
      const { banco, exclude_siape } = resolveNeverAttendedBancoParams();
      const orderBy = banco ? `financiamentos_banco_desc:${banco}` : "financiamentos_desc";

      const params = buildCasesQuery({
        page: neverAttendedPage,
        page_size: neverAttendedPageSize,
        order: orderBy,
        q: neverAttendedSearchTerm,
        banco,
        cargo: neverAttendedSelectedCargo || undefined,
        status: ["novo"],
        never_attended: true,
        exclude_siape,
      });

      const response = await api.get(`/cases?${params.toString()}`);
      return response.data;
    },
    staleTime: 5000,
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
    retry: 2,
  });

  const neverAttendedCases = neverAttendedData?.items ?? [];
  const neverAttendedTotal = neverAttendedData?.total ?? 0;
  const neverAttendedTotalPages = Math.ceil(neverAttendedTotal / neverAttendedPageSize);

  // Query — Casos Retornados
  const { data: returnedData, isLoading: loadingReturned, error: errorReturned } = useQuery({
    queryKey: [
      "cases", "returned_to_pipeline",
      returnedPage, returnedPageSize,
      returnedSelectedBanco, returnedSelectedCargo, returnedSelectedAgentId,
      returnedSearchTerm, returnedSiapeMode,
    ],
    queryFn: async () => {
      const { banco, exclude_siape } = resolveReturnedBancoParams();
      const orderBy = banco ? `financiamentos_banco_desc:${banco}` : "financiamentos_desc";

      const params = buildCasesQuery({
        page: returnedPage,
        page_size: returnedPageSize,
        order: orderBy,
        q: returnedSearchTerm,
        banco,
        cargo: returnedSelectedCargo || undefined,
        agent_id: returnedSelectedAgentId ? Number(returnedSelectedAgentId) : undefined,
        status: ["novo"],
        returned_to_pipeline: true,
        exclude_siape,
      });

      const response = await api.get(`/cases?${params.toString()}`);
      return response.data;
    },
    staleTime: 5000,
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
    retry: 2,
  });

  const returnedCases = returnedData?.items ?? [];
  const returnedTotal = returnedData?.total ?? 0;
  const returnedTotalPages = Math.ceil(returnedTotal / returnedPageSize);

  // Query — Meus Atendimentos
  const { data: myData, isLoading: loadingMine, error: errorMine } = useQuery({
    queryKey: [
      "cases", "mine",
      myPage, myPageSize,
      mySelectedBanco, mySelectedCargo, mySelectedStatus,
      mySearchTerm, mySiapeMode,
    ],
    queryFn: async () => {
      const { banco, exclude_siape } = resolveMyBancoParams();
      const orderBy = banco ? `financiamentos_banco_desc:${banco}` : "financiamentos_desc";

      const params = buildCasesQuery({
        page: myPage, page_size: myPageSize, order: orderBy,
        q: mySearchTerm, banco, cargo: mySelectedCargo || undefined,
        status: mySelectedStatus ? [mySelectedStatus] : undefined,
        mine: true, exclude_siape,
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

  // Query — Esteira
  const { data: esteiraData, isLoading: loadingEsteira, error: errorEsteira } = useQuery({
    queryKey: ["cases", "esteira", esteiraSelectedBanco, esteiraSelectedCargo, esteiraSelectedStatus, esteiraSearchTerm],
    queryFn: async () => {
      const params = buildCasesQuery({
        page: 1, page_size: 1000, order: "id_desc",
        q: esteiraSearchTerm, status: ["novo"],
      });
      const response = await api.get(`/cases?${params.toString()}`);
      return response.data;
    },
    onError: (error) => {
      console.error('[Esteira] Error:', (error as any)?.response?.data);
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

  const { data: currentCaseDetails } = useQuery({
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

  const handleNextCase = () => {
    if (esteiraCurrentIndex < esteiraCases.length - 1) setEsteiraCurrentIndex(esteiraCurrentIndex + 1);
  };
  const handlePreviousCase = () => {
    if (esteiraCurrentIndex > 0) setEsteiraCurrentIndex(esteiraCurrentIndex - 1);
  };

  useEffect(() => {
    setEsteiraCurrentIndex(0);
  }, [esteiraSelectedBanco, esteiraSelectedCargo, esteiraSelectedStatus, esteiraSearchTerm]);

  const assignCaseEsteiraMutation = useMutation({
    mutationFn: async (caseId: number) => {
      const response = await api.post(`/cases/${caseId}/assign`);
      return { data: response.data, caseId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      queryClient.invalidateQueries({ queryKey: ["case", result.caseId] });
      toast.success("Atendimento atribuído com sucesso!");
    },
    onError: () => toast.error("Erro ao atribuir atendimento. Tente novamente."),
  });

  const assignCaseMutation = useMutation({
    mutationFn: async (caseId: number) => {
      const response = await api.post(`/cases/${caseId}/assign`);
      return { data: response.data, caseId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      toast.success("Atendimento atribuído com sucesso!");
      router.push(`/casos/${result.caseId}`);
    },
    onError: () => toast.error("Erro ao atribuir atendimento. Tente novamente."),
  });

  const handleExportCsv = async () => {
    if (!isAdminOrSupervisor) return;
    setExportingCsv(true);
    try {
      const params = new URLSearchParams();
      let banco: string | undefined;
      let exclude_siape: boolean | undefined;

      if (activeTab === DEFAULT_TAB) {
        if (neverAttendedSearchTerm) params.set("q", neverAttendedSearchTerm);
        if (neverAttendedSelectedCargo) params.set("cargo", neverAttendedSelectedCargo);
        params.set("status", "novo");
        params.set("never_attended", "true");
        ({ banco, exclude_siape } = resolveNeverAttendedBancoParams());
      } else if (activeTab === RETURNED_TAB) {
        if (returnedSearchTerm) params.set("q", returnedSearchTerm);
        if (returnedSelectedCargo) params.set("cargo", returnedSelectedCargo);
        if (returnedSelectedAgentId) params.set("agent_id", returnedSelectedAgentId);
        params.set("status", "novo");
        params.set("returned_to_pipeline", "true");
        ({ banco, exclude_siape } = resolveReturnedBancoParams());
      } else {
        if (globalSearchTerm) params.set("q", globalSearchTerm);
        if (globalSelectedCargo) params.set("cargo", globalSelectedCargo);
        if (globalSelectedStatus) params.set("status", globalSelectedStatus);
        if (globalSelectedAgentId) params.set("agent_id", globalSelectedAgentId);
        ({ banco, exclude_siape } = resolveGlobalBancoParams());
      }

      if (banco) params.set("entidade", banco);
      if (exclude_siape) params.set("exclude_siape", "true");

      const response = await api.get(`/cases/export/csv?${params.toString()}`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([response.data], { type: "text/csv;charset=utf-8;" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `casos_${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Erro ao exportar CSV. Tente novamente.");
    } finally {
      setExportingCsv(false);
    }
  };

  const handlePegarAtendimento = (caseId: number) => assignCaseMutation.mutate(caseId);
  const handlePegarAtendimentoEsteira = (caseId: number) => assignCaseEsteiraMutation.mutate(caseId);

  const handleViewCase = (caseId: number) => {
    const isMyTab = activeTab === 'mine';
    const isNeverAttendedTab = activeTab === DEFAULT_TAB;
    const isReturnedTab = activeTab === RETURNED_TAB;
    const currentPage = isMyTab
      ? myPage
      : isReturnedTab
        ? returnedPage
        : isNeverAttendedTab
        ? neverAttendedPage
        : globalPage;
    const currentStatusFilter = isNeverAttendedTab || isReturnedTab
      ? null
      : isMyTab
        ? mySelectedStatus
        : globalSelectedStatus;
    const currentSearchTerm = isMyTab
      ? mySearchTerm
      : isReturnedTab
        ? returnedSearchTerm
      : isNeverAttendedTab
        ? neverAttendedSearchTerm
        : globalSearchTerm;
    const currentBancoFilter = isMyTab
      ? mySelectedBanco
      : isReturnedTab
        ? returnedSelectedBanco
        : isNeverAttendedTab
        ? neverAttendedSelectedBanco
        : globalSelectedBanco;
    const currentCargoFilter = isMyTab
      ? mySelectedCargo
      : isReturnedTab
        ? returnedSelectedCargo
        : isNeverAttendedTab
        ? neverAttendedSelectedCargo
        : globalSelectedCargo;
    const currentAgentIdFilter = isReturnedTab
      ? returnedSelectedAgentId
      : isMyTab || isNeverAttendedTab
        ? null
        : globalSelectedAgentId;
    const currentSiapeMode = isMyTab
      ? mySiapeMode
      : isReturnedTab
        ? returnedSiapeMode
      : isNeverAttendedTab
        ? neverAttendedSiapeMode
        : globalSiapeMode;
    const currentList = isMyTab
      ? myCases
      : isReturnedTab
        ? returnedCases
      : isNeverAttendedTab
        ? neverAttendedCases
        : globalCases;
    const tabToSave = isMyTab ? 'mine' : isReturnedTab ? RETURNED_TAB : isNeverAttendedTab ? DEFAULT_TAB : 'global';

    sessionStorage.setItem('esteira-page', currentPage.toString());
    sessionStorage.setItem('esteira-tab', tabToSave);
    sessionStorage.setItem('esteira-filters', JSON.stringify({
      status: currentStatusFilter,
      search: currentSearchTerm,
      banco: currentBancoFilter,
      cargo: currentCargoFilter,
      agent_id: currentAgentIdFilter,
      siape: currentSiapeMode,
    }));
    sessionStorage.setItem('esteira-case-ids', JSON.stringify((currentList ?? []).map((c) => c.id)));

    router.push(`/casos/${caseId}`);
  };

  const { data: filtersData } = useQuery({
    queryKey: ["client-filters"],
    queryFn: async () => {
      const response = await api.get("/clients/filters");
      return response.data;
    },
    staleTime: 60000,
  });

  const { data: agentUsers = [] } = useQuery({
    queryKey: ["users", "pipeline-agent-filter"],
    queryFn: async () => {
      const response = await api.get("/users?active=true&limit=200");
      return (response.data ?? []).filter((u: any) =>
        ["admin", "supervisor", "atendente"].includes(u.role)
      );
    },
    enabled: isAdminOrSupervisor,
    staleTime: 60000,
  });

  const bancos: Array<{ value: string; label: string; count: number }> = filtersData?.bancos ?? [];

  const renderCaseList = (cases: Case[], showPegarButton: boolean, isLoading: boolean, error?: any) => {
    if (isLoading) {
      return (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
          {Array.from({ length: 6 }, (_, i) => <CaseSkeleton key={i} />)}
        </div>
      );
    }

    if (error) {
      return (
        <div className="col-span-full text-center py-8 text-destructive">
          Erro ao carregar atendimentos. Tente novamente.
          <br />
          <button onClick={() => queryClient.invalidateQueries({ queryKey: ["cases"] })} className="mt-2 text-sm underline">
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

  const neverAttendedHasFilters = neverAttendedSelectedBanco || neverAttendedSelectedCargo || neverAttendedSiapeMode !== 'all';
  const returnedHasFilters = returnedSelectedBanco || returnedSelectedCargo || returnedSelectedAgentId || returnedSiapeMode !== 'all';
  const globalHasFilters = globalSelectedBanco || globalSelectedCargo || globalSelectedStatus || globalSelectedAgentId || globalSiapeMode !== 'all';
  const myHasFilters = mySelectedBanco || mySelectedCargo || mySelectedStatus || mySiapeMode !== 'all';

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Esteira de Atendimentos</h1>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value={DEFAULT_TAB}>Casos Novos ({neverAttendedTotal})</TabsTrigger>
          <TabsTrigger value={RETURNED_TAB}>Casos Retornados ({returnedTotal})</TabsTrigger>
          <TabsTrigger value="global">Global ({globalTotal})</TabsTrigger>
          <TabsTrigger value="mine">Meus Atendimentos ({myTotal})</TabsTrigger>
        </TabsList>

        {/* ===== CASOS NOVOS ===== */}
        <TabsContent value={DEFAULT_TAB} className="mt-6">
          <div className="space-y-6">
            <Card className="p-4 space-y-4">
              <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome, CPF ou matrícula..."
                    value={neverAttendedSearchTerm}
                    onChange={(e) => setNeverAttendedSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="text-sm text-muted-foreground">
                  {neverAttendedTotal} {neverAttendedTotal === 1 ? 'caso novo' : 'casos novos'}
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

              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {bancos.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        <Building2 className="h-3.5 w-3.5" />
                        Banco
                      </label>
                      <BancoCombobox
                        value={neverAttendedSiapeMode === 'only' ? 'SIAPE' : neverAttendedSelectedBanco}
                        onSelect={setNeverAttendedSelectedBanco}
                        bancos={bancos}
                      />
                    </div>
                  )}

                  {filtersData?.cargos && filtersData.cargos.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        <User className="h-3.5 w-3.5" />
                        Cargo
                      </label>
                      <select
                        value={neverAttendedSelectedCargo || ""}
                        onChange={(e) => setNeverAttendedSelectedCargo(e.target.value || null)}
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

                  <SiapeFilter value={neverAttendedSiapeMode} onChange={setNeverAttendedSiapeMode} />
                </div>

                {neverAttendedHasFilters && (
                  <div className="flex items-center pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setNeverAttendedSelectedBanco(null);
                        setNeverAttendedSelectedCargo(null);
                        setNeverAttendedSiapeMode('all');
                      }}
                      className="h-8"
                    >
                      <X className="h-3.5 w-3.5 mr-1.5" />
                      Limpar filtros
                    </Button>
                  </div>
                )}
              </div>
            </Card>

            {renderCaseList(neverAttendedCases, true, loadingNeverAttended, errorNeverAttended)}

            {neverAttendedTotal > 0 && (
              <Pagination
                currentPage={neverAttendedPage}
                totalPages={neverAttendedTotalPages}
                totalItems={neverAttendedTotal}
                itemsPerPage={neverAttendedPageSize}
                onPageChange={setNeverAttendedPage}
                onItemsPerPageChange={(size) => setNeverAttendedPageSize(size)}
                itemsPerPageOptions={[20, 50, 100]}
              />
            )}
          </div>
        </TabsContent>

        {/* ===== CASOS RETORNADOS ===== */}
        <TabsContent value={RETURNED_TAB} className="mt-6">
          <div className="space-y-6">
            <Card className="p-4 space-y-4">
              <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome, CPF ou matrícula..."
                    value={returnedSearchTerm}
                    onChange={(e) => setReturnedSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="text-sm text-muted-foreground">
                  {returnedTotal} {returnedTotal === 1 ? 'caso retornado' : 'casos retornados'}
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

              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {bancos.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        <Building2 className="h-3.5 w-3.5" />
                        Banco
                      </label>
                      <BancoCombobox
                        value={returnedSiapeMode === 'only' ? 'SIAPE' : returnedSelectedBanco}
                        onSelect={setReturnedSelectedBanco}
                        bancos={bancos}
                      />
                    </div>
                  )}

                  {filtersData?.cargos && filtersData.cargos.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        <User className="h-3.5 w-3.5" />
                        Cargo
                      </label>
                      <select
                        value={returnedSelectedCargo || ""}
                        onChange={(e) => setReturnedSelectedCargo(e.target.value || null)}
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

                  {isAdminOrSupervisor && agentUsers.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        <User className="h-3.5 w-3.5" />
                        Agente
                      </label>
                      <select
                        value={returnedSelectedAgentId || ""}
                        onChange={(e) => setReturnedSelectedAgentId(e.target.value || null)}
                        className="h-10 w-full px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground transition-colors hover:border-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="">Todos os agentes</option>
                        {agentUsers.map((agent: any) => (
                          <option key={agent.id} value={String(agent.id)}>
                            {agent.name} ({agent.role})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <SiapeFilter value={returnedSiapeMode} onChange={setReturnedSiapeMode} />
                </div>

                {returnedHasFilters && (
                  <div className="flex items-center pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setReturnedSelectedBanco(null);
                        setReturnedSelectedCargo(null);
                        setReturnedSelectedAgentId(null);
                        setReturnedSiapeMode('all');
                      }}
                      className="h-8"
                    >
                      <X className="h-3.5 w-3.5 mr-1.5" />
                      Limpar filtros
                    </Button>
                  </div>
                )}
              </div>
            </Card>

            {renderCaseList(returnedCases, true, loadingReturned, errorReturned)}

            {returnedTotal > 0 && (
              <Pagination
                currentPage={returnedPage}
                totalPages={returnedTotalPages}
                totalItems={returnedTotal}
                itemsPerPage={returnedPageSize}
                onPageChange={setReturnedPage}
                onItemsPerPageChange={(size) => setReturnedPageSize(size)}
                itemsPerPageOptions={[20, 50, 100]}
              />
            )}
          </div>
        </TabsContent>

        {/* ===== GLOBAL ===== */}
        <TabsContent value="global" className="mt-6">
          <div className="space-y-6">
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

              {/* Dropdowns + SIAPE */}
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  {/* Banco — combobox autocomplete */}
                  {bancos.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        <Building2 className="h-3.5 w-3.5" />
                        Banco
                      </label>
                      <BancoCombobox
                        value={globalSiapeMode === 'only' ? 'SIAPE' : globalSelectedBanco}
                        onSelect={setGlobalSelectedBanco}
                        bancos={bancos}
                      />
                    </div>
                  )}

                  {/* Cargo */}
                  {filtersData?.cargos && filtersData.cargos.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        <User className="h-3.5 w-3.5" />
                        Cargo
                      </label>
                      <select
                        value={globalSelectedCargo || ""}
                        onChange={(e) => setGlobalSelectedCargo(e.target.value || null)}
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

                  {/* Status — APENAS ADMIN */}
                  {isAdminOrSupervisor && filtersData?.status && filtersData.status.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        <Activity className="h-3.5 w-3.5" />
                        Status do Caso
                      </label>
                      <select
                        value={globalSelectedStatus || ""}
                        onChange={(e) => setGlobalSelectedStatus(e.target.value || null)}
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

                  {isAdminOrSupervisor && agentUsers.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        <User className="h-3.5 w-3.5" />
                        Agente
                      </label>
                      <select
                        value={globalSelectedAgentId || ""}
                        onChange={(e) => setGlobalSelectedAgentId(e.target.value || null)}
                        className="h-10 w-full px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground transition-colors hover:border-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="">Todos os agentes</option>
                        {agentUsers.map((agent: any) => (
                          <option key={agent.id} value={String(agent.id)}>
                            {agent.name} ({agent.role})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* SIAPE — 3 estados */}
                  <SiapeFilter value={globalSiapeMode} onChange={setGlobalSiapeMode} />
                </div>

                {/* Limpar filtros */}
                {globalHasFilters && (
                  <div className="flex items-center pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setGlobalSelectedBanco(null);
                        setGlobalSelectedCargo(null);
                        setGlobalSelectedStatus(null);
                        setGlobalSelectedAgentId(null);
                        setGlobalSiapeMode('all');
                      }}
                      className="h-8"
                    >
                      <X className="h-3.5 w-3.5 mr-1.5" />
                      Limpar filtros
                    </Button>
                  </div>
                )}
              </div>
            </Card>

            {renderCaseList(globalCases, true, loadingGlobal, errorGlobal)}

            {globalTotal > 0 && (
              <Pagination
                currentPage={globalPage}
                totalPages={globalTotalPages}
                totalItems={globalTotal}
                itemsPerPage={globalPageSize}
                onPageChange={setGlobalPage}
                onItemsPerPageChange={(size) => setGlobalPageSize(size)}
                itemsPerPageOptions={[20, 50, 100]}
              />
            )}
          </div>
        </TabsContent>

        {/* ===== MEUS ATENDIMENTOS ===== */}
        <TabsContent value="mine" className="mt-6">
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              <KPICard title="Total de Casos" value={myStats?.totalCases || 0} icon={Target} />
              <KPICard title="Casos Ativos" value={myStats?.activeCases || 0} icon={AlertCircle} />
              <KPICard title="Casos Finalizados" value={myStats?.completedCases || 0} icon={CheckCircle} />
              <KPICard title="Taxa de Conversão" value={`${myStats?.conversionRate || 0}%`} icon={TrendingUp} />
              <KPICard title="Volume Financeiro" value={`R$ ${(myStats?.totalVolume || 0).toLocaleString('pt-BR')}`} icon={DollarSign} />
            </div>

            <Card className="p-4 space-y-4">
              {/* Busca */}
              <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome, CPF ou matrícula..."
                    value={mySearchTerm}
                    onChange={(e) => setMySearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="text-sm text-muted-foreground">
                  {myTotal} {myTotal === 1 ? 'caso' : 'casos'}
                </div>
              </div>

              {/* Dropdowns + SIAPE */}
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {/* Banco — combobox */}
                  {bancos.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        <Building2 className="h-3.5 w-3.5" />
                        Banco
                      </label>
                      <BancoCombobox
                        value={mySiapeMode === 'only' ? 'SIAPE' : mySelectedBanco}
                        onSelect={setMySelectedBanco}
                        bancos={bancos}
                      />
                    </div>
                  )}

                  {/* Cargo */}
                  {filtersData?.cargos && filtersData.cargos.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        <User className="h-3.5 w-3.5" />
                        Cargo
                      </label>
                      <select
                        value={mySelectedCargo || ""}
                        onChange={(e) => setMySelectedCargo(e.target.value || null)}
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

                  {/* Status */}
                  {filtersData?.status && filtersData.status.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        <Activity className="h-3.5 w-3.5" />
                        Status do Caso
                      </label>
                      <select
                        value={mySelectedStatus || ""}
                        onChange={(e) => setMySelectedStatus(e.target.value || null)}
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

                  {/* SIAPE — 3 estados */}
                  <SiapeFilter value={mySiapeMode} onChange={setMySiapeMode} />
                </div>

                {/* Limpar filtros */}
                {myHasFilters && (
                  <div className="flex items-center pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setMySelectedBanco(null);
                        setMySelectedCargo(null);
                        setMySelectedStatus(null);
                        setMySiapeMode('all');
                      }}
                      className="h-8"
                    >
                      <X className="h-3.5 w-3.5 mr-1.5" />
                      Limpar filtros
                    </Button>
                  </div>
                )}
              </div>
            </Card>

            <CasesTable
              cases={myCases}
              onViewCase={handleViewCase}
              loading={loadingMine}
              className="mt-4"
              showFilters={false}
            />

            {myTotal > 0 && (
              <Pagination
                currentPage={myPage}
                totalPages={myTotalPages}
                totalItems={myTotal}
                itemsPerPage={myPageSize}
                onPageChange={setMyPage}
                onItemsPerPageChange={(size) => setMyPageSize(size)}
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
