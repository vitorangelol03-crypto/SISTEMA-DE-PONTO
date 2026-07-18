/**
 * Import de drivers da aba "Pagamentos Driver" (iMile Caratinga).
 *
 * Segue o padrão do import de funcionários (`employeeImport.ts`):
 * - IO wrapper via `FileReader` + `XLSX.read(data, { type: 'binary' })`;
 * - lógica de parse 100% pura (`parseDriverSpreadsheetData`) — sem React, sem
 *   Supabase, sem side effects — para ser testável isoladamente.
 *
 * Convenção de validação (igual ao validator de funcionários):
 * - ERROR  → a linha NÃO entra (`rows`); a mensagem vai pra `errors`.
 * - WARNING → a linha entra normalmente; a mensagem vai pra `warnings` (revisão humana).
 *
 * Dois formatos são aceitos (auto-detectados pelo cabeçalho):
 *
 * 1) PAREADO — a planilha original do Victor ("1 QUINZENA DE JUNHO"). Cada driver
 *    ocupa ≥2 linhas: a linha-driver traz o NOME + o valor/pacote na coluna
 *    "Valor eMile" (a PRESENÇA desse valor marca o início de um driver) + o total
 *    de pacotes; as linhas seguintes (com "Valor eMile" vazio) são as rotas/cidades,
 *    cada uma com seu total de pacotes. Suporta multi-rota (ex.: Fernando = Raul
 *    Soares + Vermelho Novo; Gessiley = Caratinga + Entre Folhas + Vargem Alegre).
 *
 * 2) PLANO — o template gerado por `generateDriverTemplate()`. Uma linha por driver,
 *    colunas explícitas (nome | rota | pacotes_emile | valor_pacote_emile | ...).
 *    Muito mais simples de preencher para os próximos períodos.
 *
 * Armadilha do ID PACOTE: no Excel a coluna costuma vir formatada como número e o
 * valor exibido (`.w`) aparece em notação científica ("7.41413E+11"). Lemos sempre
 * o valor bruto (`raw: true` → `.v`) e convertemos com `packageIdToString`, que
 * NUNCA usa notação científica. O ID é tratado SEMPRE como string.
 */
import * as XLSX from 'xlsx';
import type { DriverSeed, DriverSeedRoute } from '../services/driverPay';

// ─── Constantes de plataforma ────────────────────────────────────────────────

/** Plataforma-base da operação (bate com o header "eMile" da planilha original). */
export const PLATFORM_EMILE = 'eMile';
/** Plataforma secundária (vazia no 1º período; valor/pacote padrão R$ 2,00). */
export const PLATFORM_ANJUN = 'ANJUN';
/** Valor/pacote padrão quando a planilha não informa (regra de negócio do dono). */
export const DEFAULT_RATE = 2.0;

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface DriverImportResult {
  drivers: DriverSeed[];
  errors: string[];
  warnings: string[];
}

type DetectedFormat = 'paired' | 'flat' | 'unknown';

// ─── Helpers puros ───────────────────────────────────────────────────────────

/**
 * Limpa nome/cidade: remove `:` inicial e espaços das bordas, colapsa espaços
 * internos. Preserva o casing original (não força maiúsculas/minúsculas).
 */
export function cleanText(value: unknown): string {
  return String(value == null ? '' : value)
    .replace(/\s+/g, ' ')
    .replace(/^[:\s]+/, '')
    .trim();
}

/** Converte célula em número, ou `null` se vazia/inválida. */
export function toNumberOrNull(value: unknown): number | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (s === '') return null;
  // Aceita vírgula decimal ("2,15") além de ponto.
  const normalized = s.replace(/\s/g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/**
 * Converte o ID do pacote para string SEM notação científica e SEM perda de
 * dígitos. IDs são identificadores, nunca operandos — tratados como texto.
 */
export function packageIdToString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    // toFixed(0) nunca emite notação científica (ao contrário de String()).
    return Number.isInteger(value) ? value.toFixed(0) : String(value);
  }
  const s = String(value).trim();
  return s === '' ? null : s;
}

/** Normaliza um cabeçalho para comparação (minúsculo, `_`→espaço, espaços colapsados). */
function normalizeHeader(value: unknown): string {
  return String(value == null ? '' : value)
    .toLowerCase()
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isBlankRow(row: unknown[]): boolean {
  return !row || row.every((c) => c == null || String(c).trim() === '');
}

/** Índice da 1ª coluna cujo header normalizado bate; senão o default informado. */
function headerIndex(headers: string[], name: string, fallback: number): number {
  const idx = headers.indexOf(name);
  return idx >= 0 ? idx : fallback;
}

// ─── Detecção de formato ─────────────────────────────────────────────────────

function detectFormat(headers: string[]): DetectedFormat {
  // Parear exige a coluna "Valor eMile" (o marcador de linha-driver).
  if (headers.includes('valor emile')) return 'paired';
  // Plano exige as colunas explícitas de pacotes/valor por plataforma.
  if (headers.includes('pacotes emile') || headers.includes('valor pacote emile')) {
    return 'flat';
  }
  return 'unknown';
}

// ─── Parse PAREADO (planilha original) ───────────────────────────────────────

function parsePaired(aoa: unknown[][], headers: string[]): DriverImportResult {
  const cNome = headerIndex(headers, 'nome', 0);
  const cPcEmile = headerIndex(headers, 'pc emile', 1);
  const cValorEmile = headerIndex(headers, 'valor emile', 2);
  const cPctAnjun = headerIndex(headers, 'pct anjun', 3);
  const cValorAnjun = headerIndex(headers, 'valor por pc', 4);
  const cDesconto = headerIndex(headers, 'desconto', 8);
  const cIdPacote = headerIndex(headers, 'id pacote', 9);

  const rows: DriverSeed[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  // Estado do driver em construção + linha humana onde ele começou (p/ mensagens).
  let current: DriverSeed | null = null;
  let currentRow = 0;
  let currentTotalEmile = 0; // total declarado na linha-driver (col "PC eMile")

  const finalize = (): void => {
    if (!current) return;
    const routes = current.routes ?? [];
    const sumEmile = routes.reduce((acc, r) => acc + (r.packages[PLATFORM_EMILE] ?? 0), 0);
    if (routes.length === 0) {
      warnings.push(`Linha ${currentRow}: "${current.name}" sem rota/cidade — driver criado sem rota.`);
    } else if (sumEmile !== currentTotalEmile) {
      warnings.push(
        `Linha ${currentRow}: "${current.name}" — soma das rotas (${sumEmile}) difere do total declarado (${currentTotalEmile}).`,
      );
    }
    // Preenche o campo `route` (rótulo) a partir das cidades.
    current.route = routes.length ? routes.map((r) => r.city).join(', ') : null;
    rows.push(current);
    current = null;
  };

  for (let i = 1; i < aoa.length; i++) {
    const row = aoa[i] ?? [];
    const humanRow = i + 1;
    if (isBlankRow(row)) continue;

    const name = cleanText(row[cNome]);
    if (!name) continue;

    // Cabeçalho repetido no meio (rodapé da planilha) → fecha a seção de dados.
    if (normalizeHeader(name) === 'nome') {
      finalize();
      continue;
    }
    // Rótulos/rodapés livres ("VALOR TOTAL A RECEBER", avisos de prazo).
    if (/^valor\s+total/i.test(name)) continue;

    const rate = toNumberOrNull(row[cValorEmile]);
    const isDriverRow = rate !== null;

    if (isDriverRow) {
      // Fecha o driver anterior antes de abrir o novo.
      finalize();

      if (name.length < 3) {
        errors.push(`Linha ${humanRow}: nome "${name}" inválido (mínimo 3 caracteres).`);
        continue;
      }
      if (rate <= 0) {
        warnings.push(`Linha ${humanRow}: "${name}" com valor/pacote eMile ${rate} (esperado > 0).`);
      }

      const rates: Record<string, number> = { [PLATFORM_EMILE]: rate };
      const anjunRate = toNumberOrNull(row[cValorAnjun]);
      if (anjunRate !== null && anjunRate > 0) rates[PLATFORM_ANJUN] = anjunRate;

      currentTotalEmile = toNumberOrNull(row[cPcEmile]) ?? 0;
      currentRow = humanRow;

      const seed: DriverSeed = { name, route: null, rates, routes: [] };

      const discountAmount = toNumberOrNull(row[cDesconto]);
      if (discountAmount !== null && discountAmount > 0) {
        seed.discount = { amount: discountAmount, package_code: packageIdToString(row[cIdPacote]) };
      }
      current = seed;
    } else {
      // Linha-rota: precisa de um driver corrente e de um total de pacotes numérico.
      const packagesEmile = toNumberOrNull(row[cPcEmile]);
      if (!current) {
        // Texto solto antes de qualquer driver → ignora (rodapé/observação).
        continue;
      }
      if (packagesEmile === null) {
        // Sem contagem de pacotes → não é rota real (aviso de prazo etc.). Ignora.
        continue;
      }
      const packages: Record<string, number> = { [PLATFORM_EMILE]: packagesEmile };
      const packagesAnjun = toNumberOrNull(row[cPctAnjun]);
      if (packagesAnjun !== null) packages[PLATFORM_ANJUN] = packagesAnjun;

      const route: DriverSeedRoute = { city: name, packages };
      (current.routes ??= []).push(route);
    }
  }
  finalize();

  return { drivers: rows, errors, warnings };
}

// ─── Parse PLANO (template) ──────────────────────────────────────────────────

function parseFlat(aoa: unknown[][], headers: string[]): DriverImportResult {
  const cNome = headerIndex(headers, 'nome', 0);
  const cRota = headerIndex(headers, 'rota', 1);
  const cPacotesEmile = headerIndex(headers, 'pacotes emile', 2);
  const cValorEmile = headerIndex(headers, 'valor pacote emile', 3);
  const cPacotesAnjun = headerIndex(headers, 'pacotes anjun', 4);
  const cValorAnjun = headerIndex(headers, 'valor pacote anjun', 5);
  const cDesconto = headerIndex(headers, 'desconto', 6);
  const cIdPacote = headerIndex(headers, 'id pacote', 7);

  const rows: DriverSeed[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  for (let i = 1; i < aoa.length; i++) {
    const row = aoa[i] ?? [];
    const humanRow = i + 1;
    if (isBlankRow(row)) continue;

    const name = cleanText(row[cNome]);
    if (!name) continue;
    if (name.length < 3) {
      errors.push(`Linha ${humanRow}: nome "${name}" inválido (mínimo 3 caracteres).`);
      continue;
    }

    const rateEmileRaw = toNumberOrNull(row[cValorEmile]);
    const rateEmile = rateEmileRaw ?? DEFAULT_RATE;
    if (rateEmileRaw === null) {
      warnings.push(`Linha ${humanRow}: "${name}" sem valor/pacote eMile — aplicado padrão R$ ${DEFAULT_RATE.toFixed(2)}.`);
    } else if (rateEmile <= 0) {
      warnings.push(`Linha ${humanRow}: "${name}" com valor/pacote eMile ${rateEmile} (esperado > 0).`);
    }

    const rates: Record<string, number> = { [PLATFORM_EMILE]: rateEmile };
    const rateAnjun = toNumberOrNull(row[cValorAnjun]);
    if (rateAnjun !== null && rateAnjun > 0) rates[PLATFORM_ANJUN] = rateAnjun;

    const city = cleanText(row[cRota]);
    if (!city) {
      warnings.push(`Linha ${humanRow}: "${name}" sem rota/cidade.`);
    }

    const packagesEmile = toNumberOrNull(row[cPacotesEmile]) ?? 0;
    const packages: Record<string, number> = { [PLATFORM_EMILE]: packagesEmile };
    const packagesAnjun = toNumberOrNull(row[cPacotesAnjun]);
    if (packagesAnjun !== null) packages[PLATFORM_ANJUN] = packagesAnjun;

    const routes: DriverSeedRoute[] = city ? [{ city, packages }] : [];

    const seed: DriverSeed = {
      name,
      route: city || null,
      rates,
      routes,
    };

    const discountAmount = toNumberOrNull(row[cDesconto]);
    if (discountAmount !== null && discountAmount > 0) {
      seed.discount = { amount: discountAmount, package_code: packageIdToString(row[cIdPacote]) };
    }

    rows.push(seed);
  }

  return { drivers: rows, errors, warnings };
}

// ─── Núcleo puro (detecção + dispatch) ───────────────────────────────────────

/**
 * Lógica pura de parse a partir de um array-de-arrays (linhas do Excel). A linha 0
 * é o cabeçalho. Detecta o formato (pareado x plano) e delega. Não faz IO.
 */
export function parseDriverSpreadsheetData(aoa: unknown[][]): DriverImportResult {
  if (!aoa || aoa.length < 2) {
    return { drivers: [], errors: ['Planilha vazia ou sem dados.'], warnings: [] };
  }

  const headers = (aoa[0] ?? []).map(normalizeHeader);
  const format = detectFormat(headers);

  if (format === 'paired') return parsePaired(aoa, headers);
  if (format === 'flat') return parseFlat(aoa, headers);

  return {
    drivers: [],
    errors: [
      'Formato de planilha não reconhecido. Use o template "Baixar modelo" ou a planilha original de pagamentos (com a coluna "Valor eMile").',
    ],
    warnings: [],
  };
}

// ─── IO wrapper (lê o arquivo e chama o núcleo puro) ─────────────────────────

/**
 * Lê o arquivo Excel e devolve os drivers parseados. Aceita o formato pareado
 * (planilha original) e o plano (template). NÃO toca no Supabase — o caller usa
 * `bulkImportDrivers` com o resultado.
 */
export function parseDriverSpreadsheet(file: File): Promise<DriverImportResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          reject(new Error('Planilha sem abas.'));
          return;
        }
        const sheet = workbook.Sheets[firstSheetName];
        if (!sheet) {
          reject(new Error('Não foi possível ler a primeira aba da planilha.'));
          return;
        }
        // raw:true → pega o valor bruto (.v), essencial p/ o ID PACOTE não vir em
        // notação científica. header:1 → array-de-arrays (formato pareado exige).
        // Mantém linhas em branco (default do header:1) para que os números de
        // "Linha N" nas mensagens batam com a linha real do Excel; `isBlankRow`
        // as ignora no parse.
        const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
          header: 1,
          raw: true,
          defval: null,
        });
        resolve(parseDriverSpreadsheetData(aoa));
      } catch (error) {
        reject(
          new Error(
            'Erro ao processar planilha: ' + (error instanceof Error ? error.message : 'Erro desconhecido'),
          ),
        );
      }
    };

    reader.onerror = () => reject(new Error('Erro ao ler arquivo.'));
    reader.readAsBinaryString(file);
  });
}

// ─── Template PLANO (1 linha por driver) ─────────────────────────────────────

const TEMPLATE_HEADERS = [
  'nome',
  'rota',
  'pacotes_emile',
  'valor_pacote_emile',
  'pacotes_anjun',
  'valor_pacote_anjun',
  'desconto',
  'id_pacote',
] as const;

const TEMPLATE_COL_WIDTHS = [34, 22, 14, 18, 14, 18, 12, 18] as const;

/**
 * Gera e baixa um template Excel PLANO (uma linha por driver) para os próximos
 * períodos. Bem mais simples que o formato pareado da planilha original.
 *
 * A coluna `id_pacote` é formatada como TEXTO (`z: '@'`) para o Excel nunca
 * transformar o ID em notação científica.
 */
export function generateDriverTemplate(): void {
  const wb = XLSX.utils.book_new();

  // Exemplos ilustrativos (não são drivers reais — só mostram o preenchimento).
  const example1 = ['MARIA ENTREGADORA EXEMPLO', 'Caratinga', 120, 2.0, 0, 2.0, '', ''];
  const example2 = ['JOÃO ENTREGADOR EXEMPLO', 'Mutum', 340, 2.15, 0, 2.0, 50, '741412525252'];
  const emptyRow = new Array<string>(TEMPLATE_HEADERS.length).fill('');

  const data: (string | number)[][] = [[...TEMPLATE_HEADERS], example1, example2, emptyRow];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = TEMPLATE_COL_WIDTHS.map((wch) => ({ wch }));

  // Cabeçalho em negrito com fundo azul.
  const headerRange = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let col = headerRange.s.c; col <= headerRange.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
    const cell = ws[cellAddress];
    if (!cell) continue;
    cell.s = {
      font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '2563EB' } },
      alignment: { horizontal: 'center', vertical: 'center' },
    };
  }

  // Força a coluna id_pacote (índice 7 = coluna H) como TEXTO em todas as linhas.
  const idCol = TEMPLATE_HEADERS.indexOf('id_pacote');
  for (let r = 1; r <= headerRange.e.r; r++) {
    const addr = XLSX.utils.encode_cell({ r, c: idCol });
    const cell = ws[addr];
    if (cell) {
      cell.t = 's';
      cell.z = '@';
      cell.v = cell.v == null ? '' : String(cell.v);
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Drivers');

  // ─── Aba "Instruções" ──────────────────────────────────────────────────────
  const instructions: string[][] = [
    ['INSTRUÇÕES — IMPORTAÇÃO DE DRIVERS'],
    [''],
    ['CAMPOS:'],
    ['- nome: nome do entregador (obrigatório, mínimo 3 caracteres)'],
    ['- rota: cidade/rota principal (ex.: Caratinga, Mutum, Inhapim)'],
    ['- pacotes_emile: quantidade de pacotes eMile no período (número)'],
    ['- valor_pacote_emile: valor pago por pacote eMile (ex.: 2,00 / 2,15 / 2,50). Se vazio, usa R$ 2,00'],
    ['- pacotes_anjun: pacotes da plataforma ANJUN (0 se não houver)'],
    ['- valor_pacote_anjun: valor por pacote ANJUN (padrão R$ 2,00)'],
    ['- desconto: valor em R$ a descontar (opcional)'],
    ['- id_pacote: identificador do pacote do desconto (TEXTO — pode ter muitos dígitos)'],
    [''],
    ['OBSERVAÇÕES:'],
    ['- Uma linha por driver.'],
    ['- Nomes repetidos são pessoas diferentes (ex.: dois "Carlos Barbosa"). Não são mesclados.'],
    ['- Vales/adiantamentos NÃO entram por aqui — são lançados dentro do sistema.'],
    ['- O total a receber é calculado pelo sistema: (pacotes × valor) − descontos − vales.'],
  ];
  const wsInstr = XLSX.utils.aoa_to_sheet(instructions);
  wsInstr['!cols'] = [{ wch: 90 }];
  if (wsInstr['A1']) {
    wsInstr['A1'].s = { font: { bold: true, sz: 14 }, alignment: { horizontal: 'center' } };
  }
  XLSX.utils.book_append_sheet(wb, wsInstr, 'Instruções');

  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  XLSX.writeFile(wb, `template-drivers-${timestamp}.xlsx`);
}
