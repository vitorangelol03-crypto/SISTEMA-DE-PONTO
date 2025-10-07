import * as XLSX from 'xlsx';

interface PaymentRow {
  employeeName: string;
  pixKey: string;
  amount: number;
  paymentDate: string;
  description: string;
}

export const exportC6PaymentSheet = (paymentRows: PaymentRow[]) => {
  const workbook = XLSX.utils.book_new();

  const worksheetData: any[][] = [];

  worksheetData.push(['PREENCHA ESTA PLANILHA COM OS DADOS DO PAGAMENTO - PIX CHAVE OU CÓDIGO']);

  worksheetData.push([
    '⚠️ ATENÇÃO: NÃO ALTERE O TEMPLATE DESTA PLANILHA',
    '',
    '',
    '',
    ''
  ]);

  worksheetData.push([
    '💡 Dica: Preencha os dados conforme orientação de cada coluna',
    '',
    '',
    '',
    ''
  ]);

  worksheetData.push(['']);

  worksheetData.push([
    'Nome do Favorecido',
    'Chave PIX',
    'Valor',
    'Data de Pagamento',
    'Descrição (opcional)'
  ]);

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
    { wch: 35 },
    { wch: 40 },
    { wch: 15 },
    { wch: 20 },
    { wch: 50 }
  ];
  worksheet['!cols'] = columnWidths;

  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');

  const headerCellA1 = 'A1';
  if (worksheet[headerCellA1]) {
    worksheet[headerCellA1].s = {
      font: {
        bold: true,
        sz: 14,
        color: { rgb: 'FFFFFF' }
      },
      fill: {
        fgColor: { rgb: 'FF6600' }
      },
      alignment: {
        horizontal: 'center',
        vertical: 'center'
      }
    };
  }

  const warningCellA2 = 'A2';
  if (worksheet[warningCellA2]) {
    worksheet[warningCellA2].s = {
      font: {
        bold: true,
        sz: 12,
        color: { rgb: 'FF0000' }
      },
      fill: {
        fgColor: { rgb: 'FFF3CD' }
      },
      alignment: {
        horizontal: 'left',
        vertical: 'center'
      }
    };
  }

  const tipCellA3 = 'A3';
  if (worksheet[tipCellA3]) {
    worksheet[tipCellA3].s = {
      font: {
        bold: true,
        sz: 11,
        color: { rgb: '0066CC' }
      },
      fill: {
        fgColor: { rgb: 'E7F3FF' }
      },
      alignment: {
        horizontal: 'left',
        vertical: 'center'
      }
    };
  }

  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: 4, c: col });
    if (worksheet[cellAddress]) {
      worksheet[cellAddress].s = {
        font: {
          bold: true,
          sz: 11,
          color: { rgb: 'FFFFFF' }
        },
        fill: {
          fgColor: { rgb: '4472C4' }
        },
        alignment: {
          horizontal: 'center',
          vertical: 'center'
        },
        border: {
          top: { style: 'thin', color: { rgb: '000000' } },
          bottom: { style: 'thin', color: { rgb: '000000' } },
          left: { style: 'thin', color: { rgb: '000000' } },
          right: { style: 'thin', color: { rgb: '000000' } }
        }
      };
    }
  }

  for (let row = 5; row <= range.e.r; row++) {
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      if (worksheet[cellAddress]) {
        worksheet[cellAddress].s = {
          alignment: {
            horizontal: col === 2 ? 'right' : 'left',
            vertical: 'center'
          },
          border: {
            top: { style: 'thin', color: { rgb: 'CCCCCC' } },
            bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
            left: { style: 'thin', color: { rgb: 'CCCCCC' } },
            right: { style: 'thin', color: { rgb: 'CCCCCC' } }
          }
        };

        if (col === 2) {
          worksheet[cellAddress].z = 'R$ #,##0.00';
        }
      }
    }
  }

  if (!worksheet['!merges']) {
    worksheet['!merges'] = [];
  }
  worksheet['!merges'].push(
    { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 4 } }
  );

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Pagamentos PIX');

  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  const filename = `Pagamento_C6_${dateStr}.xlsx`;

  XLSX.writeFile(workbook, filename);
};

const formatDateForExcel = (dateString: string): string => {
  const [year, month, day] = dateString.split('-');
  return `${day}/${month}/${year}`;
};
