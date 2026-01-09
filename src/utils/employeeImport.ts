import * as XLSX from 'xlsx';
import { validateCPF, formatCPF } from './validation';

export interface EmployeeImportData {
  name: string;
  cpf: string;
  pixKey: string | null;
  pixType?: string | null;
  address?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
}

export interface ValidationError {
  row: number;
  field: string;
  message: string;
  value: string;
}

export interface ImportValidationResult {
  valid: EmployeeImportData[];
  errors: ValidationError[];
  duplicateCPFs: string[];
}

export const generateEmployeeTemplate = (): void => {
  const wb = XLSX.utils.book_new();

  const headers = [
    'Nome Completo',
    'CPF',
    'Chave PIX (Opcional)',
    'Tipo PIX (Opcional)',
    'Endereço (Opcional)',
    'Bairro (Opcional)',
    'Cidade (Opcional)',
    'Estado (Opcional)',
    'CEP (Opcional)',
    'INSTRUÇÕES'
  ];
  const example = [
    'João da Silva',
    '123.456.789-00',
    'joao@email.com',
    'Email',
    'Rua das Flores, 123',
    'Centro',
    'São Paulo',
    'SP',
    '01234-567',
    ''
  ];
  const instructions = [
    ['', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '1. Preencha uma linha para cada funcionário'],
    ['', '', '', '', '', '', '', '', '', '2. Nome e CPF são obrigatórios'],
    ['', '', '', '', '', '', '', '', '', '3. Nome deve ter pelo menos 3 caracteres'],
    ['', '', '', '', '', '', '', '', '', '4. CPF deve ser válido (apenas números ou formatado)'],
    ['', '', '', '', '', '', '', '', '', '5. Chave PIX é opcional'],
    ['', '', '', '', '', '', '', '', '', '6. Tipo PIX: CPF, Email, Telefone ou Aleatória'],
    ['', '', '', '', '', '', '', '', '', '7. Dados de endereço são opcionais'],
    ['', '', '', '', '', '', '', '', '', '8. Não altere ou remova a linha de cabeçalho'],
    ['', '', '', '', '', '', '', '', '', '9. Salve o arquivo e faça o upload no sistema']
  ];

  const data = [
    headers,
    example,
    ...instructions
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);

  ws['!cols'] = [
    { wch: 25 },
    { wch: 15 },
    { wch: 25 },
    { wch: 15 },
    { wch: 30 },
    { wch: 20 },
    { wch: 20 },
    { wch: 10 },
    { wch: 12 },
    { wch: 50 }
  ];

  const headerRange = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let col = headerRange.s.c; col <= headerRange.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
    if (!ws[cellAddress]) continue;
    ws[cellAddress].s = {
      font: { bold: true, sz: 12 },
      fill: { fgColor: { rgb: '4472C4' } },
      alignment: { horizontal: 'center', vertical: 'center' }
    };
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Funcionários');

  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `template-funcionarios-${timestamp}.xlsx`;

  XLSX.writeFile(wb, filename);
};

export const validateEmployeeData = (
  name: string,
  cpf: string,
  pixKey: string,
  row: number
): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (!name || name.trim().length < 3) {
    errors.push({
      row,
      field: 'Nome',
      message: 'Nome deve ter pelo menos 3 caracteres',
      value: name || '(vazio)'
    });
  }

  const cpfNumbers = cpf.replace(/\D/g, '');
  if (!cpfNumbers) {
    errors.push({
      row,
      field: 'CPF',
      message: 'CPF é obrigatório',
      value: '(vazio)'
    });
  } else if (!validateCPF(cpfNumbers)) {
    errors.push({
      row,
      field: 'CPF',
      message: 'CPF inválido',
      value: cpf
    });
  }

  return errors;
};

export const parseEmployeeSpreadsheet = (file: File): Promise<ImportValidationResult> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });

        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as string[][];

        if (jsonData.length < 2) {
          reject(new Error('Planilha vazia ou sem dados'));
          return;
        }

        const headers = jsonData[0];
        if (!headers || headers.length < 2) {
          reject(new Error('Formato de planilha inválido. Use o template fornecido.'));
          return;
        }

        const valid: EmployeeImportData[] = [];
        const errors: ValidationError[] = [];
        const cpfSet = new Set<string>();
        const duplicateCPFs: string[] = [];

        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          const rowNumber = i + 1;

          if (!row || row.length === 0 || !row[0]) {
            continue;
          }

          const name = String(row[0] || '').trim();
          const cpfRaw = String(row[1] || '').trim();
          const pixKey = row[2] ? String(row[2]).trim() : null;
          const pixType = row[3] ? String(row[3]).trim() : null;
          const address = row[4] ? String(row[4]).trim() : null;
          const neighborhood = row[5] ? String(row[5]).trim() : null;
          const city = row[6] ? String(row[6]).trim() : null;
          const state = row[7] ? String(row[7]).trim() : null;
          const zipCode = row[8] ? String(row[8]).trim() : null;

          const rowErrors = validateEmployeeData(name, cpfRaw, pixKey || '', rowNumber);

          if (rowErrors.length > 0) {
            errors.push(...rowErrors);
            continue;
          }

          const cpfNumbers = cpfRaw.replace(/\D/g, '');

          if (cpfSet.has(cpfNumbers)) {
            duplicateCPFs.push(formatCPF(cpfNumbers));
            errors.push({
              row: rowNumber,
              field: 'CPF',
              message: 'CPF duplicado na planilha',
              value: formatCPF(cpfNumbers)
            });
            continue;
          }

          cpfSet.add(cpfNumbers);
          valid.push({
            name,
            cpf: cpfNumbers,
            pixKey: pixKey || null,
            pixType: pixType || null,
            address: address || null,
            neighborhood: neighborhood || null,
            city: city || null,
            state: state || null,
            zipCode: zipCode || null
          });
        }

        resolve({
          valid,
          errors,
          duplicateCPFs: Array.from(new Set(duplicateCPFs))
        });
      } catch (error) {
        reject(new Error('Erro ao processar planilha: ' + (error instanceof Error ? error.message : 'Erro desconhecido')));
      }
    };

    reader.onerror = () => {
      reject(new Error('Erro ao ler arquivo'));
    };

    reader.readAsBinaryString(file);
  });
};

export const generateErrorReport = (
  errors: ValidationError[],
  duplicates: string[]
): void => {
  const wb = XLSX.utils.book_new();

  const errorHeaders = ['Linha', 'Campo', 'Erro', 'Valor'];
  const errorData = [
    errorHeaders,
    ...errors.map(err => [err.row, err.field, err.message, err.value])
  ];

  const ws = XLSX.utils.aoa_to_sheet(errorData);
  ws['!cols'] = [{ wch: 8 }, { wch: 15 }, { wch: 40 }, { wch: 30 }];

  XLSX.utils.book_append_sheet(wb, ws, 'Erros');

  if (duplicates.length > 0) {
    const dupHeaders = ['CPFs Duplicados'];
    const dupData = [dupHeaders, ...duplicates.map(cpf => [cpf])];
    const wsDup = XLSX.utils.aoa_to_sheet(dupData);
    wsDup['!cols'] = [{ wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsDup, 'Duplicados');
  }

  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `erros-importacao-${timestamp}.xlsx`;

  XLSX.writeFile(wb, filename);
};

export const generateImportReport = (
  successCount: number,
  errorCount: number,
  successEmployees: Array<{ name: string; cpf: string }>,
  errorEmployees: Array<{ row: number; name: string; cpf: string; error: string }>
): void => {
  const wb = XLSX.utils.book_new();

  const summaryData = [
    ['RELATÓRIO DE IMPORTAÇÃO'],
    ['Data:', new Date().toLocaleString('pt-BR')],
    [],
    ['Total Processado:', successCount + errorCount],
    ['Importados com Sucesso:', successCount],
    ['Erros:', errorCount],
    []
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary['!cols'] = [{ wch: 25 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo');

  if (successEmployees.length > 0) {
    const successHeaders = ['Nome', 'CPF'];
    const successData = [
      successHeaders,
      ...successEmployees.map(emp => [emp.name, formatCPF(emp.cpf)])
    ];
    const wsSuccess = XLSX.utils.aoa_to_sheet(successData);
    wsSuccess['!cols'] = [{ wch: 35 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, wsSuccess, 'Importados');
  }

  if (errorEmployees.length > 0) {
    const errorHeaders = ['Linha', 'Nome', 'CPF', 'Erro'];
    const errorData = [
      errorHeaders,
      ...errorEmployees.map(emp => [emp.row, emp.name, formatCPF(emp.cpf), emp.error])
    ];
    const wsErrors = XLSX.utils.aoa_to_sheet(errorData);
    wsErrors['!cols'] = [{ wch: 8 }, { wch: 35 }, { wch: 18 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, wsErrors, 'Erros');
  }

  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `relatorio-importacao-${timestamp}.xlsx`;

  XLSX.writeFile(wb, filename);
};
