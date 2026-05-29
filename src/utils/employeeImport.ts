import * as XLSX from 'xlsx';
import { validateCPF, formatCPF } from './validation';
import {
  validateImportRow,
  type ImportRow,
  type ParsedEmployee,
  type ValidationContext,
} from './employeeImportValidation';

export interface EmployeeImportData {
  name: string;
  cpf: string | null;
  pixKey: string | null;
  pixType?: string | null;
  address?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  // Etapa 2 (combo H — sub-fase 2.18)
  pin?: string | null;
  employmentType?: string | null;
  functionRole?: string | null;
  badgeNumber?: string | null;
  pis?: string | null;
  scheduleType?: string | null;
  expectedSchedule?: number[] | null;
  markingCount?: 2 | 4 | null;
  hireDate?: string | null;     // YYYY-MM-DD
  contractType?: string | null;
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
  // Preenchidos no pós-processamento contra o DB (multi-empresa).
  existingInThisCompany?: EmployeeImportData[];
  existingInOtherCompany?: EmployeeImportData[];
  // Combo H: detalhes por linha (errors + warnings estruturados) quando o caller
  // passa ValidationContext pro parseEmployeeSpreadsheet. Subset rowsWithWarnings
  // são linhas válidas (zero errors) que ainda têm avisos pra revisão humana.
  rowDetails?: ImportRow[];
  rowsWithWarnings?: ImportRow[];
}

// 25 colunas fixas do template (combo H — sub-fase 2.18). Asterisco no nome
// dos obrigatórios pra sinalizar visualmente no Excel.
const TEMPLATE_HEADERS = [
  'nome*',
  'cpf*',
  'pix_chave',
  'pix_tipo',
  'employment_type',
  'endereco',
  'bairro',
  'cidade',
  'estado',
  'cep',
  'pin',
  'funcao',
  'cracha',
  'pis',
  'tipo_escala',
  'jornada_dom',
  'jornada_seg',
  'jornada_ter',
  'jornada_qua',
  'jornada_qui',
  'jornada_sex',
  'jornada_sab',
  'marcacoes_por_dia',
  'data_admissao',
  'tipo_contrato',
] as const;

// Larguras de coluna otimizadas pra jornada_*=12 (cabe número), nome maior, etc.
const TEMPLATE_COL_WIDTHS = [
  30, 15, 25, 12, 18, 30, 18, 18, 8, 12,    // 1-10: básicos
  8, 25, 10, 15, 15,                         // 11-15: pin, função, crachá, pis, escala
  12, 12, 12, 12, 12, 12, 12,                // 16-22: jornadas
  18, 14, 16,                                // 23-25: marcações, admissão, contrato
] as const;

export const generateEmployeeTemplate = (opts: {
  defaultMarkingCount?: 2 | 4;
  defaultSchedule?: number[];
  defaultContractType?: string;
} = {}): void => {
  const wb = XLSX.utils.book_new();

  const sched = opts.defaultSchedule ?? [0, 480, 480, 480, 480, 480, 240];
  const markingCount = opts.defaultMarkingCount ?? 2;
  const contractType = opts.defaultContractType ?? 'CLT';

  // Exemplo 1 — CLT comum, schedule da empresa.
  // CPF e PIS abaixo são REAIS (válidos por algoritmo) — usuário pode usar o
  // template como teste end-to-end sem precisar gerar números válidos.
  const example1 = [
    'MARIA DA SILVA EXEMPLO',
    '11144477735',
    '11144477735',
    'CPF',
    'CLT',
    'RUA EXEMPLO, 123',
    'CENTRO',
    'Caratinga',
    'MG',
    '35300000',
    '1234',
    'AUXILIAR DE LOGÍSTICA',
    '001',
    '12056789010',
    'Normal',
    sched[0] ?? 0,
    sched[1] ?? 480,
    sched[2] ?? 480,
    sched[3] ?? 480,
    sched[4] ?? 480,
    sched[5] ?? 480,
    sched[6] ?? 240,
    markingCount,
    '01/01/2024',
    contractType,
  ];

  // Exemplo 2 — escala 12x36 com 4 marcações; trabalha seg/qua/sex 12h.
  const example2 = [
    'JOÃO PEREIRA EXEMPLO',
    '52998224725',
    'joao@example.com',
    'Email',
    'CLT',
    '',
    '',
    'Caratinga',
    'MG',
    '',
    '5678',
    'VIGIA',
    '002',
    '11135568701',
    '12x36',
    0, 720, 0, 720, 0, 720, 0, // dom, seg, ter, qua, qui, sex, sab
    4,
    '15/03/2023',
    'CLT',
  ];

  // Linha 4 vazia — pronta pra digitação
  const emptyRow = new Array(TEMPLATE_HEADERS.length).fill('');

  const data: (string | number)[][] = [
    [...TEMPLATE_HEADERS],
    example1,
    example2,
    emptyRow,
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = TEMPLATE_COL_WIDTHS.map((wch) => ({ wch }));

  // Cabeçalho em bold com fundo azul; obrigatórios (com '*' no nome) ganham
  // cor de texto vermelha pra reforço visual.
  const headerRange = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let col = headerRange.s.c; col <= headerRange.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
    if (!ws[cellAddress]) continue;
    const isRequired = String(ws[cellAddress].v).endsWith('*');
    ws[cellAddress].s = {
      font: {
        bold: true,
        sz: 11,
        color: isRequired ? { rgb: 'FFFFFF' } : { rgb: 'FFFFFF' },
      },
      fill: { fgColor: { rgb: isRequired ? 'C00000' : '4472C4' } },
      alignment: { horizontal: 'center', vertical: 'center' },
    };
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Funcionários');

  // ─── Sheet "Instruções" ────────────────────────────────────────────────
  const instructionsRows: string[][] = [
    ['INSTRUÇÕES DE IMPORTAÇÃO'],
    [''],
    ['CAMPOS OBRIGATÓRIOS (marcados com *):'],
    ['- nome: nome completo (mínimo 3 caracteres)'],
    ['- cpf: 11 dígitos (com ou sem pontuação)'],
    [''],
    ['CAMPOS DE JORNADA (em minutos):'],
    ['- jornada_dom até jornada_sab: minutos trabalhados naquele dia'],
    ['- 0 = folga, 480 = 8 horas, 240 = 4 horas (sábado típico)'],
    ['- Se vazio, usa jornada padrão da empresa'],
    [''],
    ['MARCAÇÕES POR DIA:'],
    ['- 2 = entrada + saída (1 turno)'],
    ['- 4 = entrada1, saída1 (almoço), entrada2, saída2 (2 turnos com almoço)'],
    ['- Se vazio, usa padrão da empresa'],
    [''],
    ['PIS:'],
    ['- 11 dígitos com dígito verificador correto'],
    ['- Necessário para gerar espelho de ponto CLT'],
    [''],
    ['DATA DE ADMISSÃO:'],
    ['- Formato DD/MM/AAAA ou AAAA-MM-DD'],
    ['- Não pode ser data futura'],
    [''],
    ['TIPO DE CONTRATO:'],
    ['- CLT, PJ, Estagiário, Temporário (qualquer outro vai como warning)'],
    [''],
    ['PIX:'],
    ['- tipo: CPF, Email, Telefone, Aleatória (com acento)'],
    [''],
    ['ESTADOS (UF):'],
    ['- 2 letras maiúsculas: MG, SP, RJ, etc'],
  ];
  const wsInstructions = XLSX.utils.aoa_to_sheet(instructionsRows);
  wsInstructions['!cols'] = [{ wch: 80 }];
  // Título em bold
  if (wsInstructions['A1']) {
    wsInstructions['A1'].s = { font: { bold: true, sz: 14 }, alignment: { horizontal: 'center' } };
  }
  XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instruções');

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

  // CPF é opcional. Se informado, precisa ser válido.
  const cpfNumbers = cpf.replace(/\D/g, '');
  if (cpfNumbers && !validateCPF(cpfNumbers)) {
    errors.push({
      row,
      field: 'CPF',
      message: 'CPF inválido',
      value: cpf
    });
  }

  return errors;
};

/**
 * Parse + valida planilha Excel.
 *
 * Modos:
 * - SEM context (legacy): usa validateEmployeeData (validação básica nome+CPF
 *   das 9 colunas iniciais). Mantido pra retro-compat com callers antigos.
 * - COM context (combo H): usa validateImportRow do validator novo, lendo
 *   todas as 25 colunas do template. Retorna `rowDetails` e `rowsWithWarnings`
 *   no result pra UI mostrar avisos detalhados.
 *
 * Em ambos os modos a função LÊ o arquivo via FileReader e parseia via SheetJS.
 * Não toca no Supabase — caller monta `ValidationContext` antes de chamar
 * (com cross-check de CPFs feito por ele).
 */
export const parseEmployeeSpreadsheet = (
  file: File,
  context?: ValidationContext,
): Promise<ImportValidationResult> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        // cellDates:true faz o SheetJS materializar dates como Date (em vez de
        // number serial), o que ajuda o parseDate do validator a funcionar
        // sem precisar saber de offset Excel.
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true });

        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        if (context) {
          // Modo novo: lê como objects (header → key) e usa validateImportRow.
          const rowsAsObjects = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
            defval: '',
          });
          if (rowsAsObjects.length === 0) {
            reject(new Error('Planilha vazia ou sem dados'));
            return;
          }
          resolve(parseWithValidator(rowsAsObjects, context));
          return;
        }

        // Modo legacy (pré-combo H) — compat com callers antigos.
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

          // CPF é opcional: só checa/registra duplicidade quando há CPF informado.
          if (cpfNumbers && cpfSet.has(cpfNumbers)) {
            duplicateCPFs.push(formatCPF(cpfNumbers));
            errors.push({
              row: rowNumber,
              field: 'CPF',
              message: 'CPF duplicado na planilha',
              value: formatCPF(cpfNumbers)
            });
            continue;
          }

          if (cpfNumbers) cpfSet.add(cpfNumbers);
          valid.push({
            name,
            cpf: cpfNumbers || null,
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

/**
 * Modo novo (combo H) do parser — usa validateImportRow do validator novo.
 * `context.cpfsInThisFile` é mutado durante o loop (acumula CPFs já vistos
 * pra detectar duplicação no próprio arquivo).
 */
function parseWithValidator(
  rows: Array<Record<string, unknown>>,
  contextInput: ValidationContext,
): ImportValidationResult {
  // Clona o set pra não mutar o input do caller (encapsulamento).
  const context: ValidationContext = {
    ...contextInput,
    cpfsInThisFile: new Set(contextInput.cpfsInThisFile),
  };

  const rowDetails: ImportRow[] = [];
  const valid: EmployeeImportData[] = [];
  const rowsWithWarnings: ImportRow[] = [];
  const existingInThisCompany: EmployeeImportData[] = [];
  const existingInOtherCompany: EmployeeImportData[] = [];
  const errors: ValidationError[] = [];
  const duplicateCPFs: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    if (!raw) continue;
    // Linha "completamente vazia" (só strings vazias / nulls) — pula sem warning.
    const hasAnyValue = Object.values(raw).some((v) => v !== '' && v != null);
    if (!hasAnyValue) continue;

    // rowNumber humano: 1 = header, 2 = primeira linha de dados → i + 2
    const rowNumber = i + 2;
    const result = validateImportRow(raw, rowNumber, context);
    rowDetails.push(result);

    // Espelha errors estruturados em ValidationError[] pra retro-compat.
    for (const err of result.errors) {
      errors.push({ row: rowNumber, field: err.field, message: err.message, value: '' });
      if (err.code === 'cpf_duplicate_in_file' && result.parsed.cpf) {
        duplicateCPFs.push(formatCPF(result.parsed.cpf));
      }
    }

    // Se há erro, pula classificação como "valid".
    if (result.errors.length > 0) continue;

    const importData = parsedToImportData(result.parsed);

    // CPF existente na empresa atual já vira ERROR no validator (não chega aqui).
    // Se existe em OUTRA empresa, é só warning — vai pra valid + lista informativa.
    const inOther = result.warnings.some((w) => w.code === 'cpf_exists_other_company');
    if (inOther) existingInOtherCompany.push(importData);

    valid.push(importData);
    if (result.warnings.length > 0) rowsWithWarnings.push(result);

    // Adiciona ao set local de CPFs (permite detectar duplicatas em linhas seguintes).
    context.cpfsInThisFile.add(result.parsed.cpf);
  }

  // existingInThisCompany: linhas que tiveram error 'cpf_exists_in_company'
  // (já foram pra `errors` acima; aqui montamos lista pra UI mostrar separado).
  for (const r of rowDetails) {
    if (r.errors.some((e) => e.code === 'cpf_exists_in_company')) {
      existingInThisCompany.push(parsedToImportData(r.parsed));
    }
  }

  return {
    valid,
    errors,
    duplicateCPFs: Array.from(new Set(duplicateCPFs)),
    existingInThisCompany,
    existingInOtherCompany,
    rowDetails,
    rowsWithWarnings,
  };
}

export function parsedToImportData(p: ParsedEmployee): EmployeeImportData {
  // Campos novos da Etapa 2 (combo H): manter undefined quando ausente, NÃO
  // forçar null. A guarda `if (employee.X !== undefined)` em bulkCreateEmployees
  // depende disso pra preservar os defaults Postgres das colunas (ex:
  // schedule_type='Normal', contract_type='CLT'). Forçar null sobrescrevia.
  return {
    name: p.name,
    cpf: p.cpf || null,
    pixKey: p.pix_key ?? null,
    pixType: p.pix_type ?? null,
    address: p.address ?? null,
    neighborhood: p.neighborhood ?? null,
    city: p.city ?? null,
    state: p.state ?? null,
    zipCode: p.zip_code ?? null,
    pin: p.pin,
    employmentType: p.employment_type,
    functionRole: p.function_role,
    badgeNumber: p.badge_number,
    pis: p.pis,
    scheduleType: p.schedule_type,
    expectedSchedule: p.expected_schedule,
    markingCount: p.marking_count,
    hireDate: p.hire_date,
    contractType: p.contract_type,
  };
}

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
  successEmployees: Array<{ name: string; cpf: string | null }>,
  errorEmployees: Array<{ row: number; name: string; cpf: string | null; error: string }>
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
