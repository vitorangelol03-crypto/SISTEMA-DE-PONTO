/**
 * Web Worker: le e agrega a planilha FORA da thread principal, para a tela nao
 * congelar em arquivos grandes (a Shopee real tem ~132 mil linhas / 29 MB e o
 * parse leva ~1 min). Recebe o ArrayBuffer do arquivo, roda XLSX + parse puro, e
 * devolve o resultado (ou o erro) por postMessage.
 */
import * as XLSX from 'xlsx';
import { parseDriverSheetData, type DriverSheetResult } from './driverSheetImport';

interface RequestMsg {
  buffer: ArrayBuffer;
}
export type WorkerResponse =
  | { ok: true; result: DriverSheetResult }
  | { ok: false; error: string };

self.onmessage = (e: MessageEvent<RequestMsg>) => {
  const post = (msg: WorkerResponse) => (self as unknown as Worker).postMessage(msg);
  try {
    const wb = XLSX.read(e.data.buffer, { type: 'array' });
    const first = wb.SheetNames[0];
    const sheet = first ? wb.Sheets[first] : undefined;
    if (!sheet) throw new Error('Planilha sem abas legiveis.');
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
    post({ ok: true, result: parseDriverSheetData(aoa) });
  } catch (err) {
    post({ ok: false, error: err instanceof Error ? err.message : 'Erro ao processar planilha.' });
  }
};
