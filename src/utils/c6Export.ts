import * as XLSX from 'xlsx';

interface PaymentRow {
  employeeName: string;
  pixKey: string;
  amount: number;
  paymentDate: string;
  description: string;
}

export const exportC6PaymentSheet = async (paymentRows: PaymentRow[]) => {
  try {
    const workbook = XLSX.utils.book_new();

    const worksheetData: any[][] = [
      ['ATENÇÃO: Não altere o cabeçalho desta planilha'],
      ['Nome do funcionário', 'Chave ou código Pix', 'Valor', 'Data de pagamento', 'Descrição (opcional)']
    ];

    paymentRows.forEach(row => {
      worksheetData.push([
        row.employeeName,
        row.pixKey,
        row.amount,
        formatDateForExcel(row.paymentDate),
        row.description || ''
      ]);
    });

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

    const columnWidths = [
      { wch: 40 },
      { wch: 40 },
      { wch: 15 },
      { wch: 20 },
      { wch: 50 }
    ];
    worksheet['!cols'] = columnWidths;

    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');

    for (let col = range.s.c; col <= range.e.c; col++) {
      const headerAddress = XLSX.utils.encode_cell({ r: 1, c: col });
      if (worksheet[headerAddress]) {
        worksheet[headerAddress].s = {
          font: { bold: true, sz: 11 },
          fill: { fgColor: { rgb: 'FFD966' } },
          alignment: { horizontal: 'center', vertical: 'center' }
        };
      }
    }

    for (let row = 2; row <= range.e.r; row++) {
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
        if (worksheet[cellAddress]) {
          if (col === 2) {
            worksheet[cellAddress].z = '#,##0.00';
            worksheet[cellAddress].s = {
              alignment: { horizontal: 'right', vertical: 'center' }
            };
          }
        }
      }
    }

    if (!worksheet['!merges']) {
      worksheet['!merges'] = [];
    }
    worksheet['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } });

    const warningCell = worksheet['A1'];
    if (warningCell) {
      warningCell.s = {
        font: { bold: true, sz: 12 },
        fill: { fgColor: { rgb: 'FFF2CC' } },
        alignment: { horizontal: 'center', vertical: 'center' }
      };
    }

    XLSX.utils.book_append_sheet(workbook, worksheet, 'PIX chave ou código');

    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    const filename = `Pagamento_C6_${dateStr}.xlsx`;

    XLSX.writeFile(workbook, filename, { bookType: 'xlsx', type: 'binary' });
  } catch (error) {
    console.error('Erro ao gerar planilha:', error);
    throw error;
  }
};

const formatDateForExcel = (dateString: string): string => {
  const [year, month, day] = dateString.split('-');
  return `${day}/${month}/${year}`;
};
