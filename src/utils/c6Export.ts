import * as XLSX from 'xlsx';

interface PaymentRow {
  employeeName: string;
  pixKey: string;
  amount: number;
  paymentDate: string;
  description: string;
}

interface ExportMetadata {
  generatedBy: string;
  generatedAt: string;
  totalPayments: number;
  totalAmount: number;
  periodStart: string;
  periodEnd: string;
}

const applyBorder = (borderStyle: any = 'thin') => ({
  top: { style: borderStyle, color: { rgb: '000000' } },
  bottom: { style: borderStyle, color: { rgb: '000000' } },
  left: { style: borderStyle, color: { rgb: '000000' } },
  right: { style: borderStyle, color: { rgb: '000000' } }
});

const applyCellStyle = (cell: any, style: any) => {
  if (!cell) return;
  cell.s = { ...cell.s, ...style };
};

const validatePixKey = (pixKey: string): boolean => {
  if (!pixKey || pixKey.trim().length === 0) return false;

  const cpfRegex = /^\d{11}$/;
  const cnpjRegex = /^\d{14}$/;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^\d{10,11}$/;
  const randomKeyRegex = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

  const cleanKey = pixKey.replace(/[^\w@.-]/g, '');

  return cpfRegex.test(cleanKey) ||
         cnpjRegex.test(cleanKey) ||
         emailRegex.test(pixKey) ||
         phoneRegex.test(cleanKey) ||
         randomKeyRegex.test(cleanKey);
};

export const exportC6PaymentSheet = async (
  paymentRows: PaymentRow[],
  periodStart?: string,
  periodEnd?: string
) => {
  try {
    const workbook = XLSX.utils.book_new();

    const metadata: ExportMetadata = {
      generatedBy: 'Sistema de Gestão de Pagamentos',
      generatedAt: new Date().toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        dateStyle: 'short',
        timeStyle: 'short'
      }),
      totalPayments: paymentRows.length,
      totalAmount: paymentRows.reduce((sum, row) => sum + row.amount, 0),
      periodStart: periodStart || '',
      periodEnd: periodEnd || ''
    };

    createPaymentSheet(workbook, paymentRows, metadata);
    createSummarySheet(workbook, paymentRows, metadata);
    createInstructionsSheet(workbook);

    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    const timeStr = today.toTimeString().split(' ')[0].replace(/:/g, '');
    const filename = `Pagamento_C6_${dateStr}_${timeStr}.xlsx`;

    XLSX.writeFile(workbook, filename, {
      bookType: 'xlsx',
      type: 'binary',
      cellStyles: true
    });
  } catch (error) {
    console.error('Erro ao gerar planilha:', error);
    throw error;
  }
};

const createPaymentSheet = (
  workbook: XLSX.WorkBook,
  paymentRows: PaymentRow[],
  metadata: ExportMetadata
) => {
  const worksheetData: any[][] = [
    ['PLANILHA DE PAGAMENTOS - BANCO C6', '', '', '', '', ''],
    [`Gerado em: ${metadata.generatedAt}`, '', `Total: R$ ${metadata.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, '', '', ''],
    [],
    ['ATENÇÃO: Não altere o cabeçalho desta planilha'],
    [],
    ['#', 'Nome do funcionário', 'Chave ou código Pix', 'Valor', 'Data de pagamento', 'Descrição (opcional)', 'Status']
  ];

  paymentRows.forEach((row, index) => {
    const isValid = validatePixKey(row.pixKey) && row.amount > 0 && row.employeeName.trim().length > 0;
    worksheetData.push([
      index + 1,
      row.employeeName,
      row.pixKey,
      row.amount,
      formatDateForExcel(row.paymentDate),
      row.description || '',
      isValid ? 'OK' : 'VERIFICAR'
    ]);
  });

  const lastRow = worksheetData.length;
  worksheetData.push([
    '',
    'TOTAL',
    '',
    { f: `SUM(D7:D${lastRow})` },
    '',
    '',
    ''
  ]);

  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

  const columnWidths = [
    { wch: 5 },
    { wch: 35 },
    { wch: 35 },
    { wch: 15 },
    { wch: 18 },
    { wch: 45 },
    { wch: 12 }
  ];
  worksheet['!cols'] = columnWidths;

  const rowHeights: any[] = [];
  rowHeights[0] = { hpx: 30 };
  rowHeights[1] = { hpx: 20 };
  rowHeights[3] = { hpx: 25 };
  rowHeights[5] = { hpx: 30 };
  worksheet['!rows'] = rowHeights;

  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');

  applyCellStyle(worksheet['A1'], {
    font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '1F4788' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: applyBorder('medium')
  });

  applyCellStyle(worksheet['A2'], {
    font: { sz: 10, italic: true },
    fill: { fgColor: { rgb: 'E8F0FE' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: applyBorder()
  });

  applyCellStyle(worksheet['C2'], {
    font: { bold: true, sz: 11, color: { rgb: '0F9D58' } },
    fill: { fgColor: { rgb: 'E8F0FE' } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: applyBorder()
  });

  applyCellStyle(worksheet['A4'], {
    font: { bold: true, sz: 11, color: { rgb: 'D50000' } },
    fill: { fgColor: { rgb: 'FFF3CD' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: applyBorder('medium')
  });

  for (let col = range.s.c; col <= range.e.c; col++) {
    const headerAddress = XLSX.utils.encode_cell({ r: 5, c: col });
    if (worksheet[headerAddress]) {
      applyCellStyle(worksheet[headerAddress], {
        font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '2C5F8D' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: applyBorder('medium')
      });
    }
  }

  for (let row = 6; row <= range.e.r - 1; row++) {
    const rowIndex = row - 6;
    const isEvenRow = rowIndex % 2 === 0;
    const bgColor = isEvenRow ? 'FFFFFF' : 'F8F9FA';

    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = worksheet[cellAddress];

      if (cell) {
        const baseStyle: any = {
          fill: { fgColor: { rgb: bgColor } },
          border: applyBorder(),
          alignment: { vertical: 'center' }
        };

        if (col === 0) {
          baseStyle.alignment.horizontal = 'center';
          baseStyle.font = { bold: true, color: { rgb: '5F6368' } };
        } else if (col === 3) {
          cell.z = '_-R$ * #,##0.00_-;-R$ * #,##0.00_-;_-R$ * "-"??_-;_-@_-';
          baseStyle.alignment.horizontal = 'right';
          baseStyle.font = { bold: true };
        } else if (col === 4) {
          baseStyle.alignment.horizontal = 'center';
        } else if (col === 6) {
          baseStyle.alignment.horizontal = 'center';
          const status = cell.v;
          if (status === 'OK') {
            baseStyle.font = { bold: true, color: { rgb: '0F9D58' } };
            baseStyle.fill = { fgColor: { rgb: 'D4EDDA' } };
          } else {
            baseStyle.font = { bold: true, color: { rgb: 'D50000' } };
            baseStyle.fill = { fgColor: { rgb: 'F8D7DA' } };
          }
        } else {
          baseStyle.alignment.horizontal = 'left';
        }

        applyCellStyle(cell, baseStyle);
      }
    }
  }

  const totalRow = range.e.r;
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: totalRow, c: col });
    const cell = worksheet[cellAddress];

    if (cell) {
      const totalStyle: any = {
        font: { bold: true, sz: 12 },
        fill: { fgColor: { rgb: 'FFF59D' } },
        border: applyBorder('medium'),
        alignment: { vertical: 'center' }
      };

      if (col === 3) {
        cell.z = '_-R$ * #,##0.00_-;-R$ * #,##0.00_-;_-R$ * "-"??_-;_-@_-';
        totalStyle.alignment.horizontal = 'right';
        totalStyle.font.color = { rgb: '0F9D58' };
        totalStyle.font.sz = 13;
      } else {
        totalStyle.alignment.horizontal = 'center';
      }

      applyCellStyle(cell, totalStyle);
    }
  }

  if (!worksheet['!merges']) {
    worksheet['!merges'] = [];
  }
  worksheet['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } });
  worksheet['!merges'].push({ s: { r: 1, c: 0 }, e: { r: 1, c: 1 } });
  worksheet['!merges'].push({ s: { r: 1, c: 2 }, e: { r: 1, c: 6 } });
  worksheet['!merges'].push({ s: { r: 3, c: 0 }, e: { r: 3, c: 6 } });

  worksheet['!autofilter'] = { ref: `A6:G${range.e.r - 1}` };

  if (!worksheet['!freeze']) {
    worksheet['!freeze'] = { xSplit: 0, ySplit: 6 };
  }

  worksheet['!protect'] = {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: false,
    formatRows: false,
    insertColumns: false,
    insertRows: false,
    insertHyperlinks: false,
    deleteColumns: false,
    deleteRows: false,
    sort: true,
    autoFilter: true,
    pivotTables: false
  };

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Pagamentos PIX');
};

const createSummarySheet = (
  workbook: XLSX.WorkBook,
  paymentRows: PaymentRow[],
  metadata: ExportMetadata
) => {
  const totalAmount = paymentRows.reduce((sum, row) => sum + row.amount, 0);
  const averageAmount = totalAmount / paymentRows.length;
  const maxPayment = Math.max(...paymentRows.map(r => r.amount));
  const minPayment = Math.min(...paymentRows.map(r => r.amount));

  const validPayments = paymentRows.filter(row =>
    validatePixKey(row.pixKey) && row.amount > 0 && row.employeeName.trim().length > 0
  );

  const invalidPayments = paymentRows.length - validPayments.length;

  const summaryData: any[][] = [
    ['RESUMO EXECUTIVO - PAGAMENTOS C6 BANK'],
    [],
    ['Informações Gerais'],
    ['Data de Geração:', metadata.generatedAt],
    ['Sistema:', metadata.generatedBy],
    ['Período de Referência:', metadata.periodStart && metadata.periodEnd ?
      `${formatDateForExcel(metadata.periodStart)} a ${formatDateForExcel(metadata.periodEnd)}` : 'N/A'],
    [],
    ['Estatísticas de Pagamentos'],
    ['Total de Pagamentos:', paymentRows.length],
    ['Pagamentos Válidos:', validPayments.length],
    ['Pagamentos com Erro:', invalidPayments],
    ['Taxa de Sucesso:', validPayments.length / paymentRows.length],
    [],
    ['Valores Financeiros'],
    ['Valor Total:', totalAmount],
    ['Valor Médio:', averageAmount],
    ['Maior Pagamento:', maxPayment],
    ['Menor Pagamento:', minPayment],
    [],
    ['Observações'],
    ['• Todos os valores estão em Reais (BRL)'],
    ['• Pagamentos com status "VERIFICAR" precisam de revisão'],
    ['• Chaves PIX devem estar no formato correto'],
    ['• Esta planilha foi gerada automaticamente']
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);

  summarySheet['!cols'] = [
    { wch: 30 },
    { wch: 50 }
  ];

  const summaryRange = XLSX.utils.decode_range(summarySheet['!ref'] || 'A1');

  applyCellStyle(summarySheet['A1'], {
    font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '1F4788' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: applyBorder('medium')
  });

  const sectionHeaders = [3, 8, 14, 20];
  sectionHeaders.forEach(row => {
    const cellAddress = XLSX.utils.encode_cell({ r: row - 1, c: 0 });
    applyCellStyle(summarySheet[cellAddress], {
      font: { bold: true, sz: 12, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '2C5F8D' } },
      alignment: { horizontal: 'left', vertical: 'center' },
      border: applyBorder('medium')
    });
  });

  for (let row = 0; row <= summaryRange.e.r; row++) {
    for (let col = 0; col <= summaryRange.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = summarySheet[cellAddress];

      if (cell && row > 0 && !sectionHeaders.includes(row + 1) && row !== 0) {
        if (col === 1 && typeof cell.v === 'number') {
          if (row === 11) {
            cell.z = '0.00%';
          } else if (row >= 14 && row <= 17) {
            cell.z = '_-R$ * #,##0.00_-;-R$ * #,##0.00_-;_-R$ * "-"??_-;_-@_-';
          }

          applyCellStyle(cell, {
            font: { bold: true, sz: 11 },
            alignment: { horizontal: 'right', vertical: 'center' },
            border: applyBorder()
          });
        } else if (col === 0) {
          applyCellStyle(cell, {
            font: { bold: true, sz: 10 },
            alignment: { horizontal: 'left', vertical: 'center' },
            fill: { fgColor: { rgb: 'F8F9FA' } },
            border: applyBorder()
          });
        } else {
          applyCellStyle(cell, {
            alignment: { horizontal: 'left', vertical: 'center' },
            border: applyBorder()
          });
        }
      }
    }
  }

  if (!summarySheet['!merges']) {
    summarySheet['!merges'] = [];
  }
  summarySheet['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } });
  sectionHeaders.forEach(row => {
    summarySheet['!merges']!.push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: 1 } });
  });

  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumo');
};

const createInstructionsSheet = (workbook: XLSX.WorkBook) => {
  const instructionsData: any[][] = [
    ['INSTRUÇÕES DE USO - PLANILHA DE PAGAMENTOS C6 BANK'],
    [],
    ['1. SOBRE ESTA PLANILHA'],
    ['Esta planilha foi gerada automaticamente pelo Sistema de Gestão de Pagamentos'],
    ['e está formatada para importação direta no sistema do Banco C6.'],
    [],
    ['2. COMO UTILIZAR'],
    ['• Acesse o portal do Banco C6 (https://www.c6bank.com.br)'],
    ['• Navegue até a seção de Pagamentos PIX em lote'],
    ['• Faça o upload desta planilha na aba "Pagamentos PIX"'],
    ['• Verifique os dados e confirme o processamento'],
    [],
    ['3. VALIDAÇÕES IMPORTANTES'],
    ['• Todos os campos obrigatórios devem estar preenchidos'],
    ['• Chaves PIX devem estar no formato correto (CPF, CNPJ, e-mail, telefone ou chave aleatória)'],
    ['• Valores devem ser maiores que zero'],
    ['• Datas devem estar no formato DD/MM/AAAA'],
    ['• A coluna "Status" indica se há problemas: OK (válido) ou VERIFICAR (requer atenção)'],
    [],
    ['4. FORMATOS DE CHAVE PIX ACEITOS'],
    ['• CPF: 11 dígitos numéricos'],
    ['• CNPJ: 14 dígitos numéricos'],
    ['• E-mail: formato válido de e-mail'],
    ['• Telefone: 10 ou 11 dígitos (com DDD)'],
    ['• Chave Aleatória: formato UUID (ex: 123e4567-e89b-12d3-a456-426614174000)'],
    [],
    ['5. ATENÇÃO'],
    ['• NÃO altere o cabeçalho da planilha'],
    ['• NÃO modifique a formatação das células'],
    ['• NÃO adicione ou remova colunas'],
    ['• REVISE todos os dados antes de enviar ao banco'],
    ['• GUARDE uma cópia desta planilha para auditoria'],
    [],
    ['6. SUPORTE'],
    ['Em caso de dúvidas ou problemas, entre em contato com:'],
    ['• Departamento Financeiro'],
    ['• Suporte Técnico do Sistema'],
    [],
    ['7. SEGURANÇA'],
    ['• Esta planilha contém dados sensíveis'],
    ['• Mantenha em local seguro'],
    ['• Não compartilhe por e-mail sem criptografia'],
    ['• Exclua após o processamento bem-sucedido']
  ];

  const instructionsSheet = XLSX.utils.aoa_to_sheet(instructionsData);

  instructionsSheet['!cols'] = [{ wch: 100 }];

  const instrRange = XLSX.utils.decode_range(instructionsSheet['!ref'] || 'A1');

  applyCellStyle(instructionsSheet['A1'], {
    font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '1F4788' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: applyBorder('medium')
  });

  const sectionTitles = [3, 7, 13, 20, 26, 32, 37];
  sectionTitles.forEach(row => {
    const cellAddress = XLSX.utils.encode_cell({ r: row - 1, c: 0 });
    applyCellStyle(instructionsSheet[cellAddress], {
      font: { bold: true, sz: 12, color: { rgb: '1F4788' } },
      fill: { fgColor: { rgb: 'E8F0FE' } },
      alignment: { horizontal: 'left', vertical: 'center' },
      border: applyBorder('medium')
    });
  });

  for (let row = 0; row <= instrRange.e.r; row++) {
    const cellAddress = XLSX.utils.encode_cell({ r: row, c: 0 });
    const cell = instructionsSheet[cellAddress];

    if (cell && row > 0 && !sectionTitles.includes(row + 1) && row !== 0) {
      const text = cell.v?.toString() || '';
      const isWarning = text.includes('NÃO') || text.includes('ATENÇÃO');

      applyCellStyle(cell, {
        font: {
          sz: 10,
          color: isWarning ? { rgb: 'D50000' } : { rgb: '000000' },
          bold: isWarning
        },
        alignment: {
          horizontal: 'left',
          vertical: 'center',
          wrapText: true
        },
        fill: { fgColor: { rgb: isWarning ? 'FFF3CD' : 'FFFFFF' } },
        border: applyBorder()
      });
    }
  }

  if (!instructionsSheet['!merges']) {
    instructionsSheet['!merges'] = [];
  }
  instructionsSheet['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 0 } });

  const rowHeights: any[] = [];
  for (let i = 0; i <= instrRange.e.r; i++) {
    if (i === 0) {
      rowHeights[i] = { hpx: 30 };
    } else if (sectionTitles.includes(i + 1)) {
      rowHeights[i] = { hpx: 25 };
    } else {
      rowHeights[i] = { hpx: 20 };
    }
  }
  instructionsSheet['!rows'] = rowHeights;

  XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Instruções');
};

const formatDateForExcel = (dateString: string): string => {
  const [year, month, day] = dateString.split('-');
  return `${day}/${month}/${year}`;
};
