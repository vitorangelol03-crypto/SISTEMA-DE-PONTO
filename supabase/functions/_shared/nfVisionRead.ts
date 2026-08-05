/**
 * Ler a NOTA FISCAL quando o PDF vem sem texto (05/08/2026, pedido do Victor).
 *
 * Caso real: o LUCAS AREDES emite a nota, imprime, escaneia e manda o scan como
 * PDF. Medido no arquivo dele: **zero objetos de fonte** e **zero caracteres**
 * extraíveis — 675 KB de imagem embrulhada em PDF. A conferência recusava, com
 * razão, porque não havia valor nenhum para conferir.
 *
 * Decisão dele: **a IA só entra quando a leitura normal falha** — e aí ela lê e a
 * nota segue o fluxo automático de sempre.
 *
 * 🔑 A IA aqui NÃO decide nada. Ela só TRANSCREVE o documento; quem confere valor,
 * CNPJ e nome continua sendo o `runNfCheck`, com as mesmas regras. Se a IA
 * devolvesse "o valor é X", existiriam duas conferências diferentes de dinheiro no
 * sistema, e uma delas ficaria para trás na primeira mudança de regra.
 *
 * Reusa o rodízio de chaves/modelos do `visionRead` — mesma cota, mesmos 429/404/503.
 */
import {
  attemptOrder,
  GEMINI_URL,
  type VisionConfig,
} from './visionRead.ts';

/**
 * Transcrever, não interpretar. O pedido é explícito em não resumir e em manter os
 * números como estão: qualquer "arredondamento gentil" do modelo viraria recusa de
 * nota certa (ou, pior, aprovação de nota errada) lá no `runNfCheck`.
 */
export const NF_OCR_PROMPT = `Este documento e uma NOTA FISCAL brasileira (NFS-e ou NF-e), geralmente escaneada ou fotografada.

Sua tarefa e TRANSCREVER, e nada mais.

REGRAS:
1. Devolva TODO o texto visivel do documento, na ordem em que aparece.
2. NAO resuma, NAO interprete, NAO explique, NAO conserte nada.
3. Copie os NUMEROS exatamente como estao escritos, com a mesma pontuacao:
   "1.234,56" continua "1.234,56"; "12.345.678/0001-90" continua igual.
4. Inclua rotulos e valores juntos, como no papel (ex.: "VALOR TOTAL DA NOTA 1.234,56").
5. Se o documento estiver ilegivel, borrado, cortado, ou se voce nao tiver CERTEZA
   do que esta escrito, responda legivel=false e texto=null. NUNCA invente ou
   adivinhe numero: nota fiscal e dinheiro, e um numero errado aqui e pior do que
   nenhum numero.`;

export const NF_OCR_SCHEMA = {
  type: 'OBJECT',
  properties: {
    legivel: { type: 'BOOLEAN' },
    texto: { type: 'STRING', nullable: true },
  },
  required: ['legivel'],
} as const;

export interface NfOcrRaw {
  legivel: boolean;
  texto: string | null;
}

/** Corpo do POST. Puro: dá pra testar sem rede. */
export function buildNfOcrBody(base64: string, mimeType: string): unknown {
  return {
    contents: [{
      parts: [
        { inline_data: { mime_type: mimeType, data: base64 } },
        { text: NF_OCR_PROMPT },
      ],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: NF_OCR_SCHEMA,
      temperature: 0,
    },
  };
}

/** Tira a transcrição da resposta. Blindado: formato inesperado vira `null`. */
export function parseNfOcrResponse(payload: unknown): NfOcrRaw | null {
  try {
    const p = payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const bruto = p?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof bruto !== 'string' || !bruto.trim()) return null;
    const obj = JSON.parse(bruto) as Partial<NfOcrRaw>;
    if (typeof obj?.legivel !== 'boolean') return null;
    return { legivel: obj.legivel, texto: typeof obj.texto === 'string' ? obj.texto : null };
  } catch {
    return null;
  }
}

/**
 * A transcrição serve para conferir?
 *
 * Exige `legivel` **e** texto com corpo. O piso de 30 caracteres é o MESMO de
 * `nfTextoIlegivel`: transcrição menor que isso não passaria na conferência de
 * qualquer forma, e aceitar aqui só trocaria "não consegui ler" por uma recusa
 * mais confusa lá na frente.
 */
export function nfOcrUsavel(r: NfOcrRaw | null): boolean {
  return !!r && r.legivel === true && typeof r.texto === 'string' && r.texto.trim().length >= 30;
}

/**
 * Transcreve a nota. **Nunca lança.** `null` = não deu — e aí a nota segue o
 * caminho de antes (recusa por ilegível), nunca uma validação no escuro.
 */
export async function readNotaFiscalTexto(
  base64: string,
  mimeType: string,
  cfg: VisionConfig,
  log: (msg: string) => void = () => {},
): Promise<string | null> {
  if (cfg.provider === 'none' || cfg.apiKeys.length === 0) {
    log('[nf-ocr] sem provedor configurado — nota segue para conferência manual');
    return null;
  }

  const body = JSON.stringify(buildNfOcrBody(base64, mimeType));
  const tentativas = attemptOrder(cfg).slice(0, Math.max(1, cfg.maxAttempts));

  for (const { apiKey, model } of tentativas) {
    try {
      const resp = await fetch(GEMINI_URL(model), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body,
      });
      if (!resp.ok) {
        // 429 cota · 503 pico · 404 modelo aposentado -> próximo da fila.
        log(`[nf-ocr] ${model}: HTTP ${resp.status}, tentando o próximo`);
        continue;
      }
      const lido = parseNfOcrResponse(await resp.json());
      if (nfOcrUsavel(lido)) {
        log(`[nf-ocr] ${model}: transcrição ok (${lido!.texto!.length} caracteres)`);
        return lido!.texto;
      }
      log(`[nf-ocr] ${model}: ilegível ou vazio, tentando o próximo`);
    } catch (err) {
      log(`[nf-ocr] ${model}: falhou (${String(err)}), tentando o próximo`);
    }
  }

  log('[nf-ocr] nenhuma tentativa deu certo — nota segue para conferência manual');
  return null;
}
