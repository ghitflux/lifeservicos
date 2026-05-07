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
import { Search, X, Building2, Activity, CheckCircle, AlertCircle, TrendingUp, DollarSign, Target, User, Briefcase, Download, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type SiapeMode = 'all' | 'only' | 'exclude';
type FilterOption = { value: string; label: string; count: number };

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
  banco_principal?: string;
  bancos?: string[];
  entidade?: string;
  valor_mensalidade?: number;
}

const DEFAULT_TAB = "never_attended";
const RETURNED_TAB = "returned_to_pipeline";

// Combobox com autocomplete para listas longas de filtro.
function SearchableCombobox({
  value,
  onSelect,
  options,
  placeholder,
  allLabel,
  emptyLabel,
}: {
  value: string | null;
  onSelect: (v: string | null) => void;
  options: FilterOption[];
  placeholder: string;
  allLabel: string;
  emptyLabel: string;
}) {
  const [inputText, setInputText] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sincronizar label quando valor externo muda
  useEffect(() => {
    if (value) {
      const found = options.find((b) => b.value === value);
      setInputText(found ? found.label : value);
    } else {
      setInputText("");
    }
  }, [value, options]);

  // Fechar ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        // Se digitou mas não selecionou, restaurar label do valor atual
        if (value) {
          const found = options.find((b) => b.value === value);
          setInputText(found ? found.label : value);
        } else {
          setInputText("");
        }
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [value, options]);

  const filtered = useMemo(() => {
    if (!inputText || (value && options.find((b) => b.value === value)?.label === inputText)) {
      return options;
    }
    return options.filter((b) =>
      b.label.toLowerCase().includes(inputText.toLowerCase())
    );
  }, [inputText, options, value]);

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
          placeholder={placeholder}
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
            {allLabel}
          </div>
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">{emptyLabel}</div>
          )}
          {filtered.map((option) => (
            <div
              key={option.value}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onSelect(option.value); setInputText(option.label); setOpen(false); }}
              className={`px-3 py-2 text-sm cursor-pointer hover:bg-muted flex items-center justify-between gap-2 ${value === option.value ? 'bg-primary/10 text-primary font-medium' : 'text-foreground'}`}
            >
              <span>{option.label}</span>
              <span className="text-xs text-muted-foreground shrink-0">({option.count})</span>
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

function useDebouncedValue<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

function getOptionLabel(options: FilterOption[], value: string | null) {
  if (!value) return "";
  return options.find((option) => option.value === value)?.label ?? value;
}

function FilterPanel({
  searchTerm,
  onSearchChange,
  total,
  singularLabel,
  pluralLabel,
  bancos,
  selectedBanco,
  onBancoChange,
  cargos,
  selectedCargo,
  onCargoChange,
  statusOptions,
  selectedStatus,
  onStatusChange,
  showStatus,
  agentUsers,
  selectedAgentId,
  onAgentChange,
  showAgent,
  siapeMode,
  onSiapeModeChange,
  onClear,
  showExport,
  exportingCsv,
  onExport,
}: {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  total: number;
  singularLabel: string;
  pluralLabel: string;
  bancos: FilterOption[];
  selectedBanco: string | null;
  onBancoChange: (value: string | null) => void;
  cargos: FilterOption[];
  selectedCargo: string | null;
  onCargoChange: (value: string | null) => void;
  statusOptions?: FilterOption[];
  selectedStatus?: string | null;
  onStatusChange?: (value: string | null) => void;
  showStatus?: boolean;
  agentUsers?: Array<{ id: number; name: string; role: string }>;
  selectedAgentId?: string | null;
  onAgentChange?: (value: string | null) => void;
  showAgent?: boolean;
  siapeMode: SiapeMode;
  onSiapeModeChange: (value: SiapeMode) => void;
  onClear: () => void;
  showExport?: boolean;
  exportingCsv?: boolean;
  onExport?: () => void;
}) {
  const statusLabel = getOptionLabel(statusOptions ?? [], selectedStatus ?? null);
  const agentLabel = selectedAgentId
    ? agentUsers?.find((agent) => String(agent.id) === selectedAgentId)?.name ?? selectedAgentId
    : "";
  const chips = [
    searchTerm ? { key: "search", label: `Busca: ${searchTerm}`, clear: () => onSearchChange("") } : null,
    selectedBanco ? { key: "banco", label: `Banco: ${getOptionLabel(bancos, selectedBanco)}`, clear: () => onBancoChange(null) } : null,
    selectedCargo ? { key: "cargo", label: `Cargo: ${getOptionLabel(cargos, selectedCargo)}`, clear: () => onCargoChange(null) } : null,
    showStatus && selectedStatus ? { key: "status", label: `Status: ${statusLabel}`, clear: () => onStatusChange?.(null) } : null,
    showAgent && selectedAgentId ? { key: "agent", label: `Agente: ${agentLabel}`, clear: () => onAgentChange?.(null) } : null,
    siapeMode !== "all" ? { key: "siape", label: siapeMode === "only" ? "SIAPE: Apenas" : "SIAPE: Excluir", clear: () => onSiapeModeChange("all") } : null,
  ].filter(Boolean) as Array<{ key: string; label: string; clear: () => void }>;

  const handleSiapeChange = (value: SiapeMode) => {
    if (value === "only") onBancoChange(null);
    onSiapeModeChange(value);
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1 max-w-xl">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, CPF, matrícula, cargo ou banco..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-muted-foreground whitespace-nowrap">
            {total} {total === 1 ? singularLabel : pluralLabel}
          </div>
          {showExport && onExport && (
            <Button
              variant="outline"
              size="sm"
              onClick={onExport}
              disabled={exportingCsv}
              className="h-9 gap-2"
            >
              <Download className="h-4 w-4" />
              {exportingCsv ? "Exportando..." : "Exportar CSV"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        {bancos.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <Building2 className="h-3.5 w-3.5" />
              Banco
            </label>
            <SearchableCombobox
              value={selectedBanco}
              onSelect={onBancoChange}
              options={bancos}
              placeholder="Todos os bancos"
              allLabel="Todos os bancos"
              emptyLabel="Nenhum banco encontrado"
            />
          </div>
        )}

        {cargos.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <Briefcase className="h-3.5 w-3.5" />
              Cargo
            </label>
            <SearchableCombobox
              value={selectedCargo}
              onSelect={onCargoChange}
              options={cargos}
              placeholder="Todos os cargos"
              allLabel="Todos os cargos"
              emptyLabel="Nenhum cargo encontrado"
            />
          </div>
        )}

        {showStatus && statusOptions && statusOptions.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <Activity className="h-3.5 w-3.5" />
              Status
            </label>
            <select
              value={selectedStatus || ""}
              onChange={(e) => onStatusChange?.(e.target.value || null)}
              className="h-10 w-full px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground transition-colors hover:border-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Todos os status</option>
              {statusOptions.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label} ({status.count})
                </option>
              ))}
            </select>
          </div>
        )}

        {showAgent && agentUsers && agentUsers.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <User className="h-3.5 w-3.5" />
              Agente
            </label>
            <select
              value={selectedAgentId || ""}
              onChange={(e) => onAgentChange?.(e.target.value || null)}
              className="h-10 w-full px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground transition-colors hover:border-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Todos os agentes</option>
              {agentUsers.map((agent) => (
                <option key={agent.id} value={String(agent.id)}>
                  {agent.name} ({agent.role})
                </option>
              ))}
            </select>
          </div>
        )}

        <SiapeFilter value={siapeMode} onChange={handleSiapeChange} />
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {chips.map((chip) => (
            <Badge key={chip.key} variant="secondary" className="h-8 gap-1.5 px-2">
              {chip.label}
              <button
                type="button"
                onClick={chip.clear}
                className="rounded-full p-0.5 hover:bg-background/70"
                aria-label={`Remover ${chip.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Button variant="outline" size="sm" onClick={onClear} className="h-8">
            <X className="h-3.5 w-3.5 mr-1.5" />
            Limpar filtros
          </Button>
        </div>
      )}
    </Card>
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

  const debouncedGlobalSearchTerm = useDebouncedValue(globalSearchTerm);
  const debouncedNeverAttendedSearchTerm = useDebouncedValue(neverAttendedSearchTerm);
  const debouncedReturnedSearchTerm = useDebouncedValue(returnedSearchTerm);
  const debouncedMySearchTerm = useDebouncedValue(mySearchTerm);

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
      debouncedGlobalSearchTerm, globalSiapeMode,
    ],
    queryFn: async () => {
      const isManager = ["super_admin", "admin", "supervisor"].includes(user?.role ?? "");
      const { banco, exclude_siape } = resolveGlobalBancoParams();
      const orderBy = banco ? `financiamentos_banco_desc:${banco}` : "financiamentos_desc";

      const params = buildCasesQuery(
        isManager
          ? {
              page: globalPage, page_size: globalPageSize, order: orderBy,
              q: debouncedGlobalSearchTerm, banco, cargo: globalSelectedCargo || undefined,
              status: globalSelectedStatus ? [globalSelectedStatus] : undefined,
              agent_id: globalSelectedAgentId ? Number(globalSelectedAgentId) : undefined,
              exclude_siape,
            }
          : {
              page: globalPage, page_size: globalPageSize, order: orderBy,
              q: debouncedGlobalSearchTerm, banco, cargo: globalSelectedCargo || undefined,
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
      debouncedNeverAttendedSearchTerm, neverAttendedSiapeMode,
    ],
    queryFn: async () => {
      const { banco, exclude_siape } = resolveNeverAttendedBancoParams();
      const orderBy = banco ? `financiamentos_banco_desc:${banco}` : "financiamentos_desc";

      const params = buildCasesQuery({
        page: neverAttendedPage,
        page_size: neverAttendedPageSize,
        order: orderBy,
        q: debouncedNeverAttendedSearchTerm,
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
      debouncedReturnedSearchTerm, returnedSiapeMode,
    ],
    queryFn: async () => {
      const { banco, exclude_siape } = resolveReturnedBancoParams();
      const orderBy = banco ? `financiamentos_banco_desc:${banco}` : "financiamentos_desc";

      const params = buildCasesQuery({
        page: returnedPage,
        page_size: returnedPageSize,
        order: orderBy,
        q: debouncedReturnedSearchTerm,
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
      debouncedMySearchTerm, mySiapeMode,
    ],
    queryFn: async () => {
      const { banco, exclude_siape } = resolveMyBancoParams();
      const orderBy = banco ? `financiamentos_banco_desc:${banco}` : "financiamentos_desc";

      const params = buildCasesQuery({
        page: myPage, page_size: myPageSize, order: orderBy,
        q: debouncedMySearchTerm, banco, cargo: mySelectedCargo || undefined,
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

  const filterScopeParams = useMemo(() => {
    const params = new URLSearchParams();
    if (activeTab === DEFAULT_TAB) {
      params.set("status", "novo");
      params.set("never_attended", "true");
    } else if (activeTab === RETURNED_TAB) {
      params.set("status", "novo");
      params.set("returned_to_pipeline", "true");
    } else if (activeTab === "mine") {
      params.set("mine", "true");
    } else if (!isAdminOrSupervisor) {
      params.set("status", "novo");
    }
    return params.toString();
  }, [activeTab, isAdminOrSupervisor]);

  const { data: filtersData } = useQuery({
    queryKey: ["case-filters", filterScopeParams],
    queryFn: async () => {
      const response = await api.get(`/cases/filters${filterScopeParams ? `?${filterScopeParams}` : ""}`);
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

  const bancos: FilterOption[] = filtersData?.bancos ?? [];
  const cargos: FilterOption[] = filtersData?.cargos ?? [];
  const statusOptions: FilterOption[] = filtersData?.status ?? [];

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
            <FilterPanel
              searchTerm={neverAttendedSearchTerm}
              onSearchChange={setNeverAttendedSearchTerm}
              total={neverAttendedTotal}
              singularLabel="caso novo"
              pluralLabel="casos novos"
              bancos={bancos}
              selectedBanco={neverAttendedSelectedBanco}
              onBancoChange={setNeverAttendedSelectedBanco}
              cargos={cargos}
              selectedCargo={neverAttendedSelectedCargo}
              onCargoChange={setNeverAttendedSelectedCargo}
              siapeMode={neverAttendedSiapeMode}
              onSiapeModeChange={setNeverAttendedSiapeMode}
              onClear={() => {
                setNeverAttendedSearchTerm("");
                setNeverAttendedSelectedBanco(null);
                setNeverAttendedSelectedCargo(null);
                setNeverAttendedSiapeMode("all");
              }}
              showExport={isAdminOrSupervisor}
              exportingCsv={exportingCsv}
              onExport={handleExportCsv}
            />

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
            <FilterPanel
              searchTerm={returnedSearchTerm}
              onSearchChange={setReturnedSearchTerm}
              total={returnedTotal}
              singularLabel="caso retornado"
              pluralLabel="casos retornados"
              bancos={bancos}
              selectedBanco={returnedSelectedBanco}
              onBancoChange={setReturnedSelectedBanco}
              cargos={cargos}
              selectedCargo={returnedSelectedCargo}
              onCargoChange={setReturnedSelectedCargo}
              agentUsers={agentUsers}
              selectedAgentId={returnedSelectedAgentId}
              onAgentChange={setReturnedSelectedAgentId}
              showAgent={isAdminOrSupervisor}
              siapeMode={returnedSiapeMode}
              onSiapeModeChange={setReturnedSiapeMode}
              onClear={() => {
                setReturnedSearchTerm("");
                setReturnedSelectedBanco(null);
                setReturnedSelectedCargo(null);
                setReturnedSelectedAgentId(null);
                setReturnedSiapeMode("all");
              }}
              showExport={isAdminOrSupervisor}
              exportingCsv={exportingCsv}
              onExport={handleExportCsv}
            />

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
            <FilterPanel
              searchTerm={globalSearchTerm}
              onSearchChange={setGlobalSearchTerm}
              total={globalTotal}
              singularLabel="disponível"
              pluralLabel="disponíveis"
              bancos={bancos}
              selectedBanco={globalSelectedBanco}
              onBancoChange={setGlobalSelectedBanco}
              cargos={cargos}
              selectedCargo={globalSelectedCargo}
              onCargoChange={setGlobalSelectedCargo}
              statusOptions={statusOptions}
              selectedStatus={globalSelectedStatus}
              onStatusChange={setGlobalSelectedStatus}
              showStatus={isAdminOrSupervisor}
              agentUsers={agentUsers}
              selectedAgentId={globalSelectedAgentId}
              onAgentChange={setGlobalSelectedAgentId}
              showAgent={isAdminOrSupervisor}
              siapeMode={globalSiapeMode}
              onSiapeModeChange={setGlobalSiapeMode}
              onClear={() => {
                setGlobalSearchTerm("");
                setGlobalSelectedBanco(null);
                setGlobalSelectedCargo(null);
                setGlobalSelectedStatus(null);
                setGlobalSelectedAgentId(null);
                setGlobalSiapeMode("all");
              }}
              showExport={isAdminOrSupervisor}
              exportingCsv={exportingCsv}
              onExport={handleExportCsv}
            />

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

            <FilterPanel
              searchTerm={mySearchTerm}
              onSearchChange={setMySearchTerm}
              total={myTotal}
              singularLabel="caso"
              pluralLabel="casos"
              bancos={bancos}
              selectedBanco={mySelectedBanco}
              onBancoChange={setMySelectedBanco}
              cargos={cargos}
              selectedCargo={mySelectedCargo}
              onCargoChange={setMySelectedCargo}
              statusOptions={statusOptions}
              selectedStatus={mySelectedStatus}
              onStatusChange={setMySelectedStatus}
              showStatus
              siapeMode={mySiapeMode}
              onSiapeModeChange={setMySiapeMode}
              onClear={() => {
                setMySearchTerm("");
                setMySelectedBanco(null);
                setMySelectedCargo(null);
                setMySelectedStatus(null);
                setMySiapeMode("all");
              }}
            />

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
