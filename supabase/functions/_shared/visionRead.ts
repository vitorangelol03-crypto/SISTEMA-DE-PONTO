// Leitura do ESPELHO DO APP (print da tela da Shopee) — a "tomada" trocável.
//
// Vive em _shared/ porque as DUAS edge fns leem print: `driver-public-api`
// (driver anexa pelo portal) e `driverpay-proof-admin` (operador anexa pelo painel).
//
// ⚠️ CONTRATO COM O RESTO DO SISTEMA (pedido do Victor em 04/08: "pra longo prazo
// o sistema não travar"): esta função NUNCA lança e NUNCA trava. Quando não dá pra
// ler — sem chave, sem cota, API fora do ar, modelo aposentado, resposta torta —
// ela devolve `null`. O `runProofCheck` transforma `null` em `status: 'pendente'`,
// o print é ACEITO e guardado, e o operador confere na mão no painel com a foto ao
// lado do número esperado. Nenhum driver é recusado por problema nosso.
//
// TROCAR DE PROVEDOR/MODELO É CONFIGURAÇÃO, NÃO CÓDIGO — tudo por variável de
// ambiente (ver `visionConfigFromEnv`).
//
// ── O que foi MEDIDO em 04/08 com o print real do Victor (1808 / 01-15 jul) ──
//  · gemini-3.6-flash acertou 7 de 8 leituras; os outros modelos testados também
//    acertaram o número. A leitura em si é confiável.
//  · TESTE NEGATIVO 4/4: etiqueta de pacote, foto aleatória e foto antiga TODAS
//    voltaram `legivel:false, entregues:null`. A leitora não inventa número — que
//    era o risco mais perigoso da feature.
//  · O erro típico não é valor errado, é a string não fechar: "2026-07-012026-07-01"
//    ou a data seguida de raciocínio vazado. Quem limpa isso é `parseProofDate`
//    (proofCheck.ts), que tolera lixo grudado mas devolve null quando fica ambíguo.
//  · COTA DO PLANO GRÁTIS: `GenerateRequestsPerDayPerProjectPerModel-FreeTier = 20`
//    — 20 leituras por dia POR MODELO, POR PROJETO. Daí o rodízio abaixo: cada
//    modelo (e cada chave) tem a sua cota própria, e elas somam.

import type { ProofReadingRaw } from './proofCheck.ts';

// ─── Configuração ────────────────────────────────────────────────────────────

export type VisionProvider = 'gemini' | 'none';

export interface VisionConfig {
  provider: VisionProvider;
  /** Uma ou mais chaves. Cada chave é um projeto = uma cota diária inteira. */
  apiKeys: string[];
  /** Modelos tentados em ordem. Cada modelo tem cota própria (20/dia no grátis). */
  models: string[];
  /** Teto de tentativas por leitura, somando modelos e chaves. */
  maxAttempts: number;
}

/**
 * Ordem padrão dos modelos. Medida em 04/08 — os primeiros são os que mais
 * acertaram. Todos leram o print certo; a ordem é por estabilidade da resposta.
 * Sobrescrevível por `PROOF_VISION_MODELS` sem tocar em código (é assim que a
 * gente reage a modelo aposentado — o Gemini 2.5 saiu do ar pra contas novas
 * durante estes testes, com HTTP 404).
 */
export const DEFAULT_GEMINI_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite-preview',
  'gemini-3.5-flash-lite',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
];

const splitList = (v: string | undefined): string[] =>
  (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/**
 * Monta a configuração a partir do ambiente. Sem chave nenhuma -> provider 'none'
 * -> modo manual, e o sistema roda igual.
 *
 * Variáveis (secrets do Supabase):
 *   GOOGLE_AI_API_KEY     uma chave, ou várias separadas por vírgula
 *   PROOF_VISION_PROVIDER 'gemini' | 'none'   (padrão: 'gemini' se houver chave)
 *   PROOF_VISION_MODELS   lista separada por vírgula (padrão: DEFAULT_GEMINI_MODELS)
 */
export function visionConfigFromEnv(env: Record<string, string | undefined>): VisionConfig {
  const apiKeys = splitList(env.GOOGLE_AI_API_KEY);
  const pedido = (env.PROOF_VISION_PROVIDER ?? '').trim().toLowerCase();
  const provider: VisionProvider =
    pedido === 'none' || (pedido === '' && apiKeys.length === 0) ? 'none'
      : pedido === 'gemini' || pedido === '' ? 'gemini'
      : 'none';
  const models = splitList(env.PROOF_VISION_MODELS);
  return {
    provider: provider === 'gemini' && apiKeys.length === 0 ? 'none' : provider,
    apiKeys,
    models: models.length ? models : DEFAULT_GEMINI_MODELS,
    maxAttempts: Number(env.PROOF_VISION_MAX_ATTEMPTS ?? 4) || 4,
  };
}

// ─── Pedido ao modelo (partes puras, testáveis sem rede) ─────────────────────

/**
 * O texto do pedido. Escrito contra a tela real: a armadilha aqui é a aba
 * "Em Rota (0)" ao lado de "Encerrado (1808)" — sem o aviso explícito o modelo
 * pode pegar o número errado.
 */
export const PROOF_PROMPT = `Esta imagem e uma foto (ou captura) da tela do aplicativo de entregas da Shopee, usado por um motorista entregador.

Extraia EXATAMENTE tres informacoes:

1. "entregues": o numero inteiro que aparece entre parenteses ao lado da aba "Encerrado".
   Exemplo: se a tela mostra "Encerrado (1808)", o valor e 1808.
   ATENCAO: NAO confunda com a aba "Em Rota (N)" nem com "Ocorrencia". Use somente "Encerrado".

2. "periodoInicio" e "periodoFim": as duas datas do intervalo de datas selecionado, que aparece
   logo abaixo das abas, ao lado do botao "Selecionar data".
   Exemplo: se a tela mostra "2026/07/01 - 2026/07/15", entao periodoInicio = "2026-07-01"
   e periodoFim = "2026-07-15". Devolva SEMPRE no formato AAAA-MM-DD, e nada alem da data.

3. "legivel": true se voce conseguiu ler com confianca os tres valores acima; false se a imagem
   esta borrada, cortada, escura demais, ou nao e a tela do app de entregas.

Se voce nao conseguir ler algum valor com certeza, deixe o campo nulo e ponha legivel = false.
NUNCA adivinhe ou estime um numero.`;

/** Formato fixo da resposta — evita ter que interpretar texto solto. */
export const PROOF_SCHEMA = {
  type: 'OBJECT',
  properties: {
    legivel: { type: 'BOOLEAN' },
    entregues: { type: 'INTEGER', nullable: true },
    periodoInicio: { type: 'STRING', nullable: true },
    periodoFim: { type: 'STRING', nullable: true },
  },
  required: ['legivel'],
} as const;

/** Corpo do POST do Gemini. Puro: dá pra testar sem rede. */
export function buildGeminiBody(imageBase64: string, mimeType: string): unknown {
  return {
    contents: [{
      parts: [
        { inline_data: { mime_type: mimeType, data: imageBase64 } },
        { text: PROOF_PROMPT },
      ],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: PROOF_SCHEMA,
      temperature: 0,
    },
  };
}

/**
 * Tira a leitura de dentro da resposta do Gemini. Puro, e blindado: qualquer
 * formato inesperado vira `null` em vez de exceção.
 */
export function parseGeminiResponse(payload: unknown): ProofReadingRaw | null {
  try {
    const p = payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const texto = p?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof texto !== 'string' || !texto.trim()) return null;
    const obj = JSON.parse(texto) as Record<string, unknown>;
    if (!obj || typeof obj !== 'object') return null;
    return {
      legivel: obj.legivel,
      entregues: obj.entregues,
      periodoInicio: obj.periodoInicio,
      periodoFim: obj.periodoFim,
    };
  } catch {
    return null;
  }
}

/**
 * A leitura é aproveitável? Serve pra decidir se vale gastar outra tentativa em
 * outro modelo. `legivel: false` é resposta LEGÍTIMA (a foto é ruim mesmo) e não
 * merece retry — insistir só queimaria cota e daria o mesmo resultado.
 */
export function readingIsUsable(r: ProofReadingRaw | null): boolean {
  if (r === null) return false;
  if (r.legivel === false) return true; // resposta válida: a foto é que não presta
  return r.entregues !== null && r.entregues !== undefined
    && r.periodoInicio !== null && r.periodoInicio !== undefined
    && r.periodoFim !== null && r.periodoFim !== undefined;
}

// ─── A chamada de verdade (com rodízio) ──────────────────────────────────────

/** Pares (chave, modelo) na ordem de tentativa: varre modelos, depois chaves. */
export function attemptOrder(cfg: VisionConfig): Array<{ apiKey: string; model: string }> {
  const out: Array<{ apiKey: string; model: string }> = [];
  for (const apiKey of cfg.apiKeys) {
    for (const model of cfg.models) out.push({ apiKey, model });
  }
  return out;
}

const GEMINI_URL = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

/**
 * Lê o print. **Nunca lança.** Devolve `null` quando não deu — o chamador
 * transforma isso em "conferir na mão", jamais em recusa.
 *
 * O rodízio existe porque no plano grátis a cota é de 20 leituras por DIA por
 * MODELO por PROJETO. Cada modelo tentado é uma cota nova; cada chave também.
 * Além da cota (429), o rodízio cobre modelo aposentado (404) e pico de demanda
 * (503) — os três aconteceram durante a medição de 04/08.
 */
export async function readProofImage(
  imageBase64: string,
  mimeType: string,
  cfg: VisionConfig,
  log: (msg: string) => void = () => {},
): Promise<ProofReadingRaw | null> {
  if (cfg.provider === 'none' || cfg.apiKeys.length === 0) {
    log('[vision] sem provedor configurado — print vai pra conferência manual');
    return null;
  }

  const body = JSON.stringify(buildGeminiBody(imageBase64, mimeType));
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
        log(`[vision] ${model}: HTTP ${resp.status}, tentando o próximo`);
        continue;
      }

      const leitura = parseGeminiResponse(await resp.json());
      if (readingIsUsable(leitura)) {
        log(`[vision] ${model}: leitura ok`);
        return leitura;
      }
      log(`[vision] ${model}: resposta incompleta, tentando o próximo`);
    } catch (err) {
      log(`[vision] ${model}: falhou (${String(err)}), tentando o próximo`);
    }
  }

  log('[vision] nenhuma tentativa deu certo — print vai pra conferência manual');
  return null;
}
