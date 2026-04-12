"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Download, Loader2 } from "lucide-react";

interface ExportClientsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: {
    searchTerm: string;
    selectedBanco: string | null;
    selectedCargo?: string | null;
    selectedStatus: string | null;
    selectedAgentId?: string | null;
    siapeMode?: "all" | "only" | "exclude";
    semContratos: boolean;
  };
}

// Define field categories
const FIELD_CATEGORIES = {
  basic: {
    label: "Dados Básicos",
    fields: [
      { id: "id", name: "ID" },
      { id: "nome", name: "Nome" },
      { id: "cpf", name: "CPF" },
      { id: "matricula", name: "Matrícula" },
      { id: "orgao", name: "Órgão" },
      { id: "cargo", name: "Cargo" },
      { id: "telefone_preferencial", name: "Telefone" },
      { id: "numero_cliente", name: "Número Cliente" },
      { id: "observacoes", name: "Observações" },
    ],
  },
  banking: {
    label: "Dados Bancários",
    fields: [
      { id: "banco", name: "Banco" },
      { id: "agencia", name: "Agência" },
      { id: "conta", name: "Conta" },
      { id: "chave_pix", name: "Chave PIX" },
      { id: "tipo_chave_pix", name: "Tipo Chave PIX" },
    ],
  },
  import: {
    label: "Dados de Importação",
    fields: [
      { id: "orgao_pgto_code", name: "Cód. Órgão Pagador" },
      { id: "orgao_pgto_name", name: "Nome Órgão Pagador" },
      { id: "status_desconto", name: "Status Desconto" },
      { id: "status_legenda", name: "Descrição Status" },
    ],
  },
  stats: {
    label: "Estatísticas",
    fields: [
      { id: "total_casos", name: "Total Casos" },
      { id: "total_contratos", name: "Total Contratos" },
      { id: "total_financiamentos", name: "Total Financiamentos" },
      { id: "casos_ativos", name: "Casos Ativos" },
      { id: "casos_finalizados", name: "Casos Finalizados" },
    ],
  },
};

// Default selected fields
const DEFAULT_FIELDS = ["nome", "cpf", "matricula", "orgao"];

export function ExportClientsDialog({
  open,
  onOpenChange,
  filters,
}: ExportClientsDialogProps) {
  const [selectedFields, setSelectedFields] =
    useState<Set<string>>(new Set(DEFAULT_FIELDS));
  const [isExporting, setIsExporting] = useState(false);

  const toggleField = (fieldId: string) => {
    const newSelected = new Set(selectedFields);
    if (newSelected.has(fieldId)) {
      newSelected.delete(fieldId);
    } else {
      newSelected.add(fieldId);
    }
    setSelectedFields(newSelected);
  };

  const toggleCategory = (categoryFields: { id: string; name: string }[]) => {
    const categoryIds = new Set(categoryFields.map((f) => f.id));
    const allSelected = categoryFields.every((f) =>
      selectedFields.has(f.id)
    );

    if (allSelected) {
      // Deselect all in category
      const newSelected = new Set(selectedFields);
      categoryIds.forEach((id) => newSelected.delete(id));
      setSelectedFields(newSelected);
    } else {
      // Select all in category
      const newSelected = new Set(selectedFields);
      categoryIds.forEach((id) => newSelected.add(id));
      setSelectedFields(newSelected);
    }
  };

  const handleExport = async () => {
    if (selectedFields.size === 0) {
      toast.error("Selecione pelo menos um campo para exportar");
      return;
    }

    setIsExporting(true);
    
    toast.info("Preparando exportação...", { id: "export-start" });

    try {
      // Build query params
      const params = new URLSearchParams({
        fields: Array.from(selectedFields).join(","),
      });

      if (filters.searchTerm) {
        params.append("q", filters.searchTerm);
      }
      if (filters.selectedBanco) {
        params.append("banco", filters.selectedBanco);
      }
      if (filters.siapeMode === "only") {
        params.set("banco", "SIAPE");
      } else if (filters.siapeMode === "exclude") {
        params.append("exclude_siape", "true");
      }
      if (filters.selectedCargo) {
        params.append("cargo", filters.selectedCargo);
      }
      if (filters.selectedStatus) {
        params.append("status", filters.selectedStatus);
      }
      if (filters.selectedAgentId) {
        params.append("agent_id", filters.selectedAgentId);
      }
      if (filters.semContratos) {
        params.append("sem_contratos", "true");
      }

      // Make request with increased timeout for large exports
      const response = await api.get(`/clients/export?${params.toString()}`, {
        responseType: "blob",
        timeout: 60000, // 60 seconds for export
      });

      // Create download link
      const blob = new Blob([response.data], {
        type: "text/csv;charset=utf-8;",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;

      // Generate filename with timestamp
      const now = new Date();
      const timestamp = now
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, -5);
      link.download = `clientes_export_${timestamp}.csv`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.dismiss("export-start");
      toast.success("Exportação realizada com sucesso!");
      onOpenChange(false);
    } catch (error: any) {
      console.error("Export error:", error);
      toast.dismiss("export-start");
      
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        toast.error("A exportação está demorando muito. Tente filtrar os dados ou exportar menos campos.");
      } else {
        toast.error(
          error?.response?.data?.message || "Erro ao exportar clientes"
        );
      }
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Exportar Clientes para CSV</DialogTitle>
          <DialogDescription>
            Selecione os campos que deseja incluir na exportação. Os filtros
            ativos serão aplicados à exportação.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {Object.entries(FIELD_CATEGORIES).map(([key, category]) => (
            <div key={key} className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">
                  {category.label}
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleCategory(category.fields)}
                  className="h-7 text-xs"
                >
                  {category.fields.every((f) => selectedFields.has(f.id))
                    ? "Limpar"
                    : "Selecionar Todos"}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {category.fields.map((field) => (
                  <div key={field.id} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={field.id}
                      checked={selectedFields.has(field.id)}
                      onChange={() => toggleField(field.id)}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <label
                      htmlFor={field.id}
                      className="text-sm cursor-pointer"
                    >
                      {field.name}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isExporting}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleExport}
            disabled={isExporting || selectedFields.size === 0}
          >
            {isExporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Exportando...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Exportar CSV
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
