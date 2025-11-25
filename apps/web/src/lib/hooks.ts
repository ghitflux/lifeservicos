import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, logAxiosError } from "./api";
import type { Case, CaseDetail } from "@/types";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function useCases(params?: { status?: string; mine?: boolean; q?: string; }) {
  const sp = new URLSearchParams();
  if (params?.status) sp.set("status", params.status);
  if (params?.mine) sp.set("mine", "true");
  if (params?.q) sp.set("q", params.q);
  return useQuery({
    queryKey: ["cases", params],
    queryFn: async () => (await api.get<{items: Case[]}>(`/cases?${sp.toString()}`)).data.items
  });
}

export function useCase(id: number) {
  return useQuery({
    queryKey: ["case", id],
    queryFn: async () => (await api.get<CaseDetail>(`/cases/${id}`)).data
  });
}

export function useAssignCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await api.post(`/cases/${id}/assign`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cases"] })
  });
}

export function usePatchCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({id, data}:{id:number, data:Partial<{telefone_preferencial:string; observacoes:string}>}) =>
      (await api.patch(`/cases/${id}`, data)).data,
    onSuccess: (_,vars) => {
      qc.invalidateQueries({ queryKey: ["case", vars.id] });
      qc.invalidateQueries({ queryKey: ["cases"] });
    }
  });
}

export function useAttachments(caseId: number) {
  return useQuery({
    queryKey: ["case", caseId, "attachments"],
    queryFn: async () => (await api.get(`/cases/${caseId}/attachments`)).data.items ?? [],
    enabled: !!caseId
  });
}

export function useDeleteAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ caseId, attachmentId }: { caseId: number; attachmentId: number }) =>
      (await api.delete(`/cases/${caseId}/attachments/${attachmentId}`)).data,
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["case", vars.caseId, "attachments"] });
      qc.invalidateQueries({ queryKey: ["case", vars.caseId] });
      toast.success("Anexo removido com sucesso");
    },
    onError: () => {
      toast.error("Erro ao remover anexo");
    }
  });
}

/** Histórico de telefones do cliente */
export function useClientPhones(clientId: number) {
  return useQuery({
    queryKey: ["client", clientId, "phones"],
    queryFn: async () => (await api.get(`/clients/${clientId}/phones`)).data?.items ?? [],
    enabled: !!clientId && clientId > 0
  });
}

export function useAddClientPhone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientId, phone, isPrimary }: { clientId: number; phone: string; isPrimary?: boolean }) =>
      (await api.post(`/clients/${clientId}/phones`, { phone, is_primary: isPrimary })).data,
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["client", vars.clientId, "phones"] });
      qc.invalidateQueries({ queryKey: ["case"] });
      toast.success("Telefone registrado com sucesso");
    },
    onError: () => {
      toast.error("Erro ao registrar telefone");
    }
  });
}

export function useDeleteClientPhone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientId, phoneId }: { clientId: number; phoneId: number }) =>
      (await api.delete(`/clients/${clientId}/phones/${phoneId}`)).data,
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["client", vars.clientId, "phones"] });
      toast.success("Telefone removido do histórico");
    },
    onError: () => {
      toast.error("Erro ao remover telefone");
    }
  });
}

/** Histórico de eventos do caso */
export function useCaseEvents(caseId: number) {
  return useQuery({
    queryKey: ["case", caseId, "events"],
    queryFn: async () => (await api.get(`/cases/${caseId}/events`)).data.events ?? [],
    enabled: !!caseId,
    refetchInterval: 30000 // Atualiza a cada 30 segundos
  });
}

export function useUploadAttachment(caseId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return (await api.post(`/cases/${caseId}/attachments`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      })).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["case", caseId] });
      qc.invalidateQueries({ queryKey: ["case", caseId, "attachments"] });
    },
  });
}

export function useSendToCalculista() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (caseId:number)=> (await api.post(`/cases/${caseId}/to-calculista`)).data,
    onSuccess: ()=> {
      qc.invalidateQueries({queryKey:["cases"]});
    },
    onError: (error) => {
      console.error("Erro ao enviar para calculista:", error);
    }
  });
}

export function useMarkNoContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (caseId: number) => (await api.post(`/cases/${caseId}/mark-no-contact`)).data,
    onSuccess: (_, caseId) => {
      qc.invalidateQueries({ queryKey: ["case", caseId] });
      qc.invalidateQueries({ queryKey: ["case", caseId, "events"] });
      qc.invalidateQueries({ queryKey: ["cases"] });
      toast.success("Marcado como sem contato");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Erro ao marcar sem contato");
    }
  });
}

export function useReturnToPipeline() {
  const qc = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: async (caseId: number) => (await api.post(`/cases/${caseId}/return-to-pipeline`)).data,
    onSuccess: (_, caseId) => {
      qc.invalidateQueries({ queryKey: ["case", caseId] });
      qc.invalidateQueries({ queryKey: ["case", caseId, "events"] });
      qc.invalidateQueries({ queryKey: ["cases"] });
      qc.invalidateQueries({ queryKey: ["clientPhones"] });
      toast.success("Caso devolvido para a esteira com sucesso!");
      // Redirecionar para a esteira após sucesso
      router.push('/esteira');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Erro ao devolver caso para a esteira");
    }
  });
}

export function useSendToFechamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (caseId: number) => (await api.post(`/cases/${caseId}/to-fechamento`)).data,
    onSuccess: (_, caseId) => {
      qc.invalidateQueries({ queryKey: ["case", caseId] });
      qc.invalidateQueries({ queryKey: ["cases"] });
      toast.success("Caso enviado para fechamento com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Erro ao enviar para fechamento");
    }
  });
}

export function useReassignCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({caseId, assigneeId}:{caseId:number, assigneeId:number})=>
      (await api.patch(`/cases/${caseId}/assignee`, {assignee_id: assigneeId})).data,
    onSuccess: (_, vars)=> {
      qc.invalidateQueries({queryKey:["case", vars.caseId]});
      qc.invalidateQueries({queryKey:["cases"]});
      toast.success("Caso reatribuído com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Erro ao reatribuir caso");
    }
  });
}

export function useCreateCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      client_id: number;
      entidade?: string;
      referencia_competencia?: string;
    }) => {
      const response = await api.post('/cases', data);
      return response.data;
    },
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: ['cases'] });
      qc.invalidateQueries({ queryKey: ['clientCases', variables.client_id] });
      toast.success(`Caso #${data.id} criado com sucesso!`);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Erro ao criar caso");
    }
  });
}

export function useUsers(role?: string) {
  const sp = new URLSearchParams();
  if (role) sp.set("role", role);
  return useQuery({
    queryKey: ["users", role],
    queryFn: async () => {
      const response = await api.get<Array<{id:number, name:string, email:string, role:string, active:boolean}>>(`/users?${sp.toString()}`);
      // Backend retorna array diretamente, não um objeto com items
      return response.data;
    }
  });
}

// Bulk delete hooks
export function useBulkDeleteCases() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: number[]) => (await api.post('/cases/bulk-delete', { ids })).data,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["cases"] });
      if (data.success_count > 0) {
        toast.success(`${data.success_count} caso(s) excluído(s) com sucesso`);
      }
      if (data.failed_count > 0) {
        toast.error(`${data.failed_count} caso(s) falharam ao excluir`);
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Erro ao excluir casos");
    }
  });
}

export function useBulkDeleteClients() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: number[]) => (await api.post('/clients/bulk-delete', { ids })).data,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      if (data.success_count > 0) {
        toast.success(`${data.success_count} cliente(s) excluído(s) com sucesso`);
      }
      if (data.failed_count > 0) {
        toast.error(`${data.failed_count} cliente(s) falharam ao excluir`);
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Erro ao excluir clientes");
    }
  });
}

export function useBulkDeleteUsers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: number[]) => (await api.post('/users/bulk-delete', { ids })).data,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["users"] });
      if (data.success_count > 0) {
        toast.success(`${data.success_count} usuário(s) excluído(s) com sucesso`);
      }
      if (data.failed_count > 0) {
        toast.error(`${data.failed_count} usuário(s) falharam ao excluir`);
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Erro ao excluir usuários");
    }
  });
}

export function useSims(status: "pending"|"approved"|"rejected"="pending") {
  return useQuery({
    queryKey: ["sims", status],
    queryFn: async ()=> (await api.get<{items:any[]}>(`/simulations?status=${status}`)).data.items
  });
}

export function useSimApprove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({simId, payload}:{simId:number, payload:{manual_input:any, results:any}})=>
      (await api.post(`/simulations/${simId}/approve`, payload)).data,
    onSuccess: ()=> {
      qc.invalidateQueries({queryKey:["sims","pending"]});
      qc.invalidateQueries({queryKey:["cases"]});
    }
  });
}

export function useSimReject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({simId, payload}:{simId:number, payload:{manual_input:any, results:any}})=>
      (await api.post(`/simulations/${simId}/reject`, payload)).data,
    onSuccess: ()=> {
      qc.invalidateQueries({queryKey:["sims","pending"]});
      qc.invalidateQueries({queryKey:["cases"]});
    }
  });
}

/** Fechamento */
export function useClosingQueue(params?: { search?: string; page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: ["closing", "queue", params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params?.search) searchParams.append("search", params.search);
      if (params?.page) searchParams.append("page", params.page.toString());
      if (params?.pageSize) searchParams.append("page_size", params.pageSize.toString());

      const response = await api.get(`/closing/queue?${searchParams.toString()}`);
      return {
        items: response.data.items ?? [],
        totalCount: response.data.total_count ?? 0,
        page: response.data.page ?? 1,
        pageSize: response.data.page_size ?? 20,
        totalPages: response.data.total_pages ?? 1
      };
    },
    staleTime: 5000, // Considerar dados obsoletos após 5 segundos
    refetchInterval: 10000, // Refetch a cada 10 segundos
    refetchOnWindowFocus: true,
    retry: 2,
  });
}
export function useClosingApprove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (caseId:number)=> (await api.post("/closing/approve",{case_id: caseId})).data,
    onSuccess: ()=> { qc.invalidateQueries({queryKey:["closing","queue"]}); qc.invalidateQueries({queryKey:["cases"]}); }
  });
}
export function useClosingReject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (caseId:number)=> (await api.post("/closing/reject",{case_id: caseId})).data,
    onSuccess: ()=> { qc.invalidateQueries({queryKey:["closing","queue"]}); qc.invalidateQueries({queryKey:["cases"]}); }
  });
}

/** Financeiro */
export function useFinanceQueue() {
  return useQuery({
    queryKey: ["financeQueue"],
    queryFn: async () => {
      const response = await api.get("/finance/queue");
      return response.data.items ?? [];
    }
  });
}

export function useFinanceMobileQueue() {
  return useQuery({
    queryKey: ["financeMobileQueue"],
    queryFn: async () => {
      const response = await api.get("/finance/mobile/queue");
      return response.data.items ?? [];
    }
  });
}
export function useFinanceDisburse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload:{case_id:number; total_amount:number; installments:number; disbursed_at?:string}) =>
      (await api.post("/finance/disburse", payload)).data,
    onSuccess: ()=> {
      qc.invalidateQueries({ queryKey: ["financeQueue"] });
      qc.invalidateQueries({queryKey:["finance","queue"]});
      qc.invalidateQueries({queryKey:["contracts"]});
      qc.invalidateQueries({queryKey:["cases"]});
    }
  });
}

export function useFinanceMobileApprove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (simulationId: string) => (await api.post(`/finance/mobile/${simulationId}/approve`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financeMobileQueue"] });
      qc.invalidateQueries({ queryKey: ["financeQueue"] });
    }
  });
}

export function useFinanceMobileCancel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (simulationId: string) => (await api.post(`/finance/mobile/${simulationId}/cancel`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financeMobileQueue"] });
    }
  });
}

export function useFinanceDisburseSimple() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      case_id: number;
      consultoria_bruta: number;
      imposto_percentual?: number;
      tem_corretor?: boolean;
      corretor_nome?: string | null;
      corretor_comissao_valor?: number | null;
      consultoria_liquida_ajustada?: number;
      percentual_atendente?: number;
      atendente_user_id?: number;
      // Campos antigos mantidos para compatibilidade
      commission_user_id?: number;
      commission_percentage?: number;
    }) => {
      const response = await api.post('/finance/disburse-simple', payload);
      return response.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance'] });
      qc.invalidateQueries({ queryKey: ['financeQueue'] });
      qc.invalidateQueries({ queryKey: ['financeMetrics'] });
      qc.invalidateQueries({ queryKey: ['contracts'] });
      qc.invalidateQueries({ queryKey: ['cases'] });
      qc.invalidateQueries({ queryKey: ['commissions'] });
    },
    onError: (error: any) => {
      console.error('Erro ao efetivar liberação:', error);
      toast.error(error.response?.data?.detail || "Erro ao efetivar liberação");
    }
  });
}

export function useCommissions(filters?: {
  start_date?: string;
  end_date?: string;
  user_id?: number;
}) {
  const sp = new URLSearchParams();
  if (filters?.start_date) sp.set("start_date", filters.start_date);
  if (filters?.end_date) sp.set("end_date", filters.end_date);
  if (filters?.user_id) sp.set("user_id", filters.user_id.toString());

  return useQuery({
    queryKey: ["finance", "commissions", filters],
    queryFn: async () => {
      const response = await api.get(`/finance/commissions?${sp.toString()}`);
      return response.data;
    },
    refetchInterval: 60000
  });
}

export function useCancelContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (contractId: number) => {
      const response = await api.post(`/finance/cancel/${contractId}`);
      return response.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['financeQueue'] });
      qc.invalidateQueries({ queryKey: ['finance', 'queue'] });
      qc.invalidateQueries({ queryKey: ['contracts'] });
      qc.invalidateQueries({ queryKey: ['cases'] });
    },
  });
}

export function useDeleteContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (contractId: number) => {
      const response = await api.delete(`/finance/delete/${contractId}`);
      return response.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['financeQueue'] });
      qc.invalidateQueries({ queryKey: ['finance', 'queue'] });
      qc.invalidateQueries({ queryKey: ['contracts'] });
      qc.invalidateQueries({ queryKey: ['cases'] });
    },
  });
}

export function useReturnToCalculista() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (caseId: number) => {
      const response = await api.post(`/cases/${caseId}/return-to-calculista`);
      return response.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['financeQueue'] });
      qc.invalidateQueries({ queryKey: ['finance', 'queue'] });
      qc.invalidateQueries({ queryKey: ['cases'] });
    },
  });
}

/** Contratos */
export function useContractAttachments(contractId: number) {
  return useQuery({
    queryKey: ["contract", contractId, "attachments"],
    queryFn: async () => (await api.get(`/contracts/${contractId}/attachments`)).data.items ?? [],
    enabled: !!contractId
  });
}

export function useUploadContractAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ contractId, file }: { contractId: number; file: File }) => {
      const form = new FormData();
      form.append("file", file);
      return (await api.post(`/contracts/${contractId}/attachments`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      })).data;
    },
    onSuccess: (_, { contractId }) => {
      qc.invalidateQueries({ queryKey: ["contract", contractId, "attachments"] });
      qc.invalidateQueries({ queryKey: ["financeQueue"] });
      qc.invalidateQueries({ queryKey: ["finance", "queue"] }); // Invalidar também a queue do financeiro
    },
  });
}

export function useDeleteContractAttachment(contractId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (attachmentId: number) =>
      (await api.delete(`/contracts/${contractId}/attachments/${attachmentId}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contract", contractId, "attachments"] });
      qc.invalidateQueries({ queryKey: ["financeQueue"] });
      qc.invalidateQueries({ queryKey: ["finance", "queue"] });
    },
  });
}

/** Métricas */
export function useFinanceMetrics() {
  return useQuery({
    queryKey:["finance","metrics"],
    queryFn: async ()=> (await api.get("/finance/metrics")).data,
    refetchInterval: 60000 // Refetch a cada minuto
  });
}

/** Receitas Manuais */
export function useFinanceIncomes() {
  return useQuery({
    queryKey:["finance","incomes"],
    queryFn: async ()=> (await api.get("/finance/incomes")).data.items ?? []
  });
}

export function useCreateIncome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {date?: string; amount: number; description?: string}) =>
      (await api.post("/finance/incomes", data)).data,
    onSuccess: ()=> {
      qc.invalidateQueries({queryKey:["finance","incomes"]});
      qc.invalidateQueries({queryKey:["finance","metrics"]});
    }
  });
}

export function useUpdateIncome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({id, data}: {id: number; data: {date?: string; amount: number; description?: string}}) =>
      (await api.put(`/finance/incomes/${id}`, data)).data,
    onSuccess: ()=> {
      qc.invalidateQueries({queryKey:["finance","incomes"]});
      qc.invalidateQueries({queryKey:["finance","metrics"]});
    }
  });
}

export function useDeleteIncome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) =>
      (await api.delete(`/finance/incomes/${id}`)).data,
    onSuccess: ()=> {
      qc.invalidateQueries({queryKey:["finance","incomes"]});
      qc.invalidateQueries({queryKey:["finance","metrics"]});
    }
  });
}

/** Upload de anexo para receita (arquivo único) */
export function useUploadIncomeAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({incomeId, file}: {incomeId: number; file: File}) => {
      const formData = new FormData();
      formData.append('file', file);
      return (await api.post(`/finance/incomes/${incomeId}/attachment`, formData, {
        headers: {'Content-Type': 'multipart/form-data'}
      })).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({queryKey:["finance","incomes"]});
    }
  });
}

/** Upload de múltiplos anexos para receita */
export function useUploadIncomeAttachments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({incomeId, files}: {incomeId: number; files: File[]}) => {
      const formData = new FormData();
      files.forEach(file => formData.append('files', file));
      return (await api.post(`/finance/incomes/${incomeId}/attachments`, formData, {
        headers: {'Content-Type': 'multipart/form-data'}
      })).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({queryKey:["finance","incomes"]});
    }
  });
}

/** Buscar anexos de receita */
export function useIncomeAttachments(incomeId: number) {
  return useQuery({
    queryKey: ["finance", "incomes", incomeId, "attachments"],
    queryFn: async () => (await api.get(`/finance/incomes/${incomeId}/attachments`)).data,
    enabled: !!incomeId
  });
}

/** Download de anexo de receita */
export function useDownloadIncomeAttachment() {
  return useMutation({
    mutationFn: async (incomeId: number) => {
      const response = await api.get(`/finance/incomes/${incomeId}/attachment`, {
        responseType: 'blob'
      });
      return response;
    }
  });
}

/** Delete de anexo de receita */
export function useDeleteIncomeAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (incomeId: number) =>
      (await api.delete(`/finance/incomes/${incomeId}/attachment`)).data,
    onSuccess: () => {
      qc.invalidateQueries({queryKey:["finance","incomes"]});
    }
  });
}

/** Upload de anexo para despesa (arquivo único) */
export function useUploadExpenseAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({expenseId, file}: {expenseId: number; file: File}) => {
      const formData = new FormData();
      formData.append('file', file);
      return (await api.post(`/finance/expenses/${expenseId}/attachment`, formData, {
        headers: {'Content-Type': 'multipart/form-data'}
      })).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({queryKey:["finance","expenses"]});
    }
  });
}

/** Upload de múltiplos anexos para despesa */
export function useUploadExpenseAttachments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({expenseId, files}: {expenseId: number; files: File[]}) => {
      const formData = new FormData();
      files.forEach(file => formData.append('files', file));
      return (await api.post(`/finance/expenses/${expenseId}/attachments`, formData, {
        headers: {'Content-Type': 'multipart/form-data'}
      })).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({queryKey:["finance","expenses"]});
    }
  });
}

/** Buscar anexos de despesa */
export function useExpenseAttachments(expenseId: number) {
  return useQuery({
    queryKey: ["finance", "expenses", expenseId, "attachments"],
    queryFn: async () => (await api.get(`/finance/expenses/${expenseId}/attachments`)).data,
    enabled: !!expenseId
  });
}

/** Download de anexo de despesa */
export function useDownloadExpenseAttachment() {
  return useMutation({
    mutationFn: async (expenseId: number) => {
      const response = await api.get(`/finance/expenses/${expenseId}/attachment`, {
        responseType: 'blob'
      });
      return response;
    }
  });
}

/** Delete de anexo de despesa */
export function useDeleteExpenseAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (expenseId: number) =>
      (await api.delete(`/finance/expenses/${expenseId}/attachment`)).data,
    onSuccess: () => {
      qc.invalidateQueries({queryKey:["finance","expenses"]});
    }
  });
}

/** Detalhes do Caso Financeiro */
export function useFinanceCaseDetails(caseId: number) {
  return useQuery({
    queryKey:["finance","case", caseId],
    queryFn: async ()=> (await api.get(`/finance/case/${caseId}`)).data,
    enabled: !!caseId
  });
}

/** Detalhes do Caso Fechamento */
export function useClosingCaseDetails(caseId: number) {
  return useQuery({
    queryKey:["closing","case", caseId],
    queryFn: async ()=> (await api.get(`/closing/case/${caseId}`)).data,
    enabled: !!caseId
  });
}

/** Séries Temporais para Gráficos */
export function useFinanceTimeseries() {
  return useQuery({
    queryKey:["finance","timeseries"],
    queryFn: async ()=> (await api.get("/finance/timeseries")).data,
    refetchInterval: 60000
  });
}

/** Analytics Dashboard */
export type AnalyticsRange = {
  from?: string;
  to?: string;
};

type AnalyticsBucket = "day" | "week" | "month";

const ANALYTICS_STALE_TIME = 60_000;

const buildAnalyticsParams = (range?: AnalyticsRange) => {
  const params: Record<string, string> = {};
  if (range?.from) params.from = range.from;
  if (range?.to) params.to = range.to;
  return params;
};

export function useAnalyticsKpis(range?: AnalyticsRange, selectedMonth?: string) {
  return useQuery({
    queryKey: ["analytics", "kpis", range?.from ?? null, range?.to ?? null, selectedMonth ?? null],
    queryFn: async () => {
      const params = buildAnalyticsParams(range);
      params.include_trends = "true";
      return (await api.get("/analytics/kpis", { params })).data;
    },
    staleTime: ANALYTICS_STALE_TIME,
    enabled: Boolean(range?.from && range?.to),
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  });
}

export function useAnalyticsSeries(range: AnalyticsRange | undefined, bucket: AnalyticsBucket, selectedMonth?: string) {
  return useQuery({
    queryKey: ["analytics", "series", range?.from ?? null, range?.to ?? null, bucket, selectedMonth ?? null],
    queryFn: async () => {
      const params = buildAnalyticsParams(range);
      params.bucket = bucket;
      return (await api.get("/analytics/series", { params })).data;
    },
    staleTime: ANALYTICS_STALE_TIME,
    enabled: Boolean(range?.from && range?.to),
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  });
}

export function useAnalyticsFunnel(range?: AnalyticsRange) {
  return useQuery({
    queryKey: ["analytics", "funnel", range?.from ?? null, range?.to ?? null],
    queryFn: async () => (await api.get("/analytics/funnel", { params: buildAnalyticsParams(range) })).data,
    staleTime: ANALYTICS_STALE_TIME,
    enabled: Boolean(range?.from && range?.to),
  });
}

export function useAnalyticsModules(range: AnalyticsRange | undefined, bucket: AnalyticsBucket) {
  return useQuery({
    queryKey: ["analytics", "modules", range?.from ?? null, range?.to ?? null, bucket],
    queryFn: async () => {
      const params = buildAnalyticsParams(range);
      params.bucket = bucket;
      return (await api.get("/analytics/by-module", { params })).data;
    },
    staleTime: ANALYTICS_STALE_TIME,
    enabled: Boolean(range?.from && range?.to),
  });
}

export function useAnalyticsHealth() {
  return useQuery({
    queryKey: ["analytics", "health"],
    queryFn: async () => (await api.get("/analytics/health")).data,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}


/** Dashboard (legacy) */
export function useDashboardStats() {
  return useQuery({
    queryKey:["dashboard","stats"],
    queryFn: async ()=> (await api.get("/dashboard/stats")).data,
    refetchInterval: 30000
  });
}

export function useDashboardStatusBreakdown() {
  return useQuery({
    queryKey:["dashboard","status-breakdown"],
    queryFn: async ()=> (await api.get("/dashboard/status-breakdown")).data,
    refetchInterval: 30000
  });
}

export function useDashboardPerformance() {
  return useQuery({
    queryKey:["dashboard","daily-performance"],
    queryFn: async ()=> (await api.get("/dashboard/daily-performance")).data,
    refetchInterval: 30000
  });
}

export function useDashboardChartData(period: string = "6m") {
  return useQuery({
    queryKey:["dashboard","chart-data", period],
    queryFn: async ()=> (await api.get(`/dashboard/chart-data?period=${period}`)).data,
    refetchInterval: 60000
  });
}

export function useDashboardUserPerformance() {
  return useQuery({
    queryKey:["dashboard","user-performance"],
    queryFn: async ()=> (await api.get("/dashboard/user-performance")).data,
    refetchInterval: 60000
  });
}

export function useDashboardMonthlyTrends() {
  return useQuery({
    queryKey:["dashboard","monthly-trends"],
    queryFn: async ()=> (await api.get("/dashboard/monthly-trends")).data,
    refetchInterval: 60000
  });
}

export function useMyStats() {
  return useQuery({
    queryKey:["dashboard","my-stats"],
    queryFn: async ()=> (await api.get("/dashboard/my-stats")).data,
    refetchInterval: 30000
  });
}



/** KPIs para módulo de Cálculo */
export function useCalculationKpis(params?: { from?: string; to?: string; month?: string }) {
  return useQuery({
    queryKey: ["calculation", "kpis", params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();

      // Converter month em start_date/end_date (igual ao Financeiro)
      if (params?.month) {
        const [year, month] = params.month.split('-');
        if (year && month && !isNaN(parseInt(year)) && !isNaN(parseInt(month))) {
          const startOfMonth = `${year}-${month.padStart(2, '0')}-01`;
          const endOfMonth = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];
          searchParams.append("from", startOfMonth);
          searchParams.append("to", endOfMonth);
        }
      } else if (params?.from && params?.to) {
        // Validar formato das datas
        const fromDate = new Date(params.from);
        const toDate = new Date(params.to);
        if (!isNaN(fromDate.getTime()) && !isNaN(toDate.getTime())) {
          searchParams.append("from", params.from);
          searchParams.append("to", params.to);
        }
      }

      searchParams.append("include_trends", "true");

      try {
        const response = await api.get(`/calculation/kpis?${searchParams.toString()}`);
        return response.data;
      } catch (error) {
        console.error('Erro ao carregar KPIs de cálculo:', error);
        // Retornar dados padrão em caso de erro
        return {
          pending: 0,
          approvedToday: 0,
          rejectedToday: 0,
          totalToday: 0,
          approvalRate: 0,
          volumeToday: 0,
          meta_mensal: 0,
          trends: {
            pending: 0,
            approvedToday: 0,
            approvalRate: 0,
            volumeToday: 0,
            meta_mensal: 0
          }
        };
      }
    },
    staleTime: 30000, // 30 segundos
    gcTime: 60000, // 1 minuto
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchInterval: 30000 // Refetch a cada 30 segundos
  });
}

/** KPIs para módulo de Fechamento */
export function useClosingKpis(params?: { from?: string; to?: string; month?: string }) {
  return useQuery({
    queryKey: ["closing", "kpis", params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();

      // Converter month em start_date/end_date (igual ao Financeiro)
      if (params?.month) {
        const [year, month] = params.month.split('-');
        const startOfMonth = `${year}-${month}-01`;
        const endOfMonth = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];
        searchParams.append("from_date", startOfMonth);
        searchParams.append("to_date", endOfMonth);
      } else if (params?.from && params?.to) {
        searchParams.append("from_date", params.from);
        searchParams.append("to_date", params.to);
      }

      searchParams.append("include_trends", "true");

      try {
        const response = await api.get(`/closing/kpis?${searchParams.toString()}`);
        return response.data;
      } catch (error) {
        console.error('Erro ao carregar KPIs de fechamento:', error);
        // Retornar dados padrão em caso de erro
        return {
          casos_pendentes: 0,
          casos_aprovados: 0,
          casos_reprovados: 0,
          taxa_aprovacao: 0,
          tempo_medio: 0,
          volume_financeiro: 0,
          consultoria_liquida: 0,
          meta_mensal: 0,
          trends: {
            casos_pendentes: 0,
            casos_aprovados: 0,
            taxa_aprovacao: 0,
            volume_financeiro: 0,
            consultoria_liquida: 0
          }
        };
      }
    },
    staleTime: 0, // Sempre considerar dados desatualizados
    gcTime: 60000, // 1 minuto
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchInterval: 5000 // Refetch a cada 5 segundos
  });
}

/** Hook para buscar dados financeiros para cálculo da Meta Mensal */
export function useFinancialData(params?: { month?: string }) {
  return useQuery({
    queryKey: ["financial", "data", params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params?.month) searchParams.append("month", params.month);

      try {
        const response = await api.get(`/financial/data?${searchParams.toString()}`);
        const data = response.data;

        // Meta Mensal já vem calculada do backend (10% do Lucro Líquido)
        return data;
      } catch (error) {
        console.error('Erro ao carregar dados financeiros:', error);
        // Retornar dados padrão em caso de erro
        return {
          receita_liquida: 0,
          consultoria_liquida: 0,
          despesas: 0,
          resultado: 0,
          meta_mensal: 0
        };
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutos
    gcTime: 10 * 60 * 1000, // 10 minutos
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchInterval: false
  });
}

/** Casos efetivados */
export function useCasosEfetivados() {
  return useQuery({
    queryKey: ["cases", "efetivados"],
    queryFn: async () => {
      const response = await api.get("/cases?status=contrato_efetivado");
      return response.data?.items || [];
    },
    refetchInterval: 30000, // Refetch a cada 30 segundos
    retry: 2,
    staleTime: 15000, // Considerar dados obsoletos após 15 segundos
  });
}

/** Casos cancelados */
export function useCasosCancelados() {
  return useQuery({
    queryKey: ["cases", "cancelados"],
    queryFn: async () => {
      const response = await api.get("/cases?status=contrato_cancelado");
      return response.data?.items || [];
    },
    refetchInterval: 30000, // Refetch a cada 30 segundos
    retry: 2,
    staleTime: 15000, // Considerar dados obsoletos após 15 segundos
  });
}

/** Receitas de Clientes Externos */
export function useExternalIncomes() {
  return useQuery({
    queryKey: ["finance", "external-incomes"],
    queryFn: async () => (await api.get("/finance/external-incomes")).data.items ?? [],
    refetchInterval: 60000
  });
}

export function useExternalIncome(id: number) {
  return useQuery({
    queryKey: ["finance", "external-incomes", id],
    queryFn: async () => (await api.get(`/finance/external-incomes/${id}`)).data,
    enabled: !!id
  });
}

export function useCreateExternalIncome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/finance/external-incomes', data);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Receita externa salva');
      qc.invalidateQueries({ queryKey: ['finance', 'external-incomes'] });
      qc.invalidateQueries({ queryKey: ['finance', 'metrics'] });
    },
    onError: (error: unknown) => {
      logAxiosError('FINANCE/EXTERNAL-INCOMES', error);
      const e = error as any;
      const msg = e?.response?.data?.detail || e?.message || 'Erro ao criar receita externa';
      toast.error(String(msg));
    },
  });
}

export function useUpdateExternalIncome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) =>
      (await api.put(`/finance/external-incomes/${id}`, data)).data,
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ["finance", "external-incomes"] });
      qc.invalidateQueries({ queryKey: ["finance", "external-incomes", id] });
      qc.invalidateQueries({ queryKey: ["finance", "metrics"] });
      qc.invalidateQueries({ queryKey: ["finance", "timeseries"] });
      toast.success("Receita de cliente externo atualizada com sucesso");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Erro ao atualizar receita de cliente externo");
    }
  });
}

export function useDeleteExternalIncome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) =>
      (await api.delete(`/finance/external-incomes/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance", "external-incomes"] });
      qc.invalidateQueries({ queryKey: ["finance", "metrics"] });
      qc.invalidateQueries({ queryKey: ["finance", "timeseries"] });
      toast.success("Receita de cliente externo removida com sucesso");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Erro ao remover receita de cliente externo");
    }
  });
}

/** Upload de anexo para receita externa */
export function useUploadExternalIncomeAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ incomeId, file }: { incomeId: number; file: File }) => {
      const formData = new FormData();
      formData.append('file', file);
      return (await api.post(`/finance/external-incomes/${incomeId}/attachment`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance", "external-incomes"] });
      toast.success("Anexo enviado com sucesso");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Erro ao enviar anexo");
    }
  });
}

/** Download de anexo de receita externa */
export function useDownloadExternalIncomeAttachment() {
  return useMutation({
    mutationFn: async (incomeId: number) => {
      const response = await api.get(`/finance/external-incomes/${incomeId}/attachment`, {
        responseType: 'blob'
      });
      return response;
    }
  });
}

/** Delete de anexo de receita externa */
export function useDeleteExternalIncomeAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (incomeId: number) =>
      (await api.delete(`/finance/external-incomes/${incomeId}/attachment`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance", "external-incomes"] });
      toast.success("Anexo removido com sucesso");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Erro ao remover anexo");
    }
  });
}

/** Criar Cliente Manual */
export function useCreateManualClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/clients/manual', data);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Cliente criado com sucesso');
      qc.invalidateQueries({ queryKey: ['/clients'] });
      qc.invalidateQueries({ queryKey: ['cases'] });
    },
    onError: (error: unknown) => {
      logAxiosError('CLIENTS/MANUAL', error);
      const e = error as any;
      const msg = e?.response?.data?.detail || e?.message || 'Erro ao criar cliente';
      toast.error(String(msg));
    },
  });
}

/** Reabrir caso efetivado para ajustes */
export function useReopenCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (caseId: number) => {
      const res = await api.post(`/finance/cases/${caseId}/reopen`);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Caso reaberto com sucesso!');
      qc.invalidateQueries({ queryKey: ['financeQueue'] });
      qc.invalidateQueries({ queryKey: ['financeContracts'] });
      qc.invalidateQueries({ queryKey: ['financeMetrics'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
    },
    onError: (error: unknown) => {
      logAxiosError('FINANCE/REOPEN', error);
      const e = error as any;
      const msg = e?.response?.data?.detail || e?.message || 'Erro ao reabrir caso';
      toast.error(String(msg));
    },
  });
}
