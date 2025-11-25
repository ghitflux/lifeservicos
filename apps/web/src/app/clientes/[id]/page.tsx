"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@lifecalling/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCreateCase } from "@/lib/hooks";
import { toast } from "sonner";
import { ArrowLeft, User, FileText, Calendar, DollarSign, Trash2, AlertTriangle, MapPin, Plus } from "lucide-react";
import Financiamentos from "@/components/clients/Financiamentos";
import { Snippet } from "@nextui-org/snippet";
import CaseChat from "@/components/case/CaseChat";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function ClienteDetalhe() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Hook para criar novo caso
  const createCase = useCreateCase();

  // Handler para criar novo caso
  const handleCreateCase = () => {
    if (!id) return;

    createCase.mutate({
      client_id: parseInt(id)
    });
  };

  const { data: client, isLoading } = useQuery({
    queryKey: ["/clients", id],
    queryFn: async () => {
      const response = await api.get(`/clients/${id}`);
      return response.data;
    },
    enabled: !!id,
  });

  // Buscar endereços do cliente
  const { data: addresses = [] } = useQuery({
    queryKey: ["clientAddresses", id],
    queryFn: async () => {
      const response = await api.get(`/clients/${id}/addresses`);
      return response.data;
    },
    enabled: !!id
  });







  // Buscar contratos efetivados do cliente
  const { data: contratosData } = useQuery({
    queryKey: ["clientContracts", id],
    queryFn: async () => {
      const response = await api.get(`/clients/${id}/contratos-efetivados`);
      return response.data;
    },
    enabled: !!id
  });

  const contratos = contratosData?.items || [];

  // Buscar casos associados ao cliente
  const { data: casosData, isLoading: casosLoading, error: casosError } = useQuery({
    queryKey: ["clientCases", id],
    queryFn: async () => {
      const response = await api.get(`/clients/${id}/cases`);
      return response.data;
    },
    enabled: !!id
  });

  const casos = casosData?.items || [];

  const formatCPF = (cpf: string) => {
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  };

  const formatCurrency = (value: string) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(parseFloat(value));
  };

  // Mutation para deletar cliente
  const deleteClientMutation = useMutation({
    mutationFn: async (clientId: number) => {
      const response = await api.delete(`/clients/${clientId}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/clients"] });
      toast.success("Cliente excluído com sucesso!");
      router.push("/clientes");
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.detail || "Erro ao excluir cliente";
      toast.error(errorMessage);
    }
  });

  // Mutation para deletar cliente em cascata
  const deleteClientCascadeMutation = useMutation({
    mutationFn: async (clientId: number) => {
      const response = await api.delete(`/clients/${clientId}/cascade`);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/clients"] });
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      toast.success(data.message || "Cliente e casos associados excluídos com sucesso!");
      router.push("/clientes");
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.detail || "Erro ao excluir cliente";
      toast.error(errorMessage);
    }
  });

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDeleteCascadeModal, setShowDeleteCascadeModal] = useState(false);

  const handleDeleteClient = () => {
    setShowDeleteModal(true);
  };

  const handleDeleteClientCascade = () => {
    setShowDeleteCascadeModal(true);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      ativo: { color: "bg-green-100 text-green-800", label: "Ativo" },
      em_revisao: { color: "bg-yellow-100 text-yellow-800", label: "Em Revisão" },
      encerrado: { color: "bg-gray-100 text-gray-800", label: "Encerrado" },
      inadimplente: { color: "bg-red-100 text-red-800", label: "Inadimplente" },
    } as const;

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.ativo;

    return (
      <Badge className={config.color}>
        {config.label}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <div className="h-10 w-20 bg-muted rounded animate-pulse"></div>
          <div className="h-8 w-64 bg-muted rounded animate-pulse"></div>
        </div>
        <div className="grid gap-6">
          <Card className="p-6 animate-pulse">
            <div className="h-6 bg-muted rounded w-1/3 mb-4"></div>
            <div className="space-y-2">
              <div className="h-4 bg-muted rounded w-1/2"></div>
              <div className="h-4 bg-muted rounded w-1/3"></div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-6">
        <Card className="p-8 text-center">
          <User className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-medium mb-2">Cliente não encontrado</h3>
          <p className="text-muted-foreground mb-4">
            O cliente solicitado não foi encontrado ou você não tem permissão para visualizá-lo.
          </p>
          <Button onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{client.nome}</h1>
            <p className="text-muted-foreground">Detalhes do cliente</p>
          </div>
        </div>
        {user?.role === "admin" && (
          <Button
            variant="destructive"
            onClick={handleDeleteClientCascade}
            disabled={deleteClientCascadeMutation.isPending}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {deleteClientCascadeMutation.isPending ? "Excluindo..." : "Excluir Cliente e Casos"}
          </Button>
        )}
      </div>

      {/* Informações do Cliente */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <User className="h-5 w-5" />
          Informações Pessoais
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">CPF</label>
            <Snippet
              symbol=""
              copyIcon={
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                </svg>
              }
              classNames={{
                base: "w-full bg-muted",
                pre: "text-sm font-mono"
              }}
              style={{ borderRadius: "var(--radius)" }}
              onCopy={() => {
                // Copiar apenas números (sem pontos e hífens)
                const cpfNumeros = client.cpf.replace(/\D/g, '');
                navigator.clipboard.writeText(cpfNumeros);
              }}
            >
              {formatCPF(client.cpf)}
            </Snippet>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">Matrícula</label>
            <Snippet
              symbol=""
              copyIcon={
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                </svg>
              }
              classNames={{
                base: "w-full bg-muted",
                pre: "text-sm font-mono"
              }}
              style={{ borderRadius: "var(--radius)" }}
              onCopy={() => {
                // Copiar apenas números e letras (sem hífens)
                const matriculaSemFormatacao = client.matricula.replace(/[^a-zA-Z0-9]/g, '');
                navigator.clipboard.writeText(matriculaSemFormatacao);
              }}
            >
              {client.matricula}
            </Snippet>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Órgão</label>
            <p className="text-lg">{client.orgao || "—"}</p>
          </div>
        </div>

        {client.created_at && (
          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              Importado em {new Date(client.created_at).toLocaleDateString('pt-BR')} às {new Date(client.created_at).toLocaleTimeString('pt-BR')}
            </div>
          </div>
        )}
      </Card>

      {/* Endereço */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Endereço
        </h2>

        {addresses && addresses.length > 0 ? (
          <div className="space-y-3">
            {addresses.map((address: any) => (
              <div key={address.id} className="p-4 border rounded-lg bg-muted/30">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    {address.logradouro && (
                      <div>
                        <span className="text-sm text-muted-foreground">Logradouro:</span>
                        <p>{address.logradouro}{address.numero && `, ${address.numero}`}</p>
                      </div>
                    )}
                    {address.complemento && (
                      <div>
                        <span className="text-sm text-muted-foreground">Complemento:</span>
                        <p>{address.complemento}</p>
                      </div>
                    )}
                    {address.bairro && (
                      <div>
                        <span className="text-sm text-muted-foreground">Bairro:</span>
                        <p>{address.bairro}</p>
                      </div>
                    )}
                    <div className="flex gap-4">
                      {address.cidade && (
                        <div>
                          <span className="text-sm text-muted-foreground">Cidade:</span>
                          <p className="font-medium">{address.cidade}</p>
                        </div>
                      )}
                      {address.estado && (
                        <div>
                          <span className="text-sm text-muted-foreground">Estado:</span>
                          <p className="font-medium">{address.estado}</p>
                        </div>
                      )}
                    </div>
                    {address.cep && (
                      <div>
                        <span className="text-sm text-muted-foreground">CEP:</span>
                        <p>{address.cep}</p>
                      </div>
                    )}
                  </div>
                  {address.is_primary && (
                    <Badge className="bg-blue-100 text-blue-800">Principal</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <MapPin className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Nenhum endereço cadastrado</p>
            <p className="text-sm">Use a importação em massa para adicionar endereços</p>
          </div>
        )}
      </Card>

      {/* Contratos */}
      <Financiamentos clientId={parseInt(id)} />

      {/* Casos Associados ao Cliente */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Casos Associados ao Cliente ({casos.length})
          </h2>
          <Button
            onClick={handleCreateCase}
            disabled={createCase.isPending}
            size="sm"
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            {createCase.isPending ? "Criando..." : "Abrir Novo Caso"}
          </Button>
        </div>

        {casosLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            <div className="animate-pulse">Carregando casos...</div>
          </div>
        ) : casosError ? (
          <div className="text-center py-8 text-red-500">
            <p>Erro ao carregar casos</p>
            <p className="text-sm">{(casosError as any).message}</p>
          </div>
        ) : casos.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">ID</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Entidade/Banco</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Mês/Ano Ref.</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Criado em</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Última Atualização</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Atendente</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {casos.map((caso: any) => (
                  <tr key={caso.id} className="border-b hover:bg-muted/50 transition-colors">
                    <td className="py-3 px-4 text-sm font-mono">#{caso.id}</td>
                    <td className="py-3 px-4">
                      <StatusBadge status={caso.status} />
                    </td>
                    <td className="py-3 px-4 text-sm">{caso.entidade || '—'}</td>
                    <td className="py-3 px-4 text-sm">
                      {caso.ref_month && caso.ref_year
                        ? `${String(caso.ref_month).padStart(2, '0')}/${caso.ref_year}`
                        : caso.referencia_competencia || '—'
                      }
                    </td>
                    <td className="py-3 px-4 text-sm">
                      {caso.created_at ? new Date(caso.created_at).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="py-3 px-4 text-sm">
                      {caso.last_update_at ? new Date(caso.last_update_at).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="py-3 px-4 text-sm">
                      {caso.assigned_to || <span className="text-muted-foreground italic">Não atribuído</span>}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/casos/${caso.id}`)}
                      >
                        Ver Caso
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Nenhum caso associado a este cliente</p>
            <p className="text-sm mt-1">Os casos aparecerão aqui quando forem criados</p>
          </div>
        )}
      </Card>

      {/* Contratos Efetivados */}
      {contratos && contratos.length > 0 && (
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Contratos Efetivados ({contratos.length})
          </h2>

          <div className="space-y-4">
            {contratos.map((contrato: any) => (
              <div
                key={contrato.id}
                className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="font-mono">
                      Contrato #{contrato.id}
                    </Badge>
                    {getStatusBadge(contrato.status)}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Valor Total</p>
                      <p className="font-semibold">{formatCurrency(contrato.total_amount.toString())}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Parcelas</p>
                      <p className="font-semibold">{contrato.paid_installments}/{contrato.installments}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Consultoria Líquida</p>
                      <p className="font-semibold">{formatCurrency(contrato.consultoria_valor_liquido.toString())}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Data Efetivação</p>
                      <p className="font-semibold">
                        {contrato.disbursed_at ? new Date(contrato.disbursed_at).toLocaleDateString('pt-BR') : '-'}
                      </p>
                    </div>
                  </div>

                  {contrato.attachments && contrato.attachments.length > 0 && (
                    <div className="pt-2 border-t">
                      <p className="text-sm text-muted-foreground mb-2">
                        {contrato.attachments.length} {contrato.attachments.length === 1 ? 'anexo' : 'anexos'}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {contrato.attachments.map((att: any) => (
                          <Badge key={att.id} variant="secondary" className="text-xs">
                            <FileText className="h-3 w-3 mr-1" />
                            {att.filename}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(`/casos/${contrato.case_id}`)}
                >
                  <ArrowLeft className="h-4 w-4 mr-1 rotate-180" />
                  Ver Caso
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Chat do Cliente - Precisa de um caseId associado */}
      {/* Para clientes, vamos criar um chat global sem caseId específico */}
      {/* TODO: Implementar sistema de chat de cliente sem caseId ou usar o caso mais recente */}

      {/* Modal de Confirmação de Exclusão Simples */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              Confirmar Exclusão de Cliente
            </DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir este cliente? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteModal(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                deleteClientMutation.mutate(parseInt(id));
                setShowDeleteModal(false);
              }}
              disabled={deleteClientMutation.isPending}
            >
              {deleteClientMutation.isPending ? 'Excluindo...' : 'Confirmar Exclusão'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação de Exclusão em Cascata */}
      <Dialog open={showDeleteCascadeModal} onOpenChange={setShowDeleteCascadeModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              Confirmar Exclusão de Cliente e Casos
            </DialogTitle>
            <DialogDescription>
              {client?.financiamentos?.length > 0 
                ? `Tem certeza que deseja excluir este cliente e ${client.financiamentos.length} caso(s) associado(s)? Esta ação não pode ser desfeita.`
                : "Tem certeza que deseja excluir este cliente? Esta ação não pode ser desfeita."
              }
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteCascadeModal(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                deleteClientCascadeMutation.mutate(parseInt(id));
                setShowDeleteCascadeModal(false);
              }}
              disabled={deleteClientCascadeMutation.isPending}
            >
              {deleteClientCascadeMutation.isPending ? 'Excluindo...' : 'Confirmar Exclusão'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
