import * as XLSX from "xlsx";

interface Transaction {
  id: string;
  date: string;
  type: "receita" | "despesa";
  name?: string;
  client_name?: string;
  client_cpf?: string;
  agent_name?: string;
  category: string;
  amount: number;
}

interface ExportData {
  transactions: Transaction[];
  totals: {
    receitas: number;
    despesas: number;
    saldo: number;
  };
  filters: {
    transactionType?: string;
    startDate?: string;
    endDate?: string;
    agentName?: string;
    category?: string;
  };
}

export function exportToExcel(data: ExportData) {
  const { transactions, totals, filters } = data;

  if (transactions.length === 0) {
    throw new Error("Nenhuma transação para exportar");
  }

  // Criar workbook
  const wb = XLSX.utils.book_new();

  // **SHEET 1: RELATÓRIO DETALHADO**
  const wsData: any[][] = [];

  // Título e Período
  wsData.push([
    "RELATÓRIO DE RECEITAS E DESPESAS",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ]);
  wsData.push([]);

  // Informações do Filtro
  if (filters.startDate && filters.endDate) {
    wsData.push([
      "Período:",
      `${new Date(filters.startDate).toLocaleDateString("pt-BR")} a ${new Date(filters.endDate).toLocaleDateString("pt-BR")}`,
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
  }
  if (filters.transactionType && filters.transactionType !== "all") {
    wsData.push([
      "Tipo:",
      filters.transactionType === "receita" ? "Receitas" : "Despesas",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
  }
  if (filters.agentName) {
    wsData.push(["Atendente:", filters.agentName, "", "", "", "", "", ""]);
  }
  if (filters.category) {
    wsData.push(["Categoria:", filters.category, "", "", "", "", "", ""]);
  }
  wsData.push([]);

  // Cabeçalho da Tabela
  wsData.push([
    "Data",
    "Tipo",
    "Nome (Despesa/Receita)",
    "Cliente",
    "CPF",
    "Atendente",
    "Categoria",
    "Valor",
  ]);

  // Dados das Transações
  transactions.forEach((t) => {
    wsData.push([
      new Date(t.date).toLocaleDateString("pt-BR"),
      t.type === "receita" ? "Receita" : "Despesa",
      t.name || "-",
      t.client_name || "-",
      t.client_cpf
        ? t.client_cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
        : "-",
      t.agent_name || "-",
      t.category,
      t.amount,
    ]);
  });

  // Linha em branco antes dos totais
  wsData.push([]);

  // Totais
  wsData.push([
    "",
    "",
    "",
    "",
    "",
    "",
    "Total Receitas:",
    totals.receitas,
  ]);
  wsData.push([
    "",
    "",
    "",
    "",
    "",
    "",
    "Total Despesas:",
    totals.despesas,
  ]);
  wsData.push(["", "", "", "", "", "", "Saldo:", totals.saldo]);

  // Criar worksheet
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // **FORMATAÇÃO AVANÇADA**

  // Definir largura das colunas
  ws["!cols"] = [
    { wch: 12 }, // Data
    { wch: 10 }, // Tipo
    { wch: 30 }, // Nome
    { wch: 25 }, // Cliente
    { wch: 15 }, // CPF
    { wch: 20 }, // Atendente
    { wch: 20 }, // Categoria
    { wch: 15 }, // Valor
  ];

  // Formatar valores monetários (coluna H a partir da linha 8)
  const headerRow = 6; // Linha do cabeçalho (0-indexed, ajustado para sheet)
  const firstDataRow = headerRow + 1;
  const lastDataRow = firstDataRow + transactions.length - 1;
  const totalsStartRow = lastDataRow + 2;

  // Aplicar formato de moeda nas células de valor
  for (let row = firstDataRow; row <= lastDataRow; row++) {
    const cellAddress = XLSX.utils.encode_cell({ r: row, c: 7 }); // Coluna H (índice 7)
    if (ws[cellAddress]) {
      ws[cellAddress].t = "n"; // number type
      ws[cellAddress].z = 'R$ #,##0.00'; // formato brasileiro
    }
  }

  // Formatar totais
  for (let row = totalsStartRow; row <= totalsStartRow + 2; row++) {
    const cellAddress = XLSX.utils.encode_cell({ r: row, c: 7 }); // Coluna H
    if (ws[cellAddress]) {
      ws[cellAddress].t = "n";
      ws[cellAddress].z = 'R$ #,##0.00';
    }
  }

  // **SHEET 2: RESUMO EXECUTIVO**
  const summaryData: any[][] = [];
  summaryData.push(["RESUMO EXECUTIVO"]);
  summaryData.push([]);
  summaryData.push(["Métrica", "Valor"]);
  summaryData.push(["Total de Receitas", totals.receitas]);
  summaryData.push(["Total de Despesas", totals.despesas]);
  summaryData.push(["Saldo Líquido", totals.saldo]);
  summaryData.push([]);
  summaryData.push([
    "Quantidade de Transações",
    transactions.length.toString(),
  ]);

  // Contar receitas e despesas
  const receitasCount = transactions.filter((t) => t.type === "receita").length;
  const despesasCount = transactions.filter((t) => t.type === "despesa").length;
  summaryData.push(["Quantidade de Receitas", receitasCount.toString()]);
  summaryData.push(["Quantidade de Despesas", despesasCount.toString()]);

  const ws2 = XLSX.utils.aoa_to_sheet(summaryData);
  ws2["!cols"] = [{ wch: 25 }, { wch: 20 }];

  // Formatar valores monetários do resumo
  for (let row = 3; row <= 5; row++) {
    const cellAddress = XLSX.utils.encode_cell({ r: row, c: 1 });
    if (ws2[cellAddress]) {
      ws2[cellAddress].t = "n";
      ws2[cellAddress].z = 'R$ #,##0.00';
    }
  }

  // Adicionar sheets ao workbook
  XLSX.utils.book_append_sheet(wb, ws, "Relatório Detalhado");
  XLSX.utils.book_append_sheet(wb, ws2, "Resumo Executivo");

  // Gerar nome do arquivo
  const dateRange =
    filters.startDate && filters.endDate
      ? `${filters.startDate}_${filters.endDate}`
      : "completo";
  const filename = `receitas-despesas-${dateRange}.xlsx`;

  // Exportar
  XLSX.writeFile(wb, filename);

  return filename;
}
