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
    const templatePath = '/c6-template.xlsx';
    const response = await fetch(templatePath);

    if (!response.ok) {
      throw new Error('Não foi possível carregar o template do C6');
    }

    const arrayBuffer = await response.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellStyles: true, bookVBA: true });

    const sheetName = 'PIX chave ou código';
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      throw new Error(`Aba "${sheetName}" não encontrada no template`);
    }

    const startRow = 3;

    paymentRows.forEach((row, index) => {
      const rowNum = startRow + index;

      const cellA = `A${rowNum}`;
      const cellB = `B${rowNum}`;
      const cellC = `C${rowNum}`;
      const cellD = `D${rowNum}`;
      const cellE = `E${rowNum}`;

      worksheet[cellA] = { t: 's', v: row.employeeName };
      worksheet[cellB] = { t: 's', v: row.pixKey };
      worksheet[cellC] = { t: 'n', v: row.amount, z: 'R$ #,##0.00' };
      worksheet[cellD] = { t: 's', v: formatDateForExcel(row.paymentDate) };
      worksheet[cellE] = { t: 's', v: row.description || '' };
    });

    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    const newEndRow = startRow + paymentRows.length - 1;
    if (newEndRow > range.e.r) {
      range.e.r = newEndRow;
      worksheet['!ref'] = XLSX.utils.encode_range(range);
    }

    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    const filename = `Pagamento_C6_${dateStr}.xlsx`;

    XLSX.writeFile(workbook, filename);
  } catch (error) {
    console.error('Erro ao processar template:', error);
    throw error;
  }
};

const formatDateForExcel = (dateString: string): string => {
  const [year, month, day] = dateString.split('-');
  return `${day}/${month}/${year}`;
};
