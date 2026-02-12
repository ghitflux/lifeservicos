"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
} from "@lifecalling/ui";
import { Download, FileSpreadsheet } from "lucide-react";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (filters: ExportFilters) => void;
  availableAgents?: Array<{ id: number; name: string }>;
  availableCategories?: string[];
}

export interface ExportFilters {
  transactionType: "all" | "receita" | "despesa";
  startDate: string;
  endDate: string;
  agentId: number | null;
  category: string | null;
}

export function ExportModal({
  isOpen,
  onClose,
  onExport,
  availableAgents = [],
  availableCategories = [],
}: ExportModalProps) {
  const [transactionType, setTransactionType] = useState<"all" | "receita" | "despesa">("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [agentId, setAgentId] = useState<number | null>(null);
  const [category, setCategory] = useState<string | null>(null);

  const handleExport = () => {
    onExport({
      transactionType,
      startDate,
      endDate,
      agentId,
      category,
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-success" />
            Exportar Relatório (Excel)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Tipo de Lançamento */}
          <div>
            <label className="text-sm font-medium mb-2 block">
              Tipo de Lançamento
            </label>
            <select
              className="w-full px-3 py-2 rounded-md border border-input bg-background"
              value={transactionType}
              onChange={(e) => setTransactionType(e.target.value as "all" | "receita" | "despesa")}
            >
              <option value="all">Todas as Transações</option>
              <option value="receita">Apenas Receitas</option>
              <option value="despesa">Apenas Despesas</option>
            </select>
          </div>

          {/* Período */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-2 block">
                Data Inicial
              </label>
              <input
                type="date"
                className="w-full px-3 py-2 rounded-md border border-input bg-background"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">
                Data Final
              </label>
              <input
                type="date"
                className="w-full px-3 py-2 rounded-md border border-input bg-background"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {/* Atendente */}
          {availableAgents.length > 0 && (
            <div>
              <label className="text-sm font-medium mb-2 block">
                Atendente (opcional)
              </label>
              <select
                className="w-full px-3 py-2 rounded-md border border-input bg-background"
                value={agentId || ""}
                onChange={(e) => setAgentId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Todos os Atendentes</option>
                {availableAgents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Categoria */}
          {availableCategories.length > 0 && (
            <div>
              <label className="text-sm font-medium mb-2 block">
                Categoria (opcional)
              </label>
              <select
                className="w-full px-3 py-2 rounded-md border border-input bg-background"
                value={category || ""}
                onChange={(e) => setCategory(e.target.value || null)}
              >
                <option value="">Todas as Categorias</option>
                {availableCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Info Box */}
          <div className="rounded-lg border border-info/40 bg-info/10 p-3">
            <p className="text-sm text-info-foreground">
              <strong>Dica:</strong> Deixe os filtros em branco para exportar todos os dados do período selecionado.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleExport}
            className="bg-success hover:bg-success/90"
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar Excel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
