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
      throw new Error('Template não encontrado');
    }

    const arrayBuffer = await response.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

    const worksheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[worksheetName];

    const startRow = 5;

    paymentRows.forEach((row, index) => {
      const rowNum = startRow + index;

      worksheet[`A${rowNum}`] = { t: 's', v: row.employeeName };
      worksheet[`B${rowNum}`] = { t: 's', v: row.pixKey };
      worksheet[`C${rowNum}`] = { t: 'n', v: row.amount };
      worksheet[`D${rowNum}`] = { t: 's', v: formatDateForExcel(row.paymentDate) };
      worksheet[`E${rowNum}`] = { t: 's', v: row.description || '' };
    });

    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:E5');
    range.e.r = Math.max(range.e.r, startRow + paymentRows.length - 1);
    worksheet['!ref'] = XLSX.utils.encode_range(range);

    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    const filename = `c6-template-pagar-salarios-via-pix-${dateStr}.xlsx`;

    XLSX.writeFile(workbook, filename);
  } catch (error) {
    console.error('Erro ao gerar planilha:', error);
    throw error;
  }
};

const formatDateForExcel = (dateString: string): string => {
  const [year, month, day] = dateString.split('-');
  return `${day}/${month}/${year}`;
};
