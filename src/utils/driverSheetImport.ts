/**
 * Leitor das planilhas CRUAS das plataformas (iMile / Shopee / Anjun) para a aba
 * Pagamentos Driver. Detecta a plataforma pelo CABECALHO (o usuario so sobe o
 * arquivo, o sistema reconhece sozinho) e agrega os pacotes por
 * (entregador, cidade, plataforma).
 *
 * Cada linha da planilha e 1 pacote. Contamos pacotes DISTINTOS por codigo
 * (waybill/tracking) para nao contar re-scans em dobro. Logica 100% pura
 * (`parseDriverSheetData` a partir de array-de-arrays) — sem React nem Supabase —
 * para ser testavel. O casamento entregador->driver cadastrado fica em
 * `driverNameMatch.ts`.
 *
 * Formatos (colunas-chave), confirmados nas planilhas reais 2026-07-17:
 *  - iMile "Delivered":  DA (entregador) · Recipient City (cidade) · Waybill No. (codigo). 1 plataforma: eMile.
 *  - Shopee "CLAYTON...": Driver Name (entregador) · Cidade Entrega · 3PL Tracking Number (codigo).
 *                         Tipo do Servico = ENTREGA->SHOPEE / COLETA->Coleta Shopee.
 *  - Anjun "Taxas a Pagar": operador de despacho (entregador/login) · Cidade destinataria · numero do negocio (codigo).
 */
import * as XLSX from 'xlsx';

export type DriverSheetPlatform = 'imile' | 'shopee' | 'anjun';

/** Nomes de plataforma no sistema (batem com driverpay_platforms.name). */
export const PLATFORM_IMILE = 'eMile';
export const PLATFORM_SHOPEE = 'SHOPEE';
export const PLATFORM_SHOPEE_COLETA = 'Coleta Shopee';
export const PLATFORM_ANJUN = 'ANJUN';

/** Um agrupamento: pacotes de um entregador numa cidade/plataforma. */
export interface SheetAggregateRow {
  /** Nome/login do entregador exatamente como veio na planilha. */
  driverRaw: string;
  /** Cidade/rota. */
  city: string;
  /** Nome da plataforma no sistema (bate com driverpay_platforms.name). */
  platform: string;
  /** Pacotes distintos (por codigo) deste entregador nesta cidade/plataforma. */
  packages: number;
}

export interface DriverSheetResult {
  platform: DriverSheetPlatform;
  rows: SheetAggregateRow[];
  totalPackages: number;
  /** Entregadores distintos (driverRaw) na planilha. */
  totalDrivers: number;
  warnings: string[];
}

// ─── helpers puros ───────────────────────────────────────────────────────────

const stripAccent = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const normHeader = (v: unknown): string =>
  stripAccent(String(v == null ? '' : v)).toLowerCase().replace(/\s+/g, ' ').trim();
const cleanCell = (v: unknown): string => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

/** Detecta a plataforma pela "impressao digital" do cabecalho (sem acento/caixa). */
export function detectPlatform(headers: unknown[]): DriverSheetPlatform | null {
  const h = new Set(headers.map(normHeader));
  if (h.has('da') && h.has('waybill no.') && h.has('recipient city')) return 'imile';
  if (h.has('tipo do servico') && h.has('driver name') && h.has('cidade entrega')) return 'shopee';
  if (h.has('numero do negocio') && h.has('operador de despacho')) return 'anjun';
  return null;
}

/** Indice da coluna cujo header normalizado bate exatamente com `name` (-1 se ausente). */
function colExact(headers: unknown[], name: string): number {
  const target = normHeader(name);
  return headers.map(normHeader).indexOf(target);
}

/** Indice da 1a coluna cujo header normalizado COMECA com `prefix` (-1 se ausente). */
function colStartsWith(headers: unknown[], prefix: string): number {
  const p = normHeader(prefix);
  return headers.map(normHeader).findIndex((h) => h.startsWith(p));
}

interface RawRecord {
  driverRaw: string;
  city: string;
  platform: string;
  code: string;
}

function aggregate(records: RawRecord[]): {
  rows: SheetAggregateRow[];
  totalPackages: number;
  drivers: Set<string>;
} {
  const map = new Map<string, { row: SheetAggregateRow; codes: Set<string> }>();
  const drivers = new Set<string>();
  let totalPackages = 0;
  for (const r of records) {
    drivers.add(r.driverRaw);
    const key = `${r.driverRaw}|||${r.city}|||${r.platform}`;
    let e = map.get(key);
    if (!e) {
      e = { row: { driverRaw: r.driverRaw, city: r.city, platform: r.platform, packages: 0 }, codes: new Set() };
      map.set(key, e);
    }
    // pacotes DISTINTOS por codigo (evita dupla contagem de re-scan); sem codigo, conta a linha.
    if (r.code) {
      if (!e.codes.has(r.code)) {
        e.codes.add(r.code);
        e.row.packages += 1;
        totalPackages += 1;
      }
    } else {
      e.row.packages += 1;
      totalPackages += 1;
    }
  }
  return { rows: [...map.values()].map((e) => e.row), totalPackages, drivers };
}

function extractImile(aoa: unknown[][], headers: unknown[]): RawRecord[] {
  const cDriver = colExact(headers, 'da');
  const cCity = colExact(headers, 'recipient city');
  const cCode = colExact(headers, 'waybill no.');
  const out: RawRecord[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const row = aoa[i];
    if (!row) continue;
    const driverRaw = cleanCell(row[cDriver]);
    if (!driverRaw) continue;
    out.push({ driverRaw, city: cleanCell(row[cCity]), platform: PLATFORM_IMILE, code: cleanCell(row[cCode]) });
  }
  return out;
}

function extractShopee(aoa: unknown[][], headers: unknown[]): RawRecord[] {
  const cTipo = colExact(headers, 'tipo do servico');
  const cDriver = colExact(headers, 'driver name');
  const cCity = colExact(headers, 'cidade entrega');
  const cCode = colStartsWith(headers, '3pl tracking number');
  const out: RawRecord[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const row = aoa[i];
    if (!row) continue;
    const driverRaw = cleanCell(row[cDriver]);
    if (!driverRaw) continue;
    const tipo = normHeader(row[cTipo]);
    const platform = tipo === 'coleta' ? PLATFORM_SHOPEE_COLETA : PLATFORM_SHOPEE;
    out.push({ driverRaw, city: cleanCell(row[cCity]), platform, code: cCode >= 0 ? cleanCell(row[cCode]) : '' });
  }
  return out;
}

function extractAnjun(aoa: unknown[][], headers: unknown[]): RawRecord[] {
  const cDriver = colExact(headers, 'operador de despacho');
  const cCity = colExact(headers, 'cidade destinataria');
  const cCode = colExact(headers, 'numero do negocio');
  const out: RawRecord[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const row = aoa[i];
    if (!row) continue;
    const driverRaw = cleanCell(row[cDriver]);
    if (!driverRaw) continue;
    out.push({ driverRaw, city: cleanCell(row[cCity]), platform: PLATFORM_ANJUN, code: cleanCell(row[cCode]) });
  }
  return out;
}

/**
 * Nucleo puro: detecta a plataforma pelo cabecalho e agrega os pacotes por
 * (entregador, cidade, plataforma). Lanca Error se o formato nao for reconhecido.
 */
export function parseDriverSheetData(aoa: unknown[][]): DriverSheetResult {
  if (!aoa || aoa.length < 2) throw new Error('Planilha vazia ou sem dados.');
  const headers = aoa[0] ?? [];
  const platform = detectPlatform(headers);
  if (!platform) {
    throw new Error(
      'Planilha nao reconhecida. Envie a planilha crua da iMile (Delivered), da Shopee (CLAYTONBDOSSANTOS) ou da Anjun (Taxas a Pagar).',
    );
  }
  const records =
    platform === 'imile'
      ? extractImile(aoa, headers)
      : platform === 'shopee'
        ? extractShopee(aoa, headers)
        : extractAnjun(aoa, headers);

  const { rows, totalPackages, drivers } = aggregate(records);
  const warnings: string[] = [];
  const noCity = rows.filter((r) => !r.city).length;
  if (noCity > 0) warnings.push(`${noCity} agrupamento(s) sem cidade/rota informada.`);
  return { platform, rows, totalPackages, totalDrivers: drivers.size, warnings };
}

/**
 * IO wrapper: le o arquivo Excel (1a aba) e devolve os agregados. NAO toca no
 * Supabase — o caller casa os nomes (driverNameMatch) e grava (sub-fase 3).
 */
export function parseDriverSheetFile(file: File): Promise<DriverSheetResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target?.result, { type: 'binary' });
        const first = workbook.SheetNames[0];
        const sheet = first ? workbook.Sheets[first] : undefined;
        if (!sheet) {
          reject(new Error('Planilha sem abas legiveis.'));
          return;
        }
        const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
        resolve(parseDriverSheetData(aoa));
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Erro ao processar planilha.'));
      }
    };
    reader.onerror = () => reject(new Error('Erro ao ler o arquivo.'));
    reader.readAsBinaryString(file);
  });
}

/**
 * Igual a `parseDriverSheetFile`, mas roda o processamento pesado num Web Worker —
 * a tela NAO congela durante o parse (essencial para a Shopee, ~132 mil linhas).
 */
export function parseDriverSheetFileInWorker(file: File): Promise<DriverSheetResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./driverSheetImport.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ ok: true; result: DriverSheetResult } | { ok: false; error: string }>) => {
      worker.terminate();
      if (e.data.ok) resolve(e.data.result);
      else reject(new Error(e.data.error));
    };
    worker.onerror = (err) => {
      worker.terminate();
      reject(new Error(err.message || 'Erro no processamento da planilha.'));
    };
    file
      .arrayBuffer()
      .then((buf) => worker.postMessage({ buffer: buf }, [buf]))
      .catch((err) => {
        worker.terminate();
        reject(err instanceof Error ? err : new Error('Erro ao ler o arquivo.'));
      });
  });
}
