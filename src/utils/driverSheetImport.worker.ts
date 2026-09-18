/**
 * Web Worker: le e agrega a planilha FORA da thread principal, para a tela nao
 * congelar em arquivos grandes (a Shopee de 09/2026 tem 144.725 linhas x 57
 * colunas / 33 MB). Recebe o ArrayBuffer do arquivo, roda XLSX + parse puro, e
 * devolve o resultado (ou o erro) por postMessage.
 *
 * Avisa a etapa antes de cada trecho pesado (`{ etapa }`): serve pra tela dizer
 * onde esta E pra quem espera saber que o worker ainda esta vivo — se ele morrer
 * por falta de memoria, o navegador NAO avisa (18/09/2026: a tela ficava girando
 * pra sempre).
 */
import * as XLSX from 'xlsx';
import { parseDriverSheetData, type WorkerResponse } from './driverSheetImport';

interface RequestMsg {
  buffer: ArrayBuffer;
}

self.onmessage = (e: MessageEvent<RequestMsg>) => {
  const post = (msg: WorkerResponse) => (self as unknown as Worker).postMessage(msg);
  try {
    post({ etapa: 'lendo' });
    // `dense`: guarda a planilha como array de linhas em vez de um objeto com uma
    // chave por celula. Medido na planilha real de 18/09 (144.725 x 57): 20s e
    // 1,6 GB no lugar de 48s e 2,4 GB — e era esse estouro de memoria que matava
    // o worker calado. Mesma leitura, mesmo resultado.
    const wb = XLSX.read(e.data.buffer, { type: 'array', dense: true });
    const first = wb.SheetNames[0];
    const sheet = first ? wb.Sheets[first] : undefined;
    if (!sheet) throw new Error('Planilha sem abas legiveis.');
    post({ etapa: 'montando' });
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
    post({ etapa: 'somando' });
    post({ ok: true, result: parseDriverSheetData(aoa) });
  } catch (err) {
    post({ ok: false, error: err instanceof Error ? err.message : 'Erro ao processar planilha.' });
  }
};
