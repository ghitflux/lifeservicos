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

  // Calcular impostos EXATAMENTE como nos KPIs (apenas categoria "imposto", SEM comissão)
  const impostos = transactions
    .filter(t => t.type === 'despesa' && t.category?.toLowerCase().includes('imposto'))
    .reduce((sum, t) => sum + t.amount, 0);

  // Calcular outras despesas (despesas que não são impostos)
  const outrasDespesas = totals.despesas - impostos;

  // Receita total = Consultoria + Impostos (mesma lógica dos KPIs)
  const receitaTotal = totals.receitas + impostos;

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
  wsData.push(["", "", "", "", "", "", "═══════════════════════════", "═══════════════"]);

  // CONSULTORIA
  wsData.push([
    "",
    "",
    "",
    "",
    "",
    "",
    "CONSULTORIA TOTAL:",
    totals.receitas,
  ]);

  // IMPOSTOS
  wsData.push([
    "",
    "",
    "",
    "",
    "",
    "",
    "IMPOSTOS:",
    impostos,
  ]);

  // RECEITA TOTAL (Consultoria + Impostos)
  wsData.push([
    "",
    "",
    "",
    "",
    "",
    "",
    "RECEITA TOTAL:",
    receitaTotal,
  ]);
  wsData.push([]);

  // DESPESAS (sem impostos)
  wsData.push([
    "",
    "",
    "",
    "",
    "",
    "",
    "DESPESAS (sem impostos):",
    outrasDespesas,
  ]);
  wsData.push([]);
  wsData.push(["", "", "", "", "", "", "═══════════════════════════", "═══════════════"]);

  // LUCRO LÍQUIDO
  wsData.push([
    "",
    "",
    "",
    "",
    "",
    "",
    "LUCRO LÍQUIDO:",
    totals.receitas - impostos - outrasDespesas,
  ]);

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
  // Nova estrutura: separador, consultoria, impostos, receita total, vazio, despesas, vazio, separador, lucro líquido
  const totalRows = [
    totalsStartRow + 1,  // Consultoria Total
    totalsStartRow + 2,  // Impostos
    totalsStartRow + 3,  // Receita Total
    totalsStartRow + 5,  // Despesas
    totalsStartRow + 8,  // Lucro Líquido
  ];

  for (const row of totalRows) {
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

  // VALORES FINANCEIROS
  summaryData.push(["═══════════════════════════", "═══════════════"]);
  summaryData.push(["RECEITAS", ""]);
  summaryData.push(["Consultoria Total", totals.receitas]);
  summaryData.push(["Impostos", impostos]);
  summaryData.push(["Receita Total (Consultoria + Impostos)", receitaTotal]);
  summaryData.push([]);

  summaryData.push(["DESPESAS", ""]);
  summaryData.push(["Despesas (sem impostos)", outrasDespesas]);
  summaryData.push([]);

  summaryData.push(["═══════════════════════════", "═══════════════"]);
  summaryData.push(["LUCRO LÍQUIDO", totals.receitas - impostos - outrasDespesas]);
  summaryData.push(["═══════════════════════════", "═══════════════"]);
  summaryData.push([]);

  // QUANTIDADES
  summaryData.push(["QUANTIDADE DE TRANSAÇÕES", ""]);
  const receitasCount = transactions.filter((t) => t.type === "receita").length;
  const despesasCount = transactions.filter((t) => t.type === "despesa").length;
  const impostosCount = transactions.filter(
    (t) => t.type === "despesa" && t.category?.toLowerCase().includes('imposto')
  ).length;
  const outrasDespesasCount = despesasCount - impostosCount;

  summaryData.push(["Total de Transações", transactions.length.toString()]);
  summaryData.push(["  • Receitas (Consultoria)", receitasCount.toString()]);
  summaryData.push(["  • Despesas", despesasCount.toString()]);
  summaryData.push(["    - Impostos", impostosCount.toString()]);
  summaryData.push(["    - Outras Despesas", outrasDespesasCount.toString()]);

  const ws2 = XLSX.utils.aoa_to_sheet(summaryData);
  ws2["!cols"] = [{ wch: 35 }, { wch: 20 }];

  // Formatar valores monetários do resumo
  // Linhas: Consultoria (4), Impostos (5), Receita Total (6), Despesas (9), Lucro Líquido (12)
  const summaryMoneyRows = [4, 5, 6, 9, 12];
  for (const row of summaryMoneyRows) {
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
