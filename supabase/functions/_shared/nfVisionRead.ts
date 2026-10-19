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
  ANTHROPIC_URL,
  ANTHROPIC_VERSION,
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

// ── Claude (Anthropic) — mesmo trabalho, outra "tomada" (19/10/2026) ──────────
//
// A NF segue o MESMO provedor que o espelho do app (`visionConfigFromEnv`): com
// PROOF_VISION_PROVIDER=claude, a transcrição da nota passa a ser feita pelo Claude,
// igual ao print da Shopee. A família Claude 5 recusa `temperature` (HTTP 400); o
// determinismo vem do `tool_choice` forçado + schema fixo, não do temperature.

/** Transcrição da NF pode ser LONGA (todo o texto da nota) — bem acima do print. */
export const NF_OCR_ANTHROPIC_MAX_TOKENS = 4096;

/** Imagens que o Claude aceita; o resto (ou PDF) é tratado à parte. */
const NF_ANTHROPIC_IMAGE_OK = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

/**
 * A "ferramenta" que OBRIGA o Claude a devolver `{legivel, texto}` — o mesmo papel do
 * `responseSchema` no Gemini. Sem ela o modelo responde texto solto e a transcrição fica
 * frágil; com `tool_choice` forçado, a resposta vem sempre como bloco `tool_use`.
 */
export const NF_OCR_TOOL = {
  name: 'transcrever_nota',
  description: 'Registra a transcrição literal da nota fiscal, sem interpretar nem resumir.',
  input_schema: {
    type: 'object',
    properties: {
      legivel: { type: 'boolean' },
      texto: { type: ['string', 'null'] },
    },
    required: ['legivel'],
  },
} as const;

/**
 * Corpo do POST do Claude (Messages API). PDF vai como bloco `document`; imagem como
 * `image`. Puro: dá pra testar sem rede. O caller real sempre manda PDF.
 */
export function buildNfOcrAnthropicBody(model: string, base64: string, mimeType: string): unknown {
  const doc = mimeType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : {
        type: 'image',
        source: {
          type: 'base64',
          media_type: NF_ANTHROPIC_IMAGE_OK.has(mimeType) ? mimeType : 'image/jpeg',
          data: base64,
        },
      };
  return {
    // Sem `temperature`: a família Claude 5 a recusa com HTTP 400.
    model,
    max_tokens: NF_OCR_ANTHROPIC_MAX_TOKENS,
    tools: [NF_OCR_TOOL],
    tool_choice: { type: 'tool', name: NF_OCR_TOOL.name },
    messages: [{
      role: 'user',
      content: [doc, { type: 'text', text: NF_OCR_PROMPT }],
    }],
  };
}

/** Tira a transcrição do bloco `tool_use` do Claude. Blindado: formato estranho vira `null`. */
export function parseNfOcrAnthropicResponse(payload: unknown): NfOcrRaw | null {
  try {
    const p = payload as { content?: Array<{ type?: string; input?: Record<string, unknown> }> };
    const bloco = p?.content?.find((c) => c?.type === 'tool_use' && c.input && typeof c.input === 'object');
    const obj = bloco?.input;
    if (!obj || typeof obj.legivel !== 'boolean') return null;
    return { legivel: obj.legivel, texto: typeof obj.texto === 'string' ? obj.texto : null };
  } catch {
    return null;
  }
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
  // A NF segue o MESMO provedor do espelho (`visionConfigFromEnv`): desde 19/10/2026,
  // com PROOF_VISION_PROVIDER=claude, a transcrição é feita pelo Claude; se voltar pro
  // Gemini, idem. Sem provedor nenhum (ou sem chave), vai direto pra conferência manual —
  // nunca manda a chave de um provedor pro endpoint do outro.
  if (cfg.provider === 'none' || cfg.apiKeys.length === 0) {
    log('[nf-ocr] sem provedor de visão configurado — nota segue para conferência manual');
    return null;
  }

  const anthropic = cfg.provider === 'anthropic';
  const tentativas = attemptOrder(cfg).slice(0, Math.max(1, cfg.maxAttempts));

  for (const { apiKey, model } of tentativas) {
    try {
      const url = anthropic ? ANTHROPIC_URL : GEMINI_URL(model);
      const headers = anthropic
        ? { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION }
        : { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey };
      const body = JSON.stringify(anthropic
        ? buildNfOcrAnthropicBody(model, base64, mimeType)
        : buildNfOcrBody(base64, mimeType));
      const resp = await fetch(url, { method: 'POST', headers, body });
      if (!resp.ok) {
        // 429 cota · 503 pico · 404 modelo aposentado · 400 -> próximo da fila.
        log(`[nf-ocr] ${model}: HTTP ${resp.status}, tentando o próximo`);
        continue;
      }
      const payload = await resp.json();
      const lido = anthropic ? parseNfOcrAnthropicResponse(payload) : parseNfOcrResponse(payload);
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
