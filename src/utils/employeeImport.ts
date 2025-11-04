import * as XLSX from 'xlsx';
import { validateCPF, formatCPF } from './validation';

export interface EmployeeImportData {
  name: string;
  cpf: string;
  pixKey: string | null;
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

  const headers = ['Nome Completo', 'CPF', 'Chave PIX (Opcional)'];
  const example = ['João da Silva', '123.456.789-00', 'joao@email.com'];
  const instructions = [
    'INSTRUÇÕES:',
    '1. Preencha uma linha para cada funcionário',
    '2. Nome deve ter pelo menos 3 caracteres',
    '3. CPF deve ser válido (apenas números ou formatado)',
    '4. Chave PIX é opcional (CPF, email, telefone ou chave aleatória)',
    '5. Não altere ou remova esta linha de cabeçalho',
    '6. Salve o arquivo e faça o upload no sistema'
  ];

  const data = [
    headers,
    example,
    [],
    ...instructions.map(inst => [inst, '', ''])
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);

  ws['!cols'] = [
    { wch: 35 },
    { wch: 18 },
    { wch: 30 }
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
            pixKey: pixKey || null
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
