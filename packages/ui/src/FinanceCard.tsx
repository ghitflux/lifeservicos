/* packages/ui/src/FinanceCard.tsx */
import React from "react";
import { Card } from "./Card";
import { Button } from "./Button";
import { ProgressBar } from "./ProgressBar";
import { Badge } from "./Badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./Dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./Tabs";
import { CaseHistory } from "./CaseHistory";
import { cn } from "./lib/utils";
import {
  DollarSign,
  Calendar,
  TrendingUp,
  AlertCircle,
  CreditCard,
  Upload,
  FileText,
  Eye,
  X,
  XCircle,
  Download,
  FileImage,
  File,
  ArrowLeft,
  Undo2,
  RotateCcw,
} from "lucide-react";

interface SimulationResult {
  banco?: string;
  valorLiberado: number;
  valorParcela: number;
  coeficiente?: number;
  saldoDevedor?: number;
  valorTotalFinanciado?: number;
  seguroObrigatorio?: number;
  valorLiquido?: number;
  custoConsultoria?: number;
  custoConsultoriaLiquido?: number;
  liberadoCliente: number;
  percentualConsultoria?: number;
  taxaJuros: number;
  prazo: number;
}

export interface FinanceCardProps {
  id: number;
  clientName: string;
  clientCpf?: string; // <--- ADICIONADO para aceitar CPF vindo da página
  simulationResult?: SimulationResult;

  /** compatibilidade com props antigas */
  totalAmount?: number;
  installments?: number;
  paidInstallments?: number;

  status: "pending" | "approved" | "disbursed" | "overdue" | "financeiro_pendente" | "contrato_efetivado" | "fechamento_aprovado" | "encerrado" | "caso_cancelado" | "contrato_cancelado";
  dueDate?: string;

  /** callbacks como opcionais para evitar TS2774 */
  onApprove?: (id: number) => void;
  onReject?: (id: number) => void;
  onDisburse?: (
    id: number,
    percentualAtendente?: number,
    consultoriaBruta?: number,
    atendenteUserId?: number,
    atendente2UserId?: number,
    impostoPercentual?: number,
    temCorretor?: boolean,
    corretorNome?: string,
    corretorComissaoValor?: number
  ) => void;
  onCancel?: (id: number) => void;
  onReopen?: (id: number) => void;
  onReturnToCalculista?: (id: number) => void;
  onCancelCase?: (id: number) => void;

  /** usuários disponíveis para seleção de comissão */
  availableUsers?: Array<{id: number; name: string; email: string}>;

  /** ID do atendente atribuído ao caso (usado como padrão no modal) */
  assignedUserId?: number;

  className?: string;

  /** dados bancários do cliente */
  clientBankInfo?: {
    banco?: string;
    agencia?: string;
    conta?: string;
    chave_pix?: string;
    tipo_chave_pix?: string;
  };

  /** anexos do contrato */
  attachments?: Array<{
    id: number;
    filename: string;
    size: number;
    uploaded_at: string;
    mime_type?: string;
    url?: string;
  }>;

  /** upload de comprovantes */
  onUploadAttachment?: (file: File) => void;
  isUploadingAttachment?: boolean;

  /** download de anexos do caso */
  onDownloadAttachment?: (attachmentId: number, filename?: string) => void;

  /** dados básicos do caso para header rápido */
  caseDetails?: {
    cpf?: string;
    matricula?: string;
    created_at?: string;
    events?: Array<{
      type: string;
      created_at: string;
      payload?: any;
    }>;
  };

  /** payload completo do caso (/finance/case/{id}) */
  fullCaseDetails?: {
    id: number;
    status: string;
    created_at: string;
    client: {
      id: number;
      name: string;
      cpf: string;
      matricula: string;
      orgao?: string;
      telefone_preferencial?: string;
      numero_cliente?: string;
      observacoes?: string;
      banco?: string;
      agencia?: string;
      conta?: string;
      chave_pix?: string;
      tipo_chave_pix?: string;
    };
    simulation?: {
      id: number;
      prazo: number;
      coeficiente: string;
      seguro: number;
      percentual_consultoria: number;
      banks_json: any[];
      totals: {
        valorParcelaTotal: number;
        saldoTotal: number;
        liberadoTotal: number;
        totalFinanciado: number;
        valorLiquido: number;
        custoConsultoria: number;
        custoConsultoriaLiquido: number;
        liberadoCliente: number;
      };
    };
    contract?: {
      id: number;
      total_amount: number;
      installments: number;
      disbursed_at: string;
      status: string;
      attachments: Array<{
        id: number;
        filename: string;
        size: number;
        mime: string;
        created_at: string;
      }>;
    };
    events: Array<{
      id: number;
      type: string;
      created_at: string;
      payload: any;
      created_by: number;
    }>;
    attachments: Array<{
      id: number;
      path: string;
      filename?: string;
      mime: string;
      size: number;
      created_at: string;
    }>;
  };

  /** callback para carregar detalhes completos on-demand */
  onLoadFullDetails?: (caseId: number) => void;
}

export function FinanceCard({
  id,
  clientName,
  clientCpf,
  simulationResult,
  totalAmount,
  installments,
  paidInstallments = 0,
  status,
  dueDate,
  onApprove,
  onReject,
  onDisburse,
  onCancel,
  onReopen,
  onReturnToCalculista,
  onCancelCase,
  className,
  clientBankInfo,
  attachments = [],
  onUploadAttachment,
  isUploadingAttachment = false,
  onDownloadAttachment,
  caseDetails,
  fullCaseDetails,
  onLoadFullDetails,
  availableUsers = [],
  assignedUserId,
}: FinanceCardProps) {
  // usar simulação quando disponível
  const finalTotalAmount = simulationResult?.valorLiberado || totalAmount || 0;
  const finalInstallments = simulationResult?.prazo || installments || 0;
  const finalMonthlyPayment = simulationResult?.valorParcela || 0;

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [showDetailsModal, setShowDetailsModal] = React.useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = React.useState(false);
  const [showDisburseConfirm, setShowDisburseConfirm] = React.useState(false);
  const [showReopenConfirm, setShowReopenConfirm] = React.useState(false);
  const [dragActive, setDragActive] = React.useState(false);

  // Estados para distribuição
  const [percentualAtendente, setPercentualAtendente] = React.useState<number>(70); // Padrão 70%
  const [selectedAtendenteId, setSelectedAtendenteId] = React.useState<number | null>(null);
  const [selectedAtendente2Id, setSelectedAtendente2Id] = React.useState<number | null>(null);

  // Estados para consultoria bruta + imposto + corretor
  const [consultoriaBruta, setConsultoriaBruta] = React.useState<string>("");
  const [impostoPercentual] = React.useState<number>(14);
  const [temCorretor, setTemCorretor] = React.useState<boolean>(false);
  const [corretorNome, setCorretorNome] = React.useState<string>("");
  const [corretorComissao, setCorretorComissao] = React.useState<string>("");

  // Inicializar consultoria bruta quando o modal abre
  React.useEffect(() => {
    if (showDisburseConfirm && simulationResult?.custoConsultoria) {
      setConsultoriaBruta(formatCurrency(simulationResult.custoConsultoria));
    }
  }, [showDisburseConfirm, simulationResult]);

  // Inicializar atendente selecionado com o atendente do caso ao abrir modal
  React.useEffect(() => {
    if (showDisburseConfirm && assignedUserId) {
      setSelectedAtendenteId(assignedUserId);
    }
  }, [showDisburseConfirm, assignedUserId]);

  React.useEffect(() => {
    if (showDetailsModal && onLoadFullDetails && !fullCaseDetails) {
      onLoadFullDetails(id);
    }
  }, [showDetailsModal, id, onLoadFullDetails, fullCaseDetails]);

  const progress =
    finalInstallments > 0 ? (paidInstallments / finalInstallments) * 100 : 0;

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && onUploadAttachment) {
      onUploadAttachment(file);
      event.target.value = "";
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0] && onUploadAttachment) {
      onUploadAttachment(e.dataTransfer.files[0]);
    }
  };

  const getFileIcon = (filename: string, mimeType?: string) => {
    if (
      mimeType?.includes("image") ||
      /\.(jpg|jpeg|png|gif|webp)$/i.test(filename)
    ) {
      return <FileImage className="h-4 w-4" />;
    }
    if (mimeType?.includes("pdf") || filename.endsWith(".pdf")) {
      return <File className="h-4 w-4 text-danger" />;
    }
    return <FileText className="h-4 w-4" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };



  const statusColors = {
    // Status legados (compatibilidade)
    pending: "border-warning/40 bg-warning-subtle text-warning-foreground",
    approved: "border-success/40 bg-success-subtle text-success-foreground",
    disbursed: "border-info/40 bg-info-subtle text-info-foreground",
    overdue: "border-danger/40 bg-danger-subtle text-danger-foreground",

    // Status reais do sistema
    financeiro_pendente: "border-info/40 bg-info-subtle text-info-foreground",
    contrato_efetivado: "border-success/40 bg-success-subtle text-success-foreground",
    fechamento_aprovado: "border-emerald/40 bg-emerald-subtle text-emerald-foreground",
    encerrado: "border-muted/40 bg-muted text-muted-foreground",
    caso_cancelado: "border-danger/40 bg-danger-subtle text-danger-foreground",
    contrato_cancelado: "border-danger/40 bg-danger-subtle text-danger-foreground",
  } as const;

  const statusLabels = {
    // Status legados (compatibilidade)
    pending: "Pendente",
    approved: "Fechamento Aprovado",
    disbursed: "Liberado",
    overdue: "Em atraso",

    // Status reais do sistema
    financeiro_pendente: "Aguardando Financeiro",
    contrato_efetivado: "Contrato Efetivado",
    fechamento_aprovado: "Fechamento Aprovado",
    encerrado: "Encerrado",
    caso_cancelado: "Cancelado",
    contrato_cancelado: "Contrato Cancelado",
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const parseCurrencyToNumber = (value: string): number => {
    // Remove R$, pontos e substitui vírgula por ponto
    const cleaned = value.replace(/[R$\s.]/g, "").replace(",", ".");
    return parseFloat(cleaned) || 0;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleDateString("pt-BR");
  };

  return (
    <Card className={cn("p-6 space-y-4", className)}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h3 className="font-semibold text-lg">{clientName}</h3>
          <p className="text-sm text-muted-foreground">Caso #{id}</p>

          {/* CPF / Matrícula */}
          <div className="flex gap-3 text-xs text-muted-foreground mt-1">
            {caseDetails?.cpf ? (
              <div className="flex items-center gap-1">
                <span className="font-medium">CPF:</span>
                <span>{caseDetails.cpf}</span>
              </div>
            ) : clientCpf ? (
              <div className="flex items-center gap-1">
                <span className="font-medium">CPF:</span>
                <span>{clientCpf}</span>
              </div>
            ) : null}

            {caseDetails?.matricula && (
              <div className="flex items-center gap-1">
                <span className="font-medium">Mat:</span>
                <span>{caseDetails.matricula}</span>
              </div>
            )}
          </div>

          {simulationResult?.banco && (
            <div className="bg-primary/10 px-2 py-1 rounded-md mt-2">
              <span className="text-xs font-medium text-primary">
                {simulationResult.banco}
              </span>
            </div>
          )}
        </div>
        <Badge className={statusColors[status] || statusColors.pending}>
          {statusLabels[status] || status.replace(/_/g, ' ')}
        </Badge>
      </div>

      {/* Destaques - Liberado Cliente / Consultoria Líquida */}
      {simulationResult && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-success/40 bg-success/10 p-3">
            <div className="text-xs text-success font-medium mb-1">
              Liberado para Cliente
            </div>
            <div className="text-xl font-bold text-success">
              {formatCurrency(simulationResult.liberadoCliente || 0)}
            </div>
          </div>

          <div className="rounded-lg border border-info/40 bg-info/10 p-3">
            <div className="text-xs text-info font-medium mb-1">
              Consultoria Líquida (86%)
            </div>
            <div className="text-xl font-bold text-info">
              {formatCurrency(simulationResult.custoConsultoriaLiquido || 0)}
            </div>
          </div>
        </div>
      )}

      {/* Seção Anexos (para approved) */}
      {status === "approved" && (
        <div className="rounded-lg border border-border/40 bg-muted/30 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">
                Comprovantes ({attachments.length})
              </span>
            </div>

            {onUploadAttachment && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingAttachment}
                className="h-7 px-2 text-xs"
              >
                <Upload className="h-3 w-3 mr-1" />
                {isUploadingAttachment ? "Enviando..." : "Anexar"}
              </Button>
            )}
          </div>

          {onUploadAttachment && (
            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-4 text-center transition-colors",
                dragActive ? "border-primary bg-primary/5" : "border-gray-300",
                "hover:border-primary hover:bg-primary/5"
              )}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Arraste arquivos aqui ou clique para selecionar
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                PDF, JPG, PNG até 10MB
              </p>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            onChange={handleFileSelect}
            multiple
          />

          {attachments.length > 0 ? (
            <div className="space-y-2">
              {attachments.slice(0, 2).map((attachment) => (
                <div
                  key={attachment.id}
                  className="flex items-center justify-between bg-gray-900 p-2 rounded border"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {getFileIcon(attachment.filename, attachment.mime_type)}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">
                        {attachment.filename}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(attachment.size)} •{" "}
                        {new Date(
                          attachment.uploaded_at
                        ).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                  </div>
                  {attachment.url && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      onClick={() => window.open(attachment.url!, "_blank")}
                    >
                      <Download className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
              {attachments.length > 2 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowDetailsModal(true)}
                  className="w-full text-xs"
                >
                  Ver todos os {attachments.length} anexos
                </Button>
              )}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground text-center py-2">
              Nenhum comprovante anexado
            </div>
          )}
        </div>
      )}

      {/* Ações */}
      <div className="flex gap-2 pt-2">
        {status === "pending" && (onApprove || onReject) && (
          <>
            {onApprove ? (
              <Button size="sm" onClick={() => onApprove(id)} className="flex-1">
                <TrendingUp className="h-4 w-4 mr-1" />
                Aprovar
              </Button>
            ) : null}

            {onReject ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onReject(id)}
                className="flex-1"
              >
                <X className="h-4 w-4 mr-1" />
                Rejeitar
              </Button>
            ) : null}
          </>
        )}

        {status === "approved" && (
          <div className="w-full space-y-2">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowDetailsModal(true)}
                className="flex-1"
              >
                <Eye className="h-4 w-4 mr-1" />
                Ver Detalhes
              </Button>


            </div>

            {onDisburse && (status as string) !== "caso_cancelado" && (status as string) !== "contrato_cancelado" ? (
              <Button size="sm" onClick={() => setShowDisburseConfirm(true)} className="w-full">
                Efetivar Liberação
              </Button>
            ) : null}

          </div>
        )}

        {/* Ações para casos efetivados */}
        {status === "contrato_efetivado" && (
          <div className="w-full space-y-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowDetailsModal(true)}
              className="w-full"
            >
              <Eye className="h-4 w-4 mr-1" />
              Ver Detalhes
            </Button>

            {onReopen && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowReopenConfirm(true)}
                className="w-full border-amber-500 text-amber-700 hover:bg-amber-600 hover:text-white hover:border-amber-600 transition-colors"
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Reabrir para Ajuste
              </Button>
            )}
          </div>
        )}

        {/* ações após liberação */}
        {status === "disbursed" && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowDetailsModal(true)}
              className="flex-1"
            >
              <Eye className="h-4 w-4 mr-1" />
              Ver Detalhes
            </Button>


          </div>
        )}

        {status === "overdue" && (
          <div className="flex items-center gap-2 text-danger text-sm">
            <AlertCircle className="h-4 w-4" />
            <span>Necessita atenção - Pagamento em atraso</span>
          </div>
        )}

        {/* Ações para status financeiro_pendente */}
        {status === "financeiro_pendente" && (
          <div className="w-full space-y-2">
            {/* Linha 1: Ver Detalhes + Devolver */}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowDetailsModal(true)}
                className="flex-1"
              >
                <Eye className="h-4 w-4 mr-1" />
                Ver Detalhes
              </Button>

              {onReturnToCalculista && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onReturnToCalculista(id)}
                  className="flex-1 text-orange-600 border-orange-400 hover:bg-orange-600 hover:text-white hover:border-orange-600 transition-colors"
                >
                  <Undo2 className="h-4 w-4 mr-1" />
                  Devolver
                </Button>
              )}
            </div>

            {/* Linha 2: Efetivar Liberação (botão principal) */}
            {onDisburse && (status as string) !== "caso_cancelado" && (status as string) !== "contrato_cancelado" && (
              <Button
                size="sm"
                onClick={() => setShowDisburseConfirm(true)}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                <CreditCard className="h-4 w-4 mr-1" />
                Efetivar Liberação
              </Button>
            )}

            {/* Linha 3: Cancelar Caso (opcional, destrutivo) */}
            {onCancelCase && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setShowCancelConfirm(true)}
                className="w-full"
              >
                <XCircle className="h-4 w-4 mr-1" />
                Cancelar Caso
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Modal Detalhes */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Atendimento #{id}</DialogTitle>
          </DialogHeader>

          {fullCaseDetails ? (
            <Tabs defaultValue="client" className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="client">Cliente</TabsTrigger>
                <TabsTrigger value="simulation">Simulação</TabsTrigger>
                <TabsTrigger value="contract">Contrato</TabsTrigger>
                <TabsTrigger value="history">Histórico</TabsTrigger>
                <TabsTrigger value="attachments">Anexos</TabsTrigger>
              </TabsList>

              {/* Cliente */}
              <TabsContent value="client" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm text-muted-foreground">Nome</span>
                    <p className="font-medium">
                      {fullCaseDetails.client.name}
                    </p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">CPF</span>
                    <p className="font-medium">{fullCaseDetails.client.cpf}</p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">
                      Matrícula
                    </span>
                    <p className="font-medium">
                      {fullCaseDetails.client.matricula}
                    </p>
                  </div>

                  {fullCaseDetails.client.orgao && (
                    <div>
                      <span className="text-sm text-muted-foreground">Órgão</span>
                      <p className="font-medium">{fullCaseDetails.client.orgao}</p>
                    </div>
                  )}

                  {fullCaseDetails.client.telefone_preferencial && (
                    <div>
                      <span className="text-sm text-muted-foreground">Telefone</span>
                      <p className="font-medium">
                        {fullCaseDetails.client.telefone_preferencial}
                      </p>
                    </div>
                  )}

                  {fullCaseDetails.client.banco && (
                    <>
                      <div>
                        <span className="text-sm text-muted-foreground">Banco</span>
                        <p className="font-medium">{fullCaseDetails.client.banco}</p>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">Agência</span>
                        <p className="font-medium">
                          {fullCaseDetails.client.agencia}
                        </p>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">Conta</span>
                        <p className="font-medium">{fullCaseDetails.client.conta}</p>
                      </div>
                    </>
                  )}

                  {fullCaseDetails.client.chave_pix && (
                    <div className="col-span-2">
                      <span className="text-sm text-muted-foreground">
                        Chave PIX ({fullCaseDetails.client.tipo_chave_pix})
                      </span>
                      <p className="font-medium">
                        {fullCaseDetails.client.chave_pix}
                      </p>
                    </div>
                  )}

                  {fullCaseDetails.client.observacoes && (
                    <div className="col-span-2">
                      <span className="text-sm text-muted-foreground">
                        Observações
                      </span>
                      <p className="font-medium">
                        {fullCaseDetails.client.observacoes}
                      </p>
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Simulação */}
              <TabsContent value="simulation" className="space-y-4">
                {fullCaseDetails.simulation ? (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="rounded-lg border border-success/40 bg-success-subtle p-3">
                        <span className="text-xs font-medium text-success">
                          Valor Liberado
                        </span>
                        <p className="font-bold">
                          {formatCurrency(
                            fullCaseDetails.simulation.totals.liberadoTotal
                          )}
                        </p>
                      </div>
                      <div className="rounded-lg border border-info/40 bg-info-subtle p-3">
                        <span className="text-xs font-medium text-info">
                          Liberado Cliente
                        </span>
                        <p className="font-bold">
                          {formatCurrency(
                            fullCaseDetails.simulation.totals.liberadoCliente
                          )}
                        </p>
                      </div>
                      <div className="rounded-lg border border-accent/40 bg-accent-subtle p-3">
                        <span className="text-xs font-medium text-accent">
                          Valor Parcela
                        </span>
                        <p className="font-bold">
                          {formatCurrency(
                            fullCaseDetails.simulation.totals.valorParcelaTotal
                          )}
                        </p>
                      </div>
                      <div className="rounded-lg border border-warning/40 bg-warning-subtle p-3">
                        <span className="text-xs font-medium text-warning">
                          Prazo
                        </span>
                        <p className="font-bold">
                          {fullCaseDetails.simulation.prazo} meses
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div>
                        <span className="text-sm text-muted-foreground">
                          Total Financiado
                        </span>
                        <p className="font-medium">
                          {formatCurrency(
                            fullCaseDetails.simulation.totals.totalFinanciado
                          )}
                        </p>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">
                          Custo Consultoria
                        </span>
                        <p className="font-medium">
                          {formatCurrency(
                            fullCaseDetails.simulation.totals.custoConsultoria
                          )}
                        </p>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">
                          Consultoria Líquida (86%)
                        </span>
                        <p className="font-medium">
                          {formatCurrency(
                            fullCaseDetails.simulation.totals
                              .custoConsultoriaLiquido
                          )}
                        </p>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">
                          Seguro Obrigatório
                        </span>
                        <p className="font-medium">
                          {formatCurrency(fullCaseDetails.simulation.seguro)}
                        </p>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">
                          Coeficiente
                        </span>
                        <p className="font-medium font-mono">
                          {fullCaseDetails.simulation.coeficiente}
                        </p>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">
                          % Consultoria
                        </span>
                        <p className="font-medium">
                          {fullCaseDetails.simulation.percentual_consultoria}%
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    Nenhuma simulação encontrada
                  </p>
                )}
              </TabsContent>

              {/* Contrato */}
              <TabsContent value="contract" className="space-y-4">
                {fullCaseDetails.contract ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-sm text-muted-foreground">
                          Valor Total
                        </span>
                        <p className="font-medium">
                          {formatCurrency(
                            fullCaseDetails.contract.total_amount
                          )}
                        </p>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">
                          Parcelas
                        </span>
                        <p className="font-medium">
                          {fullCaseDetails.contract.installments}x
                        </p>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">
                          Data Liberação
                        </span>
                        <p className="font-medium">
                          {new Date(
                            fullCaseDetails.contract.disbursed_at
                          ).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">
                          Status
                        </span>
                        <p className="font-medium capitalize">
                          {fullCaseDetails.contract.status}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2 mt-4">
                      <h4 className="font-semibold">
                        Anexos do Contrato (
                        {fullCaseDetails.contract.attachments.length})
                      </h4>
                      {fullCaseDetails.contract.attachments.map((att) => (
                        <div
                          key={att.id}
                          className="flex items-center justify-between p-2 rounded border"
                        >
                          <div className="flex items-center gap-2">
                            {getFileIcon(att.filename, att.mime)}
                            <div>
                              <p className="text-sm font-medium">{att.filename}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatFileSize(att.size)}
                              </p>
                            </div>
                          </div>
                          <Button size="sm" variant="outline">
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    Contrato ainda não efetivado
                  </p>
                )}
              </TabsContent>

              {/* Histórico */}
              <TabsContent value="history">
                <CaseHistory events={fullCaseDetails.events} />
              </TabsContent>

              {/* Anexos */}
              <TabsContent value="attachments" className="space-y-2">
                {fullCaseDetails.attachments.length > 0 ? (
                  fullCaseDetails.attachments.map((att) => (
                    <div
                      key={att.id}
                      className="flex items-center justify-between p-3 rounded border"
                    >
                      <div className="flex items-center gap-3">
                        {getFileIcon(att.path, att.mime)}
                        <div>
                          <p className="text-sm font-medium">
                            {att.filename || att.path.split("/").pop()}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(att.size)} •{" "}
                            {new Date(att.created_at).toLocaleDateString("pt-BR")}
                          </p>
                        </div>
                      </div>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => onDownloadAttachment?.(att.id, att.filename || att.path.split("/").pop())}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    Nenhum anexo do caso
                  </p>
                )}
              </TabsContent>
            </Tabs>
          ) : (
            <div className="space-y-4 py-8">
              <div className="text-center text-muted-foreground">
                <p>Carregando detalhes...</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmação Cancelamento */}
      <Dialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar Operação</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Tem certeza que deseja cancelar a operação para{" "}
              <strong>{clientName}</strong>? Esta ação pode ser reversível
              dependendo do status atual.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowCancelConfirm(false)}>
                Voltar
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  onCancel?.(id);
                  setShowCancelConfirm(false);
                }}
              >
                <XCircle className="h-4 w-4 mr-1" />
                Cancelar Operação
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmação Liberação */}
      <Dialog open={showDisburseConfirm} onOpenChange={setShowDisburseConfirm}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Confirmar Liberação</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-warning/40 bg-warning-subtle p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-5 w-5 text-warning" />
                <div>
                  <p className="text-sm font-medium text-warning">Confirme a liberação</p>
                  <p className="mt-1 text-sm text-warning-foreground">
                    Tem certeza que deseja efetivar a liberação para{" "}
                    <strong>{clientName}</strong>?
                  </p>
                </div>
              </div>
            </div>

            {/* Valores da Simulação */}
            {simulationResult && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Liberado Cliente:</span>
                  <span className="font-medium">{formatCurrency(simulationResult.liberadoCliente || 0)}</span>
                </div>

                {/* Campo Editável: Consultoria Bruta */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted-foreground">
                    Consultoria Bruta (editável):
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm font-medium text-info focus:outline-none focus:ring-2 focus:ring-primary"
                    value={consultoriaBruta}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, "");
                      const numValue = Number(value) / 100;
                      setConsultoriaBruta(formatCurrency(numValue));
                    }}
                    placeholder="R$ 0,00"
                  />
                  <p className="text-xs text-muted-foreground">
                    Valor original da simulação: {formatCurrency(simulationResult.custoConsultoria || 0)}
                  </p>
                </div>

                {/* Cálculos Automáticos */}
                {consultoriaBruta && (
                  <div className="space-y-1.5 border-t pt-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Imposto ({impostoPercentual}%):</span>
                      <span className="font-medium text-destructive">
                        {formatCurrency(parseCurrencyToNumber(consultoriaBruta) * (impostoPercentual / 100))}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground font-semibold">Consultoria Líquida (calculada):</span>
                      <span className="font-semibold text-success">
                        {formatCurrency(parseCurrencyToNumber(consultoriaBruta) * (1 - impostoPercentual / 100))}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Comissão de Corretor (Opcional) - ANTES DA DISTRIBUIÇÃO */}
            <div className="space-y-3 pt-2 border-t">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={temCorretor}
                  onChange={(e) => setTemCorretor(e.target.checked)}
                  className="w-4 h-4 rounded border-input"
                />
                <span className="text-sm font-semibold">Tem Corretor?</span>
              </label>

              {temCorretor && (
                <div className="space-y-3 pl-6">
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">
                      Nome do Corretor
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                      value={corretorNome}
                      onChange={(e) => setCorretorNome(e.target.value)}
                      placeholder="Nome completo do corretor"
                    />
                  </div>

                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">
                      Valor da Comissão
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                      value={corretorComissao}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, "");
                        const numValue = Number(value) / 100;
                        setCorretorComissao(formatCurrency(numValue));
                      }}
                      placeholder="R$ 0,00"
                    />
                  </div>

                  {corretorComissao && (
                    <div className="rounded-lg bg-orange-50 border border-orange-200 p-2 text-sm text-orange-800">
                      Despesa de comissão: <strong>{corretorComissao}</strong>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Distribuição da Consultoria Líquida - DEPOIS DO CORRETOR */}
            <div className="space-y-3 pt-2 border-t">
              <h4 className="text-sm font-semibold">Distribuição da Consultoria Líquida</h4>

              {/* Grid 2 Colunas: Atendente + Percentual */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Seleção de Atendente */}
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">
                    Atendente
                  </label>
                  <select
                    className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                    value={selectedAtendenteId || ""}
                    onChange={(e) => setSelectedAtendenteId(Number(e.target.value) || null)}
                  >
                    <option value="">Selecione um atendente</option>
                    {availableUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Percentual para Atendente */}
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">
                    Percentual para Atendente
                  </label>
                  <select
                    className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                    value={percentualAtendente}
                    onChange={(e) => setPercentualAtendente(Number(e.target.value))}
                  >
                    <option value="0">0% (Atendente) + 100% (Balcão)</option>
                    <option value="10">10% (Atendente) + 90% (Balcão)</option>
                    <option value="20">20% (Atendente) + 80% (Balcão)</option>
                    <option value="30">30% (Atendente) + 70% (Balcão)</option>
                    <option value="40">40% (Atendente) + 60% (Balcão)</option>
                    <option value="50">50% (Atendente) + 50% (Balcão)</option>
                    <option value="60">60% (Atendente) + 40% (Balcão)</option>
                    <option value="70">70% (Atendente) + 30% (Balcão)</option>
                    <option value="80">80% (Atendente) + 20% (Balcão)</option>
                    <option value="90">90% (Atendente) + 10% (Balcão)</option>
                    <option value="100">100% (Atendente) + 0% (Balcão)</option>
                  </select>
                </div>
              </div>

              {/* Atendente 2 (Opcional) */}
              <div className="mt-3">
                <label className="text-sm text-muted-foreground mb-1 block">
                  Atendente 2 (Opcional - divide comissão)
                </label>
                <select
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                  value={selectedAtendente2Id || ""}
                  onChange={(e) => setSelectedAtendente2Id(Number(e.target.value) || null)}
                >
                  <option value="">Nenhum</option>
                  {availableUsers
                    .filter(u => u.id !== selectedAtendenteId)
                    .map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                </select>
                {selectedAtendente2Id && (
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Com 2 atendentes: cada um recebe {(percentualAtendente / 2).toFixed(1)}%
                  </p>
                )}
              </div>

              {/* Preview da Distribuição */}
              {consultoriaBruta && (() => {
                // 1. Calcular consultoria líquida (Bruta - Imposto)
                const liquidaAposImposto = parseCurrencyToNumber(consultoriaBruta) * (1 - impostoPercentual / 100);

                // 2. Deduzir comissão do corretor (se houver)
                const comissaoValor = temCorretor ? parseCurrencyToNumber(corretorComissao) : 0;
                const liquidaParaDistribuir = liquidaAposImposto - comissaoValor;

                // 3. Distribuir entre atendentes
                const percentAtendente1 = selectedAtendente2Id
                  ? percentualAtendente / 2
                  : percentualAtendente;
                const percentAtendente2 = selectedAtendente2Id
                  ? percentualAtendente / 2
                  : 0;
                const percentBalcao = 100 - percentualAtendente;

                const valorAtendente1 = (liquidaParaDistribuir * percentAtendente1) / 100;
                const valorAtendente2 = (liquidaParaDistribuir * percentAtendente2) / 100;
                const valorBalcao = (liquidaParaDistribuir * percentBalcao) / 100;

                return (
                  <div className="rounded-lg bg-muted/50 p-3 space-y-2 text-sm">
                    {selectedAtendenteId && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Atendente 1 ({percentAtendente1.toFixed(1)}%):
                        </span>
                        <span className="font-medium text-success">
                          {formatCurrency(valorAtendente1)}
                        </span>
                      </div>
                    )}

                    {selectedAtendente2Id && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Atendente 2 ({percentAtendente2.toFixed(1)}%):
                        </span>
                        <span className="font-medium text-success">
                          {formatCurrency(valorAtendente2)}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Balcão ({percentBalcao}%):</span>
                      <span className="font-medium text-info">
                        {formatCurrency(valorBalcao)}
                      </span>
                    </div>

                    <div className="pt-2 border-t flex justify-between font-semibold">
                      <span>Total Líquido:</span>
                      <span>{formatCurrency(liquidaParaDistribuir)}</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => {
                setShowDisburseConfirm(false);
              }}>
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  const brutaValue = parseCurrencyToNumber(consultoriaBruta);
                  const comissaoValue = temCorretor ? parseCurrencyToNumber(corretorComissao) : 0;

                  onDisburse?.(
                    id,
                    percentualAtendente,
                    brutaValue,
                    selectedAtendenteId || undefined,
                    selectedAtendente2Id || undefined,
                    impostoPercentual,
                    temCorretor,
                    temCorretor ? corretorNome : undefined,
                    temCorretor ? comissaoValue : undefined
                  );
                  setShowDisburseConfirm(false);
                }}
              >
                <CreditCard className="h-4 w-4 mr-1" />
                Confirmar Liberação
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmação Cancelamento de Caso */}
      <Dialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar Caso</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-warning/40 bg-warning-subtle p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-5 w-5 text-warning" />
                <div>
                  <p className="text-sm font-medium text-warning">Atenção</p>
                  <p className="mt-1 text-sm text-warning-foreground">
                    Tem certeza que deseja cancelar o caso de{" "}
                    <strong>{clientName}</strong>?
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Esta ação pode ser irreversível dependendo do status atual.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowCancelConfirm(false)}>
                Voltar
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  onCancelCase?.(id);
                  setShowCancelConfirm(false);
                }}
              >
                <XCircle className="h-4 w-4 mr-1" />
                Cancelar Caso
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmação Reabertura de Caso */}
      <Dialog open={showReopenConfirm} onOpenChange={setShowReopenConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reabrir Caso</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-warning/40 bg-warning-subtle p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-5 w-5 text-warning" />
                <div>
                  <p className="text-sm font-medium text-warning">Atenção</p>
                  <p className="mt-1 text-sm text-warning-foreground">
                    Deseja reabrir este caso para ajustes nos valores?
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    As receitas criadas automaticamente serão excluídas.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowReopenConfirm(false)}>
                Voltar
              </Button>
              <Button
                variant="default"
                onClick={() => {
                  onReopen?.(id);
                  setShowReopenConfirm(false);
                }}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Reabrir Caso
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </Card>
  );
}
