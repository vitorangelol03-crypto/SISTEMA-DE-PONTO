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
      ['PREENCHA ESTA PLANILHA COM OS DADOS DO PAGAMENTO - PIX CHAVE OU CÓDIGO'],
      [
        'Orientações importantes: Não altere o template deste arquivo, isso inclui não adicionar ou remover linhas, colunas e abas, assim como não alterar o nome dos campos',
        '',
        '',
        '',
        ''
      ],
      [
        'Não deixe nenhuma linha em branco entre os pagamentos.',
        '',
        '',
        '',
        ''
      ],
      [
        'Dica: clique sobre o título de cada coluna para visualizar a orientação de preenchimento',
        '',
        '',
        '',
        ''
      ],
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
      { wch: 30 },
      { wch: 30 },
      { wch: 15 },
      { wch: 20 },
      { wch: 25 }
    ];
    worksheet['!cols'] = columnWidths;

    if (!worksheet['!merges']) {
      worksheet['!merges'] = [];
    }
    worksheet['!merges'].push(
      { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 4 } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: 4 } }
    );

    worksheet['A1'].s = {
      font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '000000' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true }
    };

    ['A2', 'A3', 'A4'].forEach(cell => {
      if (worksheet[cell]) {
        worksheet[cell].s = {
          font: { bold: true, sz: 9, color: { rgb: '000000' } },
          fill: { fgColor: { rgb: 'FFFF00' } },
          alignment: { horizontal: 'left', vertical: 'center', wrapText: true }
        };
      }
    });

    for (let col = 0; col < 5; col++) {
      const headerAddress = XLSX.utils.encode_cell({ r: 4, c: col });
      if (worksheet[headerAddress]) {
        worksheet[headerAddress].s = {
          font: { bold: true, sz: 11, color: { rgb: '000000' } },
          fill: { fgColor: { rgb: 'FFFF00' } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: {
            top: { style: 'thin', color: { rgb: '000000' } },
            bottom: { style: 'thin', color: { rgb: '000000' } },
            left: { style: 'thin', color: { rgb: '000000' } },
            right: { style: 'thin', color: { rgb: '000000' } }
          }
        };
      }
    }

    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    for (let row = 5; row <= range.e.r; row++) {
      for (let col = 0; col < 5; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
        if (worksheet[cellAddress]) {
          const cellStyle: any = {
            alignment: { vertical: 'center' },
            border: {
              top: { style: 'thin', color: { rgb: 'D3D3D3' } },
              bottom: { style: 'thin', color: { rgb: 'D3D3D3' } },
              left: { style: 'thin', color: { rgb: 'D3D3D3' } },
              right: { style: 'thin', color: { rgb: 'D3D3D3' } }
            }
          };

          if (col === 2) {
            worksheet[cellAddress].z = '#,##0.00';
            cellStyle.alignment.horizontal = 'right';
          }

          worksheet[cellAddress].s = cellStyle;
        }
      }
    }

    worksheet['!rows'] = [
      { hpt: 30 },
      { hpt: 30 },
      { hpt: 15 },
      { hpt: 15 },
      { hpt: 30 }
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, 'PIX chave ou código');

    const instructionsSheet = XLSX.utils.aoa_to_sheet([
      ['INSTRUÇÕES'],
      [''],
      ['Esta planilha deve ser preenchida com os dados de pagamento via PIX'],
      ['Não altere o formato ou estrutura da planilha'],
      ['Preencha apenas a aba "PIX chave ou código"']
    ]);
    XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'INSTRUÇÕES');

    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    const filename = `c6-template-pagar-salarios-via-pix-${dateStr}.xlsx`;

    XLSX.writeFile(workbook, filename, { bookType: 'xlsx', cellStyles: true });
  } catch (error) {
    console.error('Erro ao gerar planilha:', error);
    throw error;
  }
};

const formatDateForExcel = (dateString: string): string => {
  const [year, month, day] = dateString.split('-');
  return `${day}/${month}/${year}`;
};
